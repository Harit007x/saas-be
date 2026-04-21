import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv-flow';

dotenv.config();

const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

async function testCuriousCat() {
    console.log("Testing curious_cat/linkedin-profile-scraper...");
    const input = {
        "profileUrls": [
            "https://www.linkedin.com/in/williamhgates" 
        ]
    };

    try {
        const run = await client.actor("curious_cat/linkedin-profile-scraper").call(input);
        console.log("Run succeeded:", run.id);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        console.log("Items found:", items.length);
        console.dir(items);
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

testCuriousCat();
