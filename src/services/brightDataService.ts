import dotenv from "dotenv-flow";

dotenv.config();

const API_BASE = "https://api.brightdata.com/datasets/v3";

export const triggerScrape = async (datasetId: string, payload: any[]) => {
  const token = process.env.BRIGHTDATA_KEY;
  if (!token) throw new Error("BRIGHTDATA_KEY is not defined");

  const response = await fetch(`${API_BASE}/trigger?dataset_id=${datasetId}&include_errors=true`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Bright Data Trigger Error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.snapshot_id as string;
};

export const pollSnapshot = async (snapshotId: string, maxAttempts = 30, delayMs = 10000) => {
  const token = process.env.BRIGHTDATA_KEY;
  if (!token) throw new Error("BRIGHTDATA_KEY is not defined");

  for (let i = 0; i < maxAttempts; i++) {
    const progressRes = await fetch(`${API_BASE}/progress/${snapshotId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!progressRes.ok) {
      throw new Error(`Bright Data Progress Error: ${progressRes.statusText}`);
    }

    const progressData = await progressRes.json();
    
    if (progressData.status === "ready") {
      const snapshotRes = await fetch(`${API_BASE}/snapshot/${snapshotId}?format=json`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!snapshotRes.ok) throw new Error(`Bright Data Snapshot Error: ${snapshotRes.statusText}`);
      
      const result = await snapshotRes.json();
      return result;
    } else if (progressData.status === "failed") {
      throw new Error(`Bright Data scraping failed for snapshot ${snapshotId}`);
    }

    // wait and retry
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("Bright Data scraping timed out");
};

export const scrapeWithBrightData = async (datasetId: string, url: string) => {
   const snapshotId = await triggerScrape(datasetId, [{ url }]);
   const results = await pollSnapshot(snapshotId);
   return results;
};
