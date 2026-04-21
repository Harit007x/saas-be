import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import dotenv from "dotenv-flow";
import { enrichProfileData } from "./aiEnrichment";

dotenv.config();

chromium.use(stealthPlugin());

export const mockScraping = async (postUrl: string) => {
  let browser;
  try {
    const proxyConfig = process.env.PROXY_SERVER
      ? {
          server: process.env.PROXY_SERVER,
          username: process.env.PROXY_USERNAME,
          password: process.env.PROXY_PASSWORD,
        }
      : undefined;

    console.log("[Scraper] Launching Playwright Chromium instance...");
    
    browser = await chromium.launch({
      headless: true, // Run headless in prod
      proxy: proxyConfig,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      // Emulating a real browser viewport
      viewport: { width: 1280, height: 720 },
      // Set to English to avoid i18n DOM class changes
      locale: 'en-US' 
    });

    const page = await context.newPage();
    
    console.log(`[Scraper] Navigating to ${postUrl}...`);
    // Add realistic delay before navigation
    await page.waitForTimeout(Math.random() * 2000 + 1000);
    
    await page.goto(postUrl, { waitUntil: "domcontentloaded" });
    
    // Natural scrolling behavior
    await page.evaluate(() => {
      window.scrollBy({ top: 500, behavior: 'smooth' });
    });
    
    // Wait to allow lazy-loaded comments to appear
    await page.waitForTimeout(3000);

    // Attempt to scrape comments or reactions. Highly susceptible to LinkedIn DOM updates!
    // Typically LinkedIn public views contain <article> tags, or we search for common class names
    const rawProfiles = await page.evaluate(() => {
      // Find comment blocks on public posts
      const commentNodes = Array.from(document.querySelectorAll('article, .comment'));
      
      return commentNodes.map(node => {
        // Broad selectors to catch names
        const nameNode = node.querySelector('h3, span.text-view-model, .comment__author, .actor-name') as HTMLElement;
        // Broad selectors to catch headlines
        const headlineNode = node.querySelector('.update-components-actor__description, .comment__headline, .actor-headline') as HTMLElement;
        
        return {
          rawName: nameNode?.innerText?.trim() || "",
          rawHeadline: headlineNode?.innerText?.trim() || "",
          engagementType: "COMMENT"
        };
      }).filter(p => p.rawName !== "" && p.rawName !== "LinkedIn Member"); // Omit hidden profiles
    });

    console.log(`[Scraper] Extracted ${rawProfiles.length} raw profile segments. Enrichment starting...`);
    
    await browser.close();

    // Pass through AI enrichment step
    const enrichedLeads = rawProfiles.map(profile => enrichProfileData(profile.rawName, profile.rawHeadline, profile.engagementType));

    // Fallback if no profiles are scraped (LinkedIn blocked us or DOM changed)
    if (enrichedLeads.length === 0) {
       console.log("[Scraper] Found zero leads. LinkedIn likely triggered an Auth-wall or DOM changed on your local IP. Returning fallback mock data to demonstrate data-flow.");
       const randomSuffix = Math.floor(Math.random() * 1000);
       return [
         {
           name: `LinkedIn User ${randomSuffix}`,
           linkedinUrl: `https://linkedin.com/search/results/people/?keywords=LinkedIn%20User`,
           jobTitle: "Software Engineer",
           company: "OpenAI",
           engagementType: "COMMENT"
         },
         {
           name: `Sarah Growth ${randomSuffix}`,
           linkedinUrl: `https://linkedin.com/search/results/people/?keywords=Sarah%20Growth`,
           jobTitle: "Head of Growth",
           company: "Acme Corp",
           engagementType: "LIKE"
         }
       ];
    }
    
    return enrichedLeads;

  } catch (error) {
    console.error("[Scraper] Playwright encounter error:", error);
    if (browser) await browser.close();
    return [];
  }
};
