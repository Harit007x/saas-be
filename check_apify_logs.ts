import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv-flow';

dotenv.config();

const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

async function checkLastRun(runId: string) {
    console.log(`Checking logs for run ${runId}...`);
    try {
        const log = await client.run(runId).log().get();
        console.log("--- LOG START ---");
        console.log(log);
        console.log("--- LOG END ---");
        
        const runData: any = await client.run(runId).get();
        console.log("Status:", runData?.status);
        console.log("Exit Code:", runData?.exitCode);
        
        const dataset: any = await client.dataset(runData?.defaultDatasetId || '').listItems();
        console.log("Dataset items count:", dataset.items.length);
        console.dir(dataset.items, { depth: null });
    } catch (e) {
        console.error("Error checking run:", e);
    }
}

// Check the run from my previous test
checkLastRun("7wBxge1E1donIkH0C"); 
