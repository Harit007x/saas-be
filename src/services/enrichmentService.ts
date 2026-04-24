import * as linkdApi from "./linkdApiService";

export type EnrichedProfile = {
  jobTitle: string | null;
  company: string | null;
  seniority: string | null;
  function: string | null;
  region: string | null;
  city: string | null;
  country: string | null;
  companyWebsite: string | null;
  companyIndustry: string | null;
  companySize: string | null;
  companyHq: string | null;
  raw: any;
};

export const enrichProfileLinkd = async (profileUrl: string): Promise<EnrichedProfile | null> => {
  try {
    console.log(`[Enrichment] Fetching full profile from LinkdAPI for: ${profileUrl}`);
    const profile = await linkdApi.fetchFullProfile(profileUrl);

    // Extract Professional Context from work history
    const currentPositions = profile.currentPositions || [];
    const currentJob = currentPositions[0] || {};
    
    const title = (currentJob.title || profile.headline || "").toLowerCase();
    let seniority = "Individual Contributor";
    if (title.includes("founder") || title.includes("ceo") || title.includes("c-level") || title.includes("executive") || title.includes("partner") || title.includes("owner")) seniority = "Executive";
    else if (title.includes("director") || title.includes("vp") || title.includes("head") || title.includes("president")) seniority = "Director/VP";
    else if (title.includes("manager") || title.includes("lead") || title.includes("supervisor")) seniority = "Manager";

    let func = "Operations";
    if (title.includes("engineer") || title.includes("developer") || title.includes("tech") || title.includes("software")) func = "Engineering/IT";
    else if (title.includes("sales") || title.includes("account executive") || title.includes("business development") || title.includes("buyer")) func = "Sales/BD";
    else if (title.includes("marketing") || title.includes("growth")) func = "Marketing";
    else if (title.includes("product")) func = "Product";
    else if (title.includes("design") || title.includes("ux")) func = "Design";
    else if (title.includes("finance") || title.includes("trading") || title.includes("accountant")) func = "Finance";
    else if (seniority === "Executive") func = "General Management";

    const companyName = currentJob.companyName || null;

    return {
      jobTitle: currentJob.title || profile.headline || null,
      company: companyName,
      seniority,
      function: func,
      region: profile.geo?.full || profile.geo?.country || null,
      city: profile.geo?.city || null,
      country: profile.geo?.country || null,
      companyWebsite: null, // LinkdAPI doesn't directly return company website in profile
      companyIndustry: profile.industry?.name || null,
      companySize: null, // LinkdAPI doesn't directly return company size in profile
      companyHq: null, // LinkdAPI doesn't directly return company HQ in profile
      raw: profile
    };
  } catch (error) {
    console.error(`[Enrichment] LinkdAPI enrichment failed for ${profileUrl}:`, error instanceof Error ? error.message : error);
    return null;
  }
};

// Batch version (simulated as LinkdAPI /profile/full is 1-by-1)
export const enrichProfilesBatch = async (urls: string[]): Promise<Record<string, EnrichedProfile>> => {
  const enrichedMap: Record<string, EnrichedProfile> = {};
  
  // To avoid hitting rate limits too fast, we'll do them sequentially or in small chunks
  for (const url of urls) {
    const result = await enrichProfileLinkd(url);
    if (result) {
      enrichedMap[url] = result;
    }
    // Small delay to be safe
    await new Promise(r => setTimeout(r, 500));
  }

  return enrichedMap;
};
