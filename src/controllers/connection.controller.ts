import { Request, Response } from "express";
import { Connection } from "../models/Connection";
import { isOwnerOrAdmin } from "../middleware/auth.middleware";

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
    const trainerId = req.params.trainerId;

    if (!isOwnerOrAdmin(req.user, trainerId)) {
      return res.status(403).json({ success: false, message: "Not authorized to view these connections" });
    }

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

    const existing = await Connection.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Connection not found" });
    }

    // Only the invited trainer (or an admin) may accept or reject an invitation.
    if (!isOwnerOrAdmin(req.user, existing.trainerId)) {
      return res.status(403).json({ success: false, message: "Not authorized to update this connection" });
    }

    // runValidators keeps the status enum honest — without it Mongoose will
    // happily persist an out-of-enum value on an update.
    const connection = await Connection.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: connection });
  } catch (error: any) {
    console.error("Update Connection Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
