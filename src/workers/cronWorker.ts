import cron from "node-cron";
import { prisma } from "../utils/db";
import { scrapeAndSaveLeads } from "../services/scraperService";

type MonitorJob = { id: string; postUrl: string };
const MAX_CONCURRENCY = Number(process.env.SCRAPE_WORKER_CONCURRENCY || 3);
const MAX_RETRIES = Number(process.env.SCRAPE_WORKER_RETRIES || 2);

const queue: MonitorJob[] = [];
let running = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const processJob = async (job: MonitorJob) => {
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    try {
      await scrapeAndSaveLeads(job.id, job.postUrl);
      return;
    } catch (error) {
      attempt++;
      if (attempt > MAX_RETRIES) {
        console.error(`[CRON] Job failed for monitor ${job.id} after retries`, error);
        return;
      }

      const backoff = Math.min(30000, 1000 * 2 ** attempt);
      console.warn(`[CRON] Retry ${attempt}/${MAX_RETRIES} for ${job.id} in ${backoff}ms`);
      await sleep(backoff);
    }
  }
};

const kickQueue = async () => {
  while (running < MAX_CONCURRENCY && queue.length > 0) {
    const job = queue.shift();
    if (!job) return;

    running++;
    processJob(job)
      .catch((error) => console.error(`[CRON] Unexpected queue error for ${job.id}`, error))
      .finally(() => {
        running--;
        void kickQueue();
      });
  }
};

export const initCronWorker = () => {
  cron.schedule("*/2 * * * *", async () => {
    console.log("[CRON] Running monitor scraper cycle...");
    try {
      const activeMonitors = await prisma.monitor.findMany({
        where: { isActive: true }
      });

      if (activeMonitors.length === 0) {
        console.log("[CRON] No active monitors found.");
        return;
      }

      for (const monitor of activeMonitors) {
        queue.push({ id: monitor.id, postUrl: monitor.postUrl });
      }
      void kickQueue();
      console.log("[CRON] Scraper cycle completed.");
    } catch (error) {
      console.error("[CRON] Error during scraper cycle:", error);
    }
  });

  console.log("✅ Cron worker initialized!");
};
