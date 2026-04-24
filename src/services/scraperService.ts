import dotenv from "dotenv-flow";
import crypto from "crypto";
import { prisma } from "../utils/db";
import { dispatchToWebhook } from "./integrationService";
import * as linkdApi from "./linkdApiService";
import * as enrichment from "./enrichmentService";
import * as aiEnrichment from "./aiEnrichment";

dotenv.config();

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

const normalizePostUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    let path = parsed.pathname;
    if (path.endsWith('/')) path = path.slice(0, -1);
    return `${parsed.origin}${path}`;
  } catch {
    return url.trim();
  }
};

const hashEvent = (parts: string[]) =>
  crypto.createHash("sha256").update(parts.join("|")).digest("hex");

const mapLinkdReactionToEvent = (item: linkdApi.LinkdApiReaction, postUrl: string): LeadEvent => {
  const actor = item.actor || {} as any;
  const name = actor.name || "Unknown User";
  const linkedinUrl = actor.url || null;
  const profileId = actor.urn || null;
  const engagementType = item.reactionType || "LIKE";
  
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
    jobTitle: actor.headline || null,
    company: null,
    engagementType,
    postUrl,
    engagedAt: new Date(),
    rawPayload: item,
    eventHash,
  };
};

const mapLinkdCommentToEvent = (item: linkdApi.LinkdApiComment, postUrl: string): LeadEvent => {
  const author = item.author || {} as any;
  const name = author.name || "Unknown User";
  const linkedinUrl = author.url || null;
  const profileId = author.urn || null;
  const engagementType = "COMMENT";
  
  const eventHash = hashEvent([
    postUrl,
    profileId || linkedinUrl || name,
    engagementType,
    String(item.createdAt || "")
  ]);

  return {
    name,
    linkedinUrl,
    profileId,
    externalId: null,
    jobTitle: author.headline || null,
    company: null,
    engagementType,
    postUrl,
    engagedAt: new Date(item.createdAt || Date.now()),
    rawPayload: item,
    eventHash,
  };
};

export const scrapePostWithLinkdOnly = async (postUrl: string) => {
  console.log(`[Scraper] Using LinkdAPI for post: ${postUrl}`);
  
  const [likes, comments] = await Promise.all([
    linkdApi.fetchPostLikes(postUrl),
    linkdApi.fetchPostComments(postUrl)
  ]);

  const events: LeadEvent[] = [
    ...likes.map(l => mapLinkdReactionToEvent(l, postUrl)),
    ...comments.map(c => mapLinkdCommentToEvent(c, postUrl))
  ];

  console.log(`[Scraper] LinkdAPI found ${likes.length} likes and ${comments.length} comments.`);
  return { provider: "linkdapi", events };
};

export const scrapeProfileWithLinkdOnly = async (profileUrl: string) => {
  console.log(`[Scraper] Using LinkdAPI for profile: ${profileUrl}`);
  
  const profile = await linkdApi.fetchProfileOverview(profileUrl);
  const posts = profile.urn ? await linkdApi.fetchProfilePosts(profile.urn) : [];
  
  const postUrls: string[] = [];
  if (posts.length > 0) {
    const topPosts = posts.slice(0, 5);
    for (const p of topPosts) {
      postUrls.push(p.url || `https://www.linkedin.com/feed/update/${p.urn}`);
    }
  }

  return {
    profileName: profile.fullName || "Unknown Profile",
    profileHeadline: profile.headline || "",
    profileImage: profile.profilePictureURL || '',
    postUrls,
    rawProfileData: { profile, posts },
    provider: "linkdapi"
  };
};

export const scrapeAndSaveLeads = async (monitorId: string, profileUrl: string) => {
  const startedAt = new Date();
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor) throw new Error("Monitor not found.");

  let fetchedCount = 0;
  let savedCount = 0;

  try {
    // 1. Scrape Profile
    const profileData = await scrapeProfileWithLinkdOnly(profileUrl);
    
    await prisma.monitor.update({
      where: { id: monitorId },
      data: {
        profileName: profileData.profileName,
        profileHeadline: profileData.profileHeadline,
        profileImage: profileData.profileImage,
        provider: "linkdapi",
        lastRunAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
        consecutiveFailures: 0,
      }
    });

    // 2. Scrape Leads
    const allEvents: LeadEvent[] = [];
    if (profileData.postUrls && profileData.postUrls.length > 0) {
      for (const url of profileData.postUrls) {
        try {
          const result = await scrapePostWithLinkdOnly(url);
          allEvents.push(...result.events);
        } catch (error) {
          console.error(`[Scraper] Failed to scrape post ${url}:`, error);
        }
      }
      fetchedCount = allEvents.length;

      // 3. Batch Enrich & Classify
      // Deduplicate by linkedinUrl so we only enrich each person once
      const uniqueUrls = Array.from(new Set(allEvents.map(e => e.linkedinUrl).filter((u): u is string => !!u)));
      const enrichmentMap = await enrichment.enrichProfilesBatch(uniqueUrls);

      for (const event of allEvents) {
        try {
          const enrichedData = event.linkedinUrl ? enrichmentMap[event.linkedinUrl] : null;
          
          let icpStatus = "MAYBE";
          let icpReasoning = "Enrichment data missing.";
          
          if (enrichedData) {
            const aiResult = await aiEnrichment.classifyLead(enrichedData.raw, monitor.icpDefinition || "");
            icpStatus = aiResult.status;
            icpReasoning = aiResult.reasoning;
          }

          const savedLead = await prisma.lead.create({
            data: {
              ...event,
              jobTitle: enrichedData?.jobTitle || event.jobTitle,
              company: enrichedData?.company || event.company,
              monitorId,
              seniority: enrichedData?.seniority || null,
              function: enrichedData?.function || null,
              region: enrichedData?.region || null,
              companyWebsite: enrichedData?.companyWebsite || null,
              companyIndustry: enrichedData?.companyIndustry || null,
              companySize: enrichedData?.companySize || null,
              companyHq: enrichedData?.companyHq || null,
              icpStatus: icpStatus as any,
              icpReasoning: icpReasoning,
              rawPayload: enrichedData?.raw || event.rawPayload
            },
          });
          savedCount++;
          if (monitor.webhookUrl) await dispatchToWebhook(monitor.webhookUrl, savedLead);
        } catch (error: any) {
          if (error?.code !== "P2002") console.error("[Scraper] Lead save error:", error);
        }
      }
    }

    await prisma.monitorRun.create({
      data: {
        monitorId,
        provider: "linkdapi",
        status: "SUCCESS",
        startedAt,
        endedAt: new Date(),
        fetchedCount,
        newCount: savedCount,
      }
    });
  } catch (error: any) {
    console.error("[Scraper] Monitor cycle failed:", error);
    await prisma.monitor.update({
      where: { id: monitorId },
      data: {
        lastRunAt: new Date(),
        lastError: error.message,
        consecutiveFailures: { increment: 1 },
      },
    });
    throw error;
  }

  return { totalScraped: fetchedCount, savedCount, provider: "linkdapi" };
};

export const scrapePostOnlyAndSaveLeads = async (monitorId: string, postUrl: string) => {
  const startedAt = new Date();
  const monitor = await prisma.monitor.findUnique({ where: { id: monitorId } });
  if (!monitor) throw new Error("Monitor not found.");

  let fetchedCount = 0;
  let savedCount = 0;

  try {
    const result = await scrapePostWithLinkdOnly(postUrl);
    fetchedCount = result.events.length;

    const urlsToEnrich = result.events.map(e => e.linkedinUrl).filter((u): u is string => !!u);
    const enrichmentMap = await enrichment.enrichProfilesBatch(urlsToEnrich);

    for (const event of result.events) {
      try {
        const enrichedData = event.linkedinUrl ? enrichmentMap[event.linkedinUrl] : null;
        
        let icpStatus = "MAYBE";
        let icpReasoning = "Enrichment data missing.";
        
        if (enrichedData) {
          const aiResult = await aiEnrichment.classifyLead(enrichedData.raw, monitor.icpDefinition || "");
          icpStatus = aiResult.status;
          icpReasoning = aiResult.reasoning;
        }

        const savedLead = await prisma.lead.create({
          data: {
            ...event,
            monitorId,
            seniority: enrichedData?.seniority || null,
            function: enrichedData?.function || null,
            region: enrichedData?.region || null,
            companyWebsite: enrichedData?.companyWebsite || null,
            companyIndustry: enrichedData?.companyIndustry || null,
            companySize: enrichedData?.companySize || null,
            companyHq: enrichedData?.companyHq || null,
            icpStatus: icpStatus as any,
            icpReasoning: icpReasoning,
            rawPayload: enrichedData?.raw || event.rawPayload
          },
        });
        savedCount++;
        if (monitor.webhookUrl) await dispatchToWebhook(monitor.webhookUrl, savedLead);
      } catch (error: any) {
        if (error?.code !== "P2002") console.error("[Scraper] Manual lead save error:", error);
      }
    }

    await prisma.monitor.update({
      where: { id: monitorId },
      data: {
        postUrl,
        lastRunAt: new Date(),
        lastSuccessAt: new Date(),
      }
    });

    await prisma.monitorRun.create({
      data: {
        monitorId,
        provider: "linkdapi",
        status: "SUCCESS",
        startedAt,
        endedAt: new Date(),
        fetchedCount,
        newCount: savedCount,
      }
    });
  } catch (error: any) {
    console.error("[Scraper] Manual scrape failed:", error);
    throw error;
  }

  return { totalScraped: fetchedCount, savedCount, provider: "linkdapi" };
};
