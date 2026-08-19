import { Request, Response } from "express";
import { User } from "../models/User";
import { Gym } from "../models/Gym";
import { Trainer } from "../models/Trainer";
import { Job } from "../models/Job";
import { Application } from "../models/Application";
import { Connection } from "../models/Connection";

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const totalGyms = await Gym.countDocuments();
    const totalTrainers = await Trainer.countDocuments();
    const verifiedTrainers = await Trainer.countDocuments({ verificationStatus: "verified" });
    const pendingTrainers = await Trainer.countDocuments({ verificationStatus: "pending" });
    const totalVacancies = await Job.countDocuments();
    const activeVacancies = await Job.countDocuments({ status: "open" });
    const totalApplications = await Application.countDocuments();
    const hiredTrainers = await Application.countDocuments({ status: "hired" });
    const pendingConnections = await Connection.countDocuments({ status: "pending" });

    res.status(200).json({
      success: true,
      stats: {
        totalGyms,
        totalTrainers,
        verifiedTrainers,
        pendingTrainers,
        totalVacancies,
        activeVacancies,
        totalApplications,
        hiredTrainers,
        pendingConnections,
      }
    });
  } catch (error: any) {
    console.error("Admin Dashboard Stats Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getTrainers = async (req: Request, res: Response) => {
  try {
    const trainers = await Trainer.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: trainers });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getGyms = async (req: Request, res: Response) => {
  try {
    const gyms = await Gym.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: gyms });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getVacancies = async (req: Request, res: Response) => {
  try {
    const jobs = await Job.find().populate("gymId", "gymName location").sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: jobs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getApplications = async (req: Request, res: Response) => {
  try {
    const applications = await Application.find()
      .populate("jobId", "title")
      .populate("trainerId", "personal.fullName slug")
      .populate("gymId", "gymName slug")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: applications });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getConnections = async (req: Request, res: Response) => {
  try {
    const connections = await Connection.find()
      .populate("gymId", "gymName slug")
      .populate("trainerId", "personal.fullName slug")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: connections });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateTrainerVerification = async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    
    if (!["verified", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const trainer = await Trainer.findById(req.params.id);
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    trainer.verificationStatus = status;

    await trainer.save();

    res.status(200).json({ success: true, data: trainer });
  } catch (error: any) {
    console.error("Update Trainer Verification Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateGym = async (req: Request, res: Response) => {
  try {
    const gym = await Gym.findById(req.params.id);
    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }

    if (req.body.gymName) gym.gymName = req.body.gymName;
    if (req.body.gymLogo !== undefined) gym.gymLogo = req.body.gymLogo;
    if (req.body.gymDescription !== undefined) gym.gymDescription = req.body.gymDescription;
    if (req.body.website !== undefined) gym.website = req.body.website;
    if (req.body.instagram !== undefined) gym.instagram = req.body.instagram;
    if (req.body.numberOfLocations !== undefined) gym.numberOfLocations = req.body.numberOfLocations;
    if (req.body.address) gym.address = { ...gym.address, ...req.body.address };
    if (req.body.hiringInformation) gym.hiringInformation = { ...gym.hiringInformation, ...req.body.hiringInformation };
    if (req.body.contactPerson) gym.contactPerson = { ...gym.contactPerson, ...req.body.contactPerson };

    await gym.save();
    res.status(200).json({ success: true, data: gym });
  } catch (error: any) {
    console.error("Admin Update Gym Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteGym = async (req: Request, res: Response) => {
  try {
    const gym = await Gym.findById(req.params.id);
    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }

    await Gym.findByIdAndDelete(req.params.id);
    // Also clean up vacancies associated with this gym
    await Job.deleteMany({ gymId: gym._id });

    res.status(200).json({ success: true, message: "Gym deleted successfully" });
  } catch (error: any) {
    console.error("Admin Delete Gym Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
