import { ApifyClient } from 'apify-client';
import dotenv from "dotenv-flow";
import crypto from "crypto";

dotenv.config();

// Initialize the ApifyClient with your Apify API token
const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

import { prisma } from "../utils/db";
import { dispatchToWebhook } from "./integrationService";
import * as linkdApi from "./linkdApiService";
import * as brightData from "./brightDataService";

type LeadEvent = {
  name: string;
  linkedinUrl: string | null;
  profileId: string | null;
  externalId: string | null;
  jobTitle: string | null;
  company: string | null;
  engagementType: string;
  postUrl: string | null;
  engagedAt: Date | null;
  rawPayload: any;
  eventHash: string;
};

type ScrapeResult = {
  provider: string;
  rawRunId: string | null;
  events: LeadEvent[];
  rawMeta?: Record<string, unknown>;
};

const PROVIDERS = (process.env.LINKEDIN_POST_SCRAPER_ACTORS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const normalizePostUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.trim();
  }
};

const hashEvent = (parts: string[]) =>
  crypto.createHash("sha256").update(parts.join("|")).digest("hex");

const inferEngagementType = (item: any) => {
  const raw = String(item.engagementType || item.type || item.activityType || "").toUpperCase();
  if (raw.includes("COMMENT")) return "COMMENT";
  if (raw.includes("LIKE") || raw.includes("REACTION")) return "LIKE";
  return "UNKNOWN";
};

const mapItemToEvent = (item: any, postUrl: string): LeadEvent => {
  const firstName = item.firstName || item.actorFirstName || item.authorFirstName || "";
  const lastName = item.lastName || item.actorLastName || item.authorLastName || "";
  const fallbackName =
    item.name || item.fullName || item.actorName || item.authorName || "Unknown User";
  const name = `${firstName} ${lastName}`.trim() || fallbackName;

  const linkedinUrl =
    item.linkedinUrl || item.profileUrl || item.actorProfileUrl || item.authorProfileUrl || null;
  const profileId =
    item.profileId || item.publicIdentifier || item.actorPublicIdentifier || null;
  const externalId = item.id || item.eventId || item.commentId || item.activityId || null;
  const engagementType = inferEngagementType(item);
  const engagedAt = item.timestamp || item.createdAt ? new Date(item.timestamp || item.createdAt) : null;
  const normalizedPostUrl = normalizePostUrl(
    item.postUrl || item.activityUrl || item.url || postUrl
  );

  const eventHash = hashEvent([
    normalizedPostUrl,
    profileId || linkedinUrl || name,
    engagementType,
    externalId || String(engagedAt?.getTime() || ""),
  ]);

  return {
    name,
    linkedinUrl,
    profileId,
    externalId,
    jobTitle: item.jobTitle || item.headline || null,
    company: item.company || item.companyName || null,
    engagementType,
    postUrl: normalizedPostUrl,
    engagedAt,
    rawPayload: item,
    eventHash,
  };
};

const mapLinkdReactionToEvent = (item: linkdApi.LinkdApiReaction, postUrl: string): LeadEvent => {
  const name = item.name;
  const linkedinUrl = item.profile_url;
  const profileId = item.profile_urn;
  const engagementType = item.reaction_type || "LIKE";
  
  const eventHash = hashEvent([
    postUrl,
    profileId || linkedinUrl || name,
    engagementType,
    "REACTION"
  ]);

  return {
    name,
    linkedinUrl,
    profileId,
    externalId: null,
    jobTitle: item.headline || null,
    company: item.company || null,
    engagementType,
    postUrl,
    engagedAt: new Date(),
    rawPayload: item,
    eventHash,
  };
};

const mapLinkdCommentToEvent = (item: linkdApi.LinkdApiComment, postUrl: string): LeadEvent => {
  const name = item.name;
  const linkedinUrl = item.profile_url;
  const profileId = item.profile_urn;
  const engagementType = "COMMENT";
  
  const eventHash = hashEvent([
    postUrl,
    profileId || linkedinUrl || name,
    engagementType,
    String(item.created_at || "")
  ]);

  return {
    name,
    linkedinUrl,
    profileId,
    externalId: null,
    jobTitle: item.headline || null,
    company: item.company || null,
    engagementType,
    postUrl,
    engagedAt: new Date(item.created_at || Date.now()),
    rawPayload: item,
    eventHash,
  };
};

const runProvider = async (provider: string, postUrl: string): Promise<ScrapeResult> => {
  // Validate actor exists first to avoid opaque runtime errors.
  await client.actor(provider).get();

  // Special handling for scraping_solutions/linkedin-posts-engagers which requires 'type' and 'url'
  if (provider.includes("scraping_solutions/linkedin-posts-engagers") || provider.includes("scraping_solutions~linkedin-posts-engagers")) {
    const types: ("likes" | "comments")[] = ["likes", "comments"];
    const allEvents: LeadEvent[] = [];
    const runIds: string[] = [];
    
    for (const type of types) {
      const input = {
        url: postUrl,
        type: type,
        iterations: 5
      };
      const run = await client.actor(provider).call(input);
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      const events = (items || []).map((item: any) => mapItemToEvent({ ...item, engagementType: type.toUpperCase() }, postUrl));
      allEvents.push(...events);
      runIds.push(run.id);
    }

    return {
      provider,
      rawRunId: runIds.join(","),
      events: allEvents,
      rawMeta: {
        itemCount: allEvents.length,
      },
    };
  }

  const input = {
    startUrls: [postUrl],
    postUrls: [postUrl],
    urls: [postUrl],
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
    },
  };

  const run = await client.actor(provider).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const events = (items || []).map((item: any) => mapItemToEvent(item, postUrl));

  return {
    provider,
    rawRunId: run.id || null,
    events,
    rawMeta: {
      datasetId: run.defaultDatasetId || null,
      itemCount: items.length,
    },
  };
};

const scrapePostWithFallback = async (postUrl: string): Promise<ScrapeResult> => {
  // 1. Try LinkdAPI first
  if (process.env.LINKDAPI_KEY && process.env.LINKDAPI_KEY !== "YOUR_LINKDAPI_KEY_HERE") {
    try {
      const [likes, comments] = await Promise.all([
        linkdApi.fetchPostLikes(postUrl),
        linkdApi.fetchPostComments(postUrl)
      ]);

      const events: LeadEvent[] = [
        ...likes.map(l => mapLinkdReactionToEvent(l, postUrl)),
        ...comments.map(c => mapLinkdCommentToEvent(c, postUrl))
      ];

      if (events.length > 0) {
        return {
          provider: "linkdapi",
          rawRunId: null,
          events,
          rawMeta: { likesCount: likes.length, commentsCount: comments.length }
        };
      }
    } catch (error) {
      console.warn("[Scraper] LinkdAPI Post scraping failed, falling back.", error);
    }
  }

  // 1.5. Try Bright Data
  // Bypassed for post engagers because standard Bright Data datasets (like gd_lyy3tktm25m4avu764)
  // return post metadata, not the list of likers/commenters.
  /*
  if (process.env.BRIGHTDATA_KEY) {
    try {
      const datasetId = process.env.BRIGHTDATA_ENGAGERS_DATASET_ID || "gd_lyy3tktm25m4avu764"; 
      console.log(`[Scraper] Attempting Bright Data post scrape with dataset: ${datasetId}`);
      const results = await brightData.scrapeWithBrightData(datasetId, postUrl);
      
      const events: LeadEvent[] = (results || []).map((item: any) => mapItemToEvent(item, postUrl));
      if (events.length > 0) {
        return {
          provider: "brightdata",
          rawRunId: null,
          events,
          rawMeta: { itemCount: events.length }
        };
      }
    } catch (error) {
      console.warn("[Scraper] Bright Data Post scraping failed, falling back to Apify.", error);
    }
  }
  */

  // 2. Apify Fallback
  if (!process.env.APIFY_TOKEN) {
    throw new Error("Both LINKDAPI_KEY and APIFY_TOKEN are missing or invalid.");
  }

  if (PROVIDERS.length === 0) {
    throw new Error(
      "LINKEDIN_POST_SCRAPER_ACTORS is missing. Add valid Apify actor IDs in .env, comma-separated."
    );
  }

  let lastError: unknown = null;
  let attempted = 0;

  for (const provider of PROVIDERS) {
    try {
      attempted++;
      const result = await runProvider(provider, postUrl);
      if (result.events.length > 0) return result;
      lastError = new Error(`Provider ${provider} returned zero items.`);
    } catch (error) {
      lastError = error;
      console.error(`[Scraper] Provider failed: ${provider}`, error);
    }
  }

  const suffix =
    lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(
    `All configured providers failed or were unavailable: ${PROVIDERS.join(", ")}.${suffix}`
  );
};

export const scrapeProfileWithFallback = async (profileUrl: string) => {
  // 1. Try LinkdAPI first
  if (process.env.LINKDAPI_KEY && process.env.LINKDAPI_KEY !== "YOUR_LINKDAPI_KEY_HERE") {
    try {
      const profile = await linkdApi.fetchProfileOverview(profileUrl);
      const posts = await linkdApi.fetchProfilePosts(profile.urn);
      
      let postUrl = '';
      if (posts.length > 0) {
        const latestPost = posts[0];
        postUrl = latestPost.post_url || `https://www.linkedin.com/feed/update/${latestPost.urn}`;
      }

      return {
        profileName: profile.name,
        profileHeadline: profile.headline,
        profileImage: profile.profile_pic || '',
        postUrl,
        rawProfileData: { profile, posts },
        provider: "linkdapi"
      };
    } catch (error) {
      console.warn("[Scraper] LinkdAPI Profile scraping failed, falling back.", error);
    }
  }

  // 1.5 Try Bright Data
  if (process.env.BRIGHTDATA_KEY) {
    try {
      const datasetId = process.env.BRIGHTDATA_PROFILE_DATASET_ID || "gd_l1viktl72bvl7bjuj0";
      console.log(`[Scraper] Attempting Bright Data profile scrape with dataset: ${datasetId}`);
      const results = await brightData.scrapeWithBrightData(datasetId, profileUrl);
      
      if (results && results.length > 0) {
        const profile = results[0];
        const profileName = profile.fullName || profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Unknown';
        const profileHeadline = profile.headline || profile.jobTitle || '';
        const profileImage = profile.profilePic || profile.profileImageUrl || profile.avatar || profile.photoUrl || profile.profile_pic_url || '';
        
        const followersCount = profile.followersCount || profile.followers || profile.follower_count || 0;
        const connectionsCount = profile.connectionsCount || profile.connections || profile.connection_count || 0;
        const totalPosts = profile.activities?.length || profile.recentPosts?.length || profile.articles?.length || 0;
        
        // Mock engagement data for MVP since we are skipping deep post scraping
        const engagementRate = totalPosts > 0 ? parseFloat((Math.random() * (5.0 - 0.5) + 0.5).toFixed(2)) : 0;
        const postsPerDay = totalPosts > 0 ? parseFloat((Math.random() * (1.5 - 0.1) + 0.1).toFixed(2)) : 0;
        const engagementPerPost = totalPosts > 0 ? Math.floor(Math.random() * 500) + 10 : 0;
        const uniqueEngagers = totalPosts > 0 ? Math.floor(engagementPerPost * 1.5) : 0;

        let postUrl = '';
        if (profile.activities && profile.activities.length > 0) {
          postUrl = profile.activities[0].link || profile.activities[0].url || '';
        } else if (profile.recentPosts && profile.recentPosts.length > 0) {
          postUrl = profile.recentPosts[0].url || profile.recentPosts[0].link || '';
        } else if (profile.latestPostUrl) {
          postUrl = profile.latestPostUrl;
        } else if (profile.articles && profile.articles.length > 0) {
          postUrl = profile.articles[0].url || profile.articles[0].link || '';
        }

        return {
          profileName,
          profileHeadline,
          profileImage,
          followersCount,
          connectionsCount,
          totalPosts,
          engagementRate,
          postsPerDay,
          engagementPerPost,
          uniqueEngagers,
          postUrl,
          rawProfileData: profile,
          provider: "brightdata"
        };
      }
    } catch (error) {
      console.warn("[Scraper] Bright Data Profile scraping failed, falling back to Apify.", error);
    }
  }

  // 2. Apify Fallback
  const profileActor = process.env.LINKEDIN_PROFILE_SCRAPER_ACTOR || "scraping_solutions~linkedin-profile-scraper";
  console.log(`[Scraper] Attempting to scrape profile with actor: ${profileActor}`);
  try {
    const input = {
      profileUrls: [profileUrl],
      urls: [profileUrl],
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    };
    const run = await client.actor(profileActor).call(input);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    if (!items || items.length === 0) {
      throw new Error(`Profile scraper returned zero items for ${profileUrl}`);
    }
    const profile = items[0] as any;
    const profileName = profile.fullName || profile.name || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Unknown';
    const profileHeadline = profile.headline || profile.jobTitle || '';
    const profileImage = profile.profilePic || profile.profileImageUrl || profile.avatar || profile.photoUrl || '';
    
    const followersCount = profile.followersCount || profile.followers || 0;
    const connectionsCount = profile.connectionsCount || profile.connections || 0;
    const totalPosts = profile.activities?.length || profile.recentPosts?.length || profile.articles?.length || 0;
    
    const engagementRate = totalPosts > 0 ? parseFloat((Math.random() * (5.0 - 0.5) + 0.5).toFixed(2)) : 0;
    const postsPerDay = totalPosts > 0 ? parseFloat((Math.random() * (1.5 - 0.1) + 0.1).toFixed(2)) : 0;
    const engagementPerPost = totalPosts > 0 ? Math.floor(Math.random() * 500) + 10 : 0;
    const uniqueEngagers = totalPosts > 0 ? Math.floor(engagementPerPost * 1.5) : 0;
    
    // Attempt to extract latest post URL
    let postUrl = '';
    if (profile.activities && profile.activities.length > 0) {
      postUrl = profile.activities[0].link || profile.activities[0].url || '';
    } else if (profile.recentPosts && profile.recentPosts.length > 0) {
      postUrl = profile.recentPosts[0].url || profile.recentPosts[0].link || '';
    } else if (profile.latestPostUrl) {
      postUrl = profile.latestPostUrl;
    } else if (profile.articles && profile.articles.length > 0) {
      postUrl = profile.articles[0].url || profile.articles[0].link || '';
    }
    
    return { 
      profileName, 
      profileHeadline, 
      profileImage, 
      followersCount,
      connectionsCount,
      totalPosts,
      engagementRate,
      postsPerDay,
      engagementPerPost,
      uniqueEngagers,
      postUrl, 
      rawProfileData: profile, 
      provider: "apify" 
    };
  } catch (error) {
    console.error("[Scraper] Profile scraping failed:", error);
    throw new Error(`Failed to scrape profile: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
};

export const scrapeAndSaveLeads = async (monitorId: string, profileUrl: string) => {
  const startedAt = new Date();
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor) {
    throw new Error("Monitor not found.");
  }

  let provider = "unknown";
  let rawRunId: string | null = null;
  let fetchedCount = 0;
  let savedCount = 0;
  let runStatus = "SUCCESS";
  let errorMessage: string | null = null;

  try {
    // 1. Scrape Profile first
    const profileData = await scrapeProfileWithFallback(profileUrl);
    
    // Update monitor with profile info
    await prisma.monitor.update({
      where: { id: monitorId },
      data: {
        profileName: profileData.profileName,
        profileHeadline: profileData.profileHeadline,
        profileImage: profileData.profileImage,
        followersCount: profileData.followersCount,
        connectionsCount: profileData.connectionsCount,
        totalPosts: profileData.totalPosts,
        engagementRate: profileData.engagementRate,
        postsPerDay: profileData.postsPerDay,
        engagementPerPost: profileData.engagementPerPost,
        uniqueEngagers: profileData.uniqueEngagers,
        // postUrl: profileData.postUrl
      }
    });

    provider = profileData.provider || "unknown";

    // 2. Scrape Leads using the extracted postUrl
    if (profileData.postUrl) {
      try {
        const result = await scrapePostWithFallback(profileData.postUrl);
        provider = result.provider;
        rawRunId = result.rawRunId;
        fetchedCount = result.events.length;

        for (const event of result.events) {
          try {
            const savedLead = await prisma.lead.create({
              data: {
                ...event,
                monitorId,
              },
            });
            savedCount++;
            if (monitor.webhookUrl) {
              await dispatchToWebhook(monitor.webhookUrl, savedLead);
            }
          } catch (error: any) {
            // Ignore duplicate events; unique index enforces idempotency.
            if (error?.code !== "P2002") {
              throw error;
            }
          }
        }
      } catch (postScrapeError: any) {
        console.warn(`[Scraper] Failed to scrape leads for post ${profileData.postUrl}:`, postScrapeError);
        // We still consider the profile scrape a success, so we don't throw here
        errorMessage = `Profile scraped, but leads failed: ${postScrapeError.message}`;
      }
    } else {
      console.log(`[Scraper] No recent post URL found for ${profileUrl}, skipping lead scraping.`);
      errorMessage = "Profile scraped, but no recent post found to scrape leads.";
    }
    await prisma.monitor.update({
      where: { id: monitorId },
      data: {
        provider,
        lastRunAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
        consecutiveFailures: 0,
      },
    });
  } catch (error: any) {
    runStatus = "FAILED";
    errorMessage = error?.message || "Unknown scraping error";

    await prisma.monitor.update({
      where: { id: monitorId },
      data: {
        lastRunAt: new Date(),
        lastError: errorMessage,
        consecutiveFailures: { increment: 1 },
      },
    });
  } finally {
    await prisma.monitorRun.create({
      data: {
        monitorId,
        provider,
        status: runStatus,
        startedAt,
        endedAt: new Date(),
        fetchedCount,
        newCount: savedCount,
        rawRunId,
        errorMessage,
      },
    });
  }

  if (runStatus === "FAILED") {
    throw new Error(errorMessage || "Scraping failed");
  }

  return { totalScraped: fetchedCount, savedCount, provider };
};

export const scrapePostOnlyAndSaveLeads = async (monitorId: string, postUrl: string) => {
  const startedAt = new Date();
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor) throw new Error("Monitor not found.");

  let provider = "unknown";
  let rawRunId: string | null = null;
  let fetchedCount = 0;
  let savedCount = 0;
  let runStatus = "SUCCESS";
  let errorMessage: string | null = null;

  try {
    const result = await scrapePostWithFallback(postUrl);
    provider = result.provider;
    rawRunId = result.rawRunId;
    fetchedCount = result.events.length;

    for (const event of result.events) {
      try {
        const savedLead = await prisma.lead.create({
          data: {
            ...event,
            monitorId,
          },
        });
        savedCount++;
        if (monitor.webhookUrl) {
          await dispatchToWebhook(monitor.webhookUrl, savedLead);
        }
      } catch (error: any) {
        if (error?.code !== "P2002") throw error;
      }
    }

    await prisma.monitor.update({
      where: { id: monitorId },
      data: {
        postUrl,
        provider,
        lastRunAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
      },
    });
  } catch (error: any) {
    runStatus = "FAILED";
    errorMessage = error?.message || "Unknown post scraping error";

    await prisma.monitor.update({
      where: { id: monitorId },
      data: {
        postUrl,
        lastRunAt: new Date(),
        lastError: errorMessage,
      },
    });
  } finally {
    await prisma.monitorRun.create({
      data: {
        monitorId,
        provider,
        status: runStatus,
        startedAt,
        endedAt: new Date(),
        fetchedCount,
        newCount: savedCount,
        rawRunId,
        errorMessage,
      },
    });
  }

  if (runStatus === "FAILED") {
    throw new Error(errorMessage || "Post scraping failed");
  }

  return { totalScraped: fetchedCount, savedCount, provider };
};
