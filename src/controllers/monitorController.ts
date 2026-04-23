import { Request, Response } from "express";
import { prisma } from "../utils/db";

export const getMonitors = async (req: Request, res: Response) => {
  try {
    const monitors = await prisma.monitor.findMany({
      where: { userId: String(req.user.id) },
      include: { 
        _count: {
          select: { leads: true }
        },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
       },
       orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, count: monitors.length, data: monitors });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching monitors" });
  }
};

export const createMonitor = async (req: Request, res: Response) => {
  try {
    const { profileUrl, webhookUrl } = req.body;
    const normalizedProfileUrl = String(profileUrl || "").trim();
    if (!normalizedProfileUrl) {
      res.status(400).json({ success: false, message: "profileUrl is required" });
      return;
    }
    if (!normalizedProfileUrl.includes("linkedin.com/in/")) {
      res.status(400).json({ success: false, message: "Only LinkedIn profile URLs are supported" });
      return;
    }

    const newMonitor = await prisma.monitor.create({
      data: {
        profileUrl: normalizedProfileUrl,
        webhookUrl,
        userId: String(req.user.id)
      }
    });
    res.status(201).json({ success: true, data: newMonitor });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error creating monitor" });
  }
};

export const toggleMonitor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const monitor = await prisma.monitor.updateMany({
      where: { id: String(id), userId: String(req.user.id) },
      data: { isActive: Boolean(isActive) }
    });
    res.json({ success: true, message: "Monitor status updated" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error updating monitor" });
  }
};

import { scrapeAndSaveLeads, scrapePostOnlyAndSaveLeads } from "../services/scraperService";

export const scrapeMonitorNow = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const monitor = await prisma.monitor.findFirst({
      where: { id: String(id), userId: String(req.user.id) }
    });

    if (!monitor) {
      res.status(404).json({ success: false, message: "Monitor not found" });
      return;
    }

    const result = await scrapeAndSaveLeads(monitor.id, monitor.profileUrl);
    
    res.json({ 
      success: true, 
      message: "Scraping completed successfully.", 
      data: result 
    });
  } catch (error: any) {
    console.error("[Controller] Scrape now error:", error);
    res.status(500).json({ success: false, message: "Error during immediate scraping." });
  }
};

export const scrapePostManual = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { postUrl } = req.body;
    
    if (!postUrl) {
      res.status(400).json({ success: false, message: "postUrl is required" });
      return;
    }

    const monitor = await prisma.monitor.findFirst({
      where: { id: String(id), userId: String(req.user.id) }
    });

    if (!monitor) {
      res.status(404).json({ success: false, message: "Monitor not found" });
      return;
    }

    const result = await scrapePostOnlyAndSaveLeads(monitor.id, postUrl);
    
    res.json({ 
      success: true, 
      message: "Post scraped successfully.", 
      data: result 
    });
  } catch (error: any) {
    console.error("[Controller] Scrape post error:", error);
    res.status(500).json({ success: false, message: error.message || "Error during post scraping." });
  }
};

export const getMonitorRuns = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const monitor = await prisma.monitor.findFirst({
      where: { id: String(id), userId: String(req.user.id) },
      select: { id: true },
    });

    if (!monitor) {
      res.status(404).json({ success: false, message: "Monitor not found" });
      return;
    }

    const runs = await prisma.monitorRun.findMany({
      where: { monitorId: monitor.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({ success: true, count: runs.length, data: runs });
  } catch {
    res.status(500).json({ success: false, message: "Error fetching monitor runs" });
  }
};
