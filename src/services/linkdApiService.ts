import crypto from "crypto";
import dotenv from "dotenv-flow";

dotenv.config();

const LINKDAPI_BASE_URL = "https://linkdapi.com/api/v1";

export interface LinkdApiProfileOverview {
  urn: string;
  name: string;
  headline: string;
  location?: string;
  public_id?: string;
  profile_pic?: string;
}

export interface LinkdApiPost {
  urn: string;
  authorUrn: string;
  text: string;
  createdAt: number;
  post_url?: string;
}

export interface LinkdApiReaction {
  profile_urn: string;
  name: string;
  headline: string;
  reaction_type: string;
  profile_url: string;
  company?: string;
}

export interface LinkdApiComment {
  profile_urn: string;
  name: string;
  headline: string;
  text: string;
  profile_url: string;
  created_at: number;
  company?: string;
}

const getHeaders = () => {
  const apiKey = process.env.LINKDAPI_KEY;
  if (!apiKey || apiKey === "YOUR_LINKDAPI_KEY_HERE") {
    throw new Error("LINKDAPI_KEY is missing or not configured in .env");
  }
  return {
    "X-linkdapi-apikey": apiKey,
    "Content-Type": "application/json",
  };
};

export const fetchProfileOverview = async (profileUrl: string): Promise<LinkdApiProfileOverview> => {
  const url = `${LINKDAPI_BASE_URL}/profile/overview?url=${encodeURIComponent(profileUrl)}`;
  const response = await fetch(url, { headers: getHeaders() });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(`LinkdAPI Profile Overview Error: ${json.message || response.statusText}`);
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
  const url = `${LINKDAPI_BASE_URL}/posts/likes?post_url=${encodeURIComponent(postUrl)}`;
  const response = await fetch(url, { headers: getHeaders() });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(`LinkdAPI Likes Error: ${json.message || response.statusText}`);
  }
  return json.data.likes || [];
};

export const fetchPostComments = async (postUrl: string): Promise<LinkdApiComment[]> => {
  const url = `${LINKDAPI_BASE_URL}/posts/comments?post_url=${encodeURIComponent(postUrl)}`;
  const response = await fetch(url, { headers: getHeaders() });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(`LinkdAPI Comments Error: ${json.message || response.statusText}`);
  }
  return json.data.comments || [];
};
