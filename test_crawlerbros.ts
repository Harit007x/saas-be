import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv-flow';

dotenv.config();

const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

async function testCrawlerBros() {
    console.log("Testing crawlerbros/linkedin-profile-scraper...");
    const input = {
        "profileUrls": [
            "https://www.linkedin.com/in/jigar-s/" 
        ],
        "proxyConfiguration": {
            "useApifyProxy": true,
            "apifyProxyGroups": ["RESIDENTIAL"]
        }
    };

    try {
        const run = await client.actor("crawlerbros/linkedin-profile-scraper").call(input);
        console.log("Run succeeded:", run.id);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        console.log("Items found:", items.length);
        console.dir(items, { depth: null });
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

testCrawlerBros();
