import { Request, Response } from "express";
import { Connection } from "../models/Connection";

export const sendConnectionRequest = async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "gym") {
      return res.status(403).json({ success: false, message: "Only gyms can send connection requests" });
    }

    const gymId = req.user.profileId;
    const { trainerId, message } = req.body;

    const connection = await Connection.create({
      gymId,
      trainerId,
      message,
    });

    res.status(201).json({ success: true, data: connection });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Connection request already sent" });
    }
    console.error("Send Connection Request Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getTrainerConnections = async (req: Request, res: Response) => {
  try {
    const trainerId = req.params.trainerId; // In production use req.user.profileId
    const connections = await Connection.find({ trainerId })
      .populate("gymId", "gymName gymLogo slug");

    res.status(200).json({ success: true, data: connections });
  } catch (error: any) {
    console.error("Get Trainer Connections Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateConnectionStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    
    // In production we would verify that req.user.profileId matches connection.trainerId

    const connection = await Connection.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!connection) {
      return res.status(404).json({ success: false, message: "Connection not found" });
    }

    res.status(200).json({ success: true, data: connection });
  } catch (error: any) {
    console.error("Update Connection Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
