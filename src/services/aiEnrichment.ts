export const enrichProfileData = (rawName: string, rawHeadline: string, engagementType: string) => {
  // A mock logic mimicking an LLM breaking a headline into title and company
  // Ex: "Senior Marketing Manager at Acme Corp | Forbes 30 Under 30" -> Title: "Senior Marketing Manager", Company: "Acme Corp"
  
  let jobTitle = "Unknown";
  let company = "Unknown";

  if (rawHeadline) {
    // Attempt standard " at " split
    const atParts = rawHeadline.split(/ at /i);
    // Remove "1st", "2nd", "3rd" degree connection text often stuck to the end
    const rawRole = atParts[0].split("|")[0].replace(/(1st|2nd|3rd)\s*degree connection.*/i, '').trim();
    
    if (atParts.length > 1) {
      jobTitle = rawRole;
      company = atParts[1].split("|")[0].replace("...", "").trim();
    } else {
      jobTitle = rawRole;
    }
  }

  // Clean Name (sometimes includes newline and "3rd degree connection" texts)
  const cleanName = rawName.split("\n")[0].split("•")[0].trim();
  
  return {
    name: cleanName,
    linkedinUrl: `https://linkedin.com/search/results/people/?keywords=${encodeURIComponent(cleanName)}`,
    jobTitle,
    company,
    engagementType
  };
};
