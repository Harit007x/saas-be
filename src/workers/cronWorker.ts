import cron from "node-cron";
import { prisma } from "../utils/db";
import { mockScraping } from "../services/scraperService";
import { dispatchToWebhook } from "../services/integrationService";

export const initCronWorker = () => {
  // Run every 2 minutes
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
        console.log(`[CRON] Scraping for monitor ID: ${monitor.id}`);
        // Fetch new leads from the mock scraper
        const newLeads = await mockScraping(monitor.postUrl);

        for (const leadData of newLeads) {
          // Check if lead already exists for this monitor (mocked duplicate check based on name)
          const existingLead = await prisma.lead.findFirst({
            where: { monitorId: monitor.id, name: leadData.name }
          });

          if (!existingLead) {
            const savedLead = await prisma.lead.create({
              data: {
                ...leadData,
                monitorId: monitor.id
              }
            });

            console.log(`[CRON] Saved new lead: ${savedLead.name}`);

            if (monitor.webhookUrl) {
              await dispatchToWebhook(monitor.webhookUrl, savedLead);
            }
          }
        }
      }
      console.log("[CRON] Scraper cycle completed.");
    } catch (error) {
      console.error("[CRON] Error during scraper cycle:", error);
    }
  });

  console.log("✅ Cron worker initialized!");
};
