import { Request, Response } from "express";
import { Gym } from "../models/Gym";
import { Job } from "../models/Job";
import { Application } from "../models/Application";
import { Connection } from "../models/Connection";

export const getGymBySlug = async (req: Request, res: Response) => {
  try {
    const gym = await Gym.findOne({ slug: req.params.slug });
    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }
    res.status(200).json({ success: true, data: gym });
  } catch (error: any) {
    console.error("Get Gym By Slug Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateGymProfile = async (req: Request, res: Response) => {
  try {
    const gym = await Gym.findOne({ slug: req.params.slug });

    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }

    if (req.body.gymName) gym.gymName = req.body.gymName;
    if (req.body.gymLogo !== undefined) gym.gymLogo = req.body.gymLogo;
    if (req.body.gymDescription) gym.gymDescription = req.body.gymDescription;
    if (req.body.website !== undefined) gym.website = req.body.website;
    if (req.body.instagram !== undefined) gym.instagram = req.body.instagram;
    if (req.body.numberOfLocations !== undefined) gym.numberOfLocations = req.body.numberOfLocations;
    if (req.body.address) gym.address = { ...gym.address, ...req.body.address };
    if (req.body.hiringInformation) gym.hiringInformation = { ...gym.hiringInformation, ...req.body.hiringInformation };
    if (req.body.contactPerson) gym.contactPerson = { ...gym.contactPerson, ...req.body.contactPerson };

    await gym.save();

    res.status(200).json({ success: true, data: gym });
  } catch (error: any) {
    console.error("Update Gym Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getGymDashboardStats = async (req: Request, res: Response) => {
  try {
    const gym = await Gym.findOne({ slug: req.params.slug });
    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }

    const totalVacancies = await Job.countDocuments({ gymId: gym._id, status: "open" });
    const totalApplications = await Application.countDocuments({ gymId: gym._id });
    const shortlistedCount = await Application.countDocuments({ gymId: gym._id, status: "shortlisted" });
    const hiredCount = await Application.countDocuments({ gymId: gym._id, status: "hired" });

    const recentApplications = await Application.find({ gymId: gym._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("jobId", "position")
      .populate("trainerId", "personal professional slug");

    res.status(200).json({
      success: true,
      data: {
        gym,
        stats: {
          activeVacancies: totalVacancies,
          applicationsReceived: totalApplications,
          shortlisted: shortlistedCount,
          activeHires: hiredCount,
        },
        recentApplications,
      },
    });
  } catch (error: any) {
    console.error("Get Gym Dashboard Stats Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
