import { apifyProfileScraping } from './src/services/scraperService';
import dotenv from 'dotenv-flow';

dotenv.config();

async function testResidential() {
    console.log("Testing LinkedIn scraping with RESIDENTIAL proxies...");
    const urls = ["https://www.linkedin.com/in/jigar-s/"]; // The profile from the user's screenshot
    
    try {
        const leads = await apifyProfileScraping(urls);
        console.log("Returned Leads:", leads.length);
        console.dir(leads, { depth: null });
        
        if (leads.length > 0) {
            console.log("✅ Success! Residentially proximity overcame the block.");
        } else {
            console.log("⚠️ Still 0 items. This suggests the actor might need an update or the profile is private.");
        }
    } catch (e) {
        console.error("❌ Test failed:", e);
    }
}

testResidential();
