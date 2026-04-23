import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv-flow';

dotenv.config();

const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

async function checkActor(actorName: string) {
    try {
        console.log(`Checking actor: ${actorName} with token ending in ...${process.env.APIFY_TOKEN?.slice(-4)}`);
        await client.actor(actorName).get();
        console.log(`FOUND ACTOR: ${actorName}`);
    } catch (e: any) {
        console.error(`NOT FOUND: ${actorName} - ${e.message}`);
    }
}

async function run() {
    await checkActor("scraping_solutions/linkedin-posts-engagers");
    await checkActor("scraping_solutions/linkedin-profile-scraper");
    await checkActor("curious_cat/linkedin-profile-scraper");
}
run();
