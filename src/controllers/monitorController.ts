import { Request, Response } from "express";
import { prisma } from "../utils/db";

export const getMonitors = async (req: Request, res: Response) => {
  try {
    const monitors = await prisma.monitor.findMany({
      where: { userId: String(req.user.id) },
      include: { 
        _count: {
          select: { leads: true }
        }
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
    const { postUrl, webhookUrl } = req.body;
    if (!postUrl) {
      res.status(400).json({ success: false, message: "postUrl is required" });
      return;
    }

    const newMonitor = await prisma.monitor.create({
      data: {
        postUrl,
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
