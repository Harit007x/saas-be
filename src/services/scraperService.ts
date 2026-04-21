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

const runProvider = async (provider: string, postUrl: string): Promise<ScrapeResult> => {
  // Validate actor exists first to avoid opaque runtime errors.
  await client.actor(provider).get();

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
  if (!process.env.APIFY_TOKEN) {
    throw new Error("APIFY_TOKEN is missing in backend environment.");
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

export const scrapeAndSaveLeads = async (monitorId: string, url: string) => {
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
    const result = await scrapePostWithFallback(url);
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
