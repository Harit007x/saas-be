import dotenv from "dotenv-flow";

dotenv.config();

const LINKDAPI_BASE_URL = "https://linkdapi.com/api/v1";

export interface LinkdApiProfileOverview {
  urn?: string;
  fullName: string;
  headline: string;
  location?: {
    countryName?: string;
    city?: string;
    fullLocation?: string;
  };
  publicIdentifier?: string;
  profilePictureURL?: string;
}

export interface LinkdApiFullProfile extends LinkdApiProfileOverview {
  summary?: string;
  industry?: { name: string; urn: string };
  geo?: {
    country: string;
    city: string;
    full: string;
    countryCode: string;
  };
  currentPositions?: Array<{
    title: string;
    companyName: string;
    description?: string;
  }>;
  position?: Array<any>;
  education?: any[];
  skills?: any[];
  languages?: any[];
}

export interface LinkdApiPost {
  urn: string;
  authorUrn: string;
  text: string;
  createdAt: number;
  post_url?: string;
  url?: string;
}

export interface LinkdApiReaction {
  actor: {
    name: string;
    headline: string;
    urn: string;
    url: string;
    profilePictureURL?: string;
  };
  reactionType: string;
}

export interface LinkdApiComment {
  author: {
    name: string;
    headline: string;
    urn: string;
    url: string;
    profilePictureURL?: string;
  };
  comment: string;
  createdAt: number;
}

const getHeaders = () => {
  const apiKey = process.env.LINKDAPI_KEY;
  if (!apiKey || apiKey === "YOUR_LINKDAPI_KEY_HERE" || apiKey.includes(" ")) {
    throw new Error("LINKDAPI_KEY is missing or invalid in .env");
  }
  return {
    "X-linkdapi-apikey": apiKey.trim(),
    "Content-Type": "application/json",
  };
};

// Helper to extract username from profile URL
const extractUsername = (profileUrl: string): string => {
  try {
    const cleaned = profileUrl.split("?")[0].replace(/\/$/, "");
    const parts = cleaned.split("/");
    // Usually /in/username or /pub/username
    return parts[parts.length - 1];
  } catch {
    return profileUrl;
  }
};

// Helper to extract numeric ID from post URL
const extractNumericId = (postUrl: string): string => {
  try {
    // Look for an 18-20 digit number in the URL (LinkedIn URNs are usually 19 digits)
    const match = postUrl.match(/\d{18,20}/);
    if (match) return match[0];
    
    // If we can't find a numeric ID, it's likely a truncated or invalid URL
    throw new Error(`Could not find a 19-digit LinkedIn Post ID in the URL: ${postUrl}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Could not find")) throw error;
    return postUrl;
  }
};

export const fetchProfileOverview = async (profileUrl: string): Promise<LinkdApiProfileOverview> => {
  const username = extractUsername(profileUrl);
  const url = `${LINKDAPI_BASE_URL}/profile/overview?username=${encodeURIComponent(username)}`;
  console.log(`[LinkdAPI] Fetching overview for username: ${username}`);
  const response = await fetch(url, { headers: getHeaders() });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(`LinkdAPI Profile Overview Error: ${json.message || response.statusText}`);
  }
  return json.data;
};

export const fetchFullProfile = async (profileUrlOrUrn: string): Promise<LinkdApiFullProfile> => {
  const identifier = profileUrlOrUrn.includes("http") ? extractUsername(profileUrlOrUrn) : profileUrlOrUrn;
  const param = profileUrlOrUrn.includes("http") ? "username" : "urn";
  
  const url = `${LINKDAPI_BASE_URL}/profile/full?${param}=${encodeURIComponent(identifier)}`;
  console.log(`[LinkdAPI] Fetching full profile for ${param}: ${identifier}`);
  const response = await fetch(url, { headers: getHeaders() });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(`LinkdAPI Full Profile Error: ${json.message || response.statusText}`);
  }
  return json.data;
};

export const fetchProfilePosts = async (urn: string): Promise<LinkdApiPost[]> => {
  const url = `${LINKDAPI_BASE_URL}/posts/all?urn=${encodeURIComponent(urn)}&start=0`;
  const response = await fetch(url, { headers: getHeaders() });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(`LinkdAPI Posts Error: ${json.message || response.statusText}`);
  }
  return json.data.posts || [];
};

export const fetchPostLikes = async (postUrl: string): Promise<LinkdApiReaction[]> => {
  const id = extractNumericId(postUrl);
  const url = `${LINKDAPI_BASE_URL}/posts/likes?urn=${encodeURIComponent(id)}`;
  console.log(`[LinkdAPI] Fetching likes for post ID: ${id}`);
  const response = await fetch(url, { headers: getHeaders() });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(`LinkdAPI Likes Error: ${json.message || response.statusText}`);
  }
  return json.data.likes || [];
};

export const fetchPostComments = async (postUrl: string): Promise<LinkdApiComment[]> => {
  const id = extractNumericId(postUrl);
  const url = `${LINKDAPI_BASE_URL}/posts/comments?urn=${encodeURIComponent(id)}`;
  console.log(`[LinkdAPI] Fetching comments for post ID: ${id}`);
  const response = await fetch(url, { headers: getHeaders() });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(`LinkdAPI Comments Error: ${json.message || response.statusText}`);
  }
  return json.data.comments || [];
};
