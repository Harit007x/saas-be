import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv-flow";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export type ClassificationResult = {
  status: "MATCH" | "NO_MATCH" | "MAYBE";
  reasoning: string;
};

export const classifyLead = async (profileData: any, icpDefinition: string): Promise<ClassificationResult> => {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("[AI] GEMINI_API_KEY is missing. Skipping AI classification.");
    return { status: "MAYBE", reasoning: "AI classification skipped (no API key)." };
  }

  // Focus on the most relevant parts of the profile for the prompt to save tokens and improve focus
  const simplifiedProfile = {
    name: profileData.name,
    headline: profileData.headline,
    location: profileData.location,
    summary: profileData.summary,
    industry: profileData.industry,
    company: profileData.company,
    companySize: profileData.company_size,
    companyIndustry: profileData.company_industry,
    experiences: (profileData.experiences || []).slice(0, 2).map((exp: any) => ({
      title: exp.title,
      company: exp.company,
      description: exp.description?.substring(0, 200)
    })),
    skills: (profileData.skills || []).slice(0, 10)
  };

  const prompt = `
    You are an expert sales strategist. Analyze the following LinkedIn profile data to see if it matches the target Ideal Customer Profile (ICP).

    TARGET ICP DEFINITION:
    ${icpDefinition || "Any professional lead is a potential match."}

    LEAD PROFILE DATA:
    ${JSON.stringify(simplifiedProfile, null, 2)}

    RESPONSE GUIDELINES:
    1. status: "MATCH" if they fit the ICP perfectly, "NO_MATCH" if they clearly don't, "MAYBE" if it's ambiguous.
    2. reasoning: Provide a sharp, 1-sentence explanation. Mention specific details like company size, title, or industry that influenced your decision.

    RESPONSE FORMAT (JSON ONLY):
    {
      "status": "MATCH" | "NO_MATCH" | "MAYBE",
      "reasoning": "string"
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Robust JSON parsing
    const match = text.match(/\{[\s\S]*\}/);
    const jsonStr = match ? match[0] : text;
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("[AI] Classification failed:", error);
    return { status: "MAYBE", reasoning: "AI analysis encountered an error." };
  }
};
