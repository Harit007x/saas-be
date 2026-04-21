import { Request, Response } from "express";
import { prisma } from "../utils/db";

export const getLeads = async (req: Request, res: Response) => {
  try {
    const leads = await prisma.lead.findMany({
      where: {
        monitor: {
          userId: String(req.user.id)
        }
      },
      include: {
        monitor: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, count: leads.length, data: leads });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching leads" });
  }
};
