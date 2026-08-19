import { Request, Response } from "express";
import { Job } from "../models/Job";
import { Gym } from "../models/Gym";

export const createJob = async (req: Request, res: Response) => {
  try {
    const { 
      gymSlug,
      gymId,
      position, 
      description, 
      requirements, 
      salaryRange, 
      employmentType, 
      location, 
      numberOfOpenings, 
      applicationDeadline 
    } = req.body;

    let targetGymId = gymId;
    if (!targetGymId && gymSlug) {
      const gym = await Gym.findOne({ slug: gymSlug });
      if (gym) targetGymId = gym._id;
    }
    if (!targetGymId && req.user?.profileId) {
      targetGymId = req.user.profileId;
    }

    if (!targetGymId) {
      return res.status(400).json({ success: false, message: "Gym ID or slug is required" });
    }

    const job = await Job.create({
      gymId: targetGymId,
      position,
      description,
      requirements: requirements || { experience: "1-3 Years", specialization: "General Fitness" },
      salaryRange,
      employmentType,
      location,
      numberOfOpenings: Number(numberOfOpenings) || 1,
      applicationDeadline: applicationDeadline || new Date(Date.now() + 30 * 86400000),
      status: "open",
    });

    res.status(201).json({ success: true, data: job });
  } catch (error: any) {
    console.error("Create Job Error:", error);
    res.status(500).json({ success: false, message: "Server error creating vacancy" });
  }
};

export const getJobs = async (req: Request, res: Response) => {
  try {
    const { status = "open", specialization, location, type } = req.query;
    const query: any = {};

    if (status) query.status = status;
    if (specialization) query["requirements.specialization"] = { $regex: specialization, $options: "i" };
    if (location) query.location = { $regex: location, $options: "i" };
    if (type) query.employmentType = { $regex: type, $options: "i" };

    const jobs = await Job.find(query)
      .sort({ createdAt: -1 })
      .populate("gymId", "gymName gymLogo address city slug");

    res.status(200).json({ success: true, count: jobs.length, data: jobs });
  } catch (error: any) {
    console.error("Get Jobs Error:", error);
    res.status(500).json({ success: false, message: "Server error fetching jobs" });
  }
};

export const getJobsByGym = async (req: Request, res: Response) => {
  try {
    const { gymSlug, gymId } = req.params;
    let targetGymId = gymId;

    if (gymSlug) {
      const gym = await Gym.findOne({ slug: gymSlug });
      if (!gym) {
        return res.status(404).json({ success: false, message: "Gym not found" });
      }
      targetGymId = gym._id.toString();
    }

    const jobs = await Job.find({ gymId: targetGymId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: jobs });
  } catch (error: any) {
    console.error("Get Jobs By Gym Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getJobById = async (req: Request, res: Response) => {
  try {
    const job = await Job.findById(req.params.id).populate("gymId", "gymName gymLogo gymDescription address slug contactPerson");
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    res.status(200).json({ success: true, data: job });
  } catch (error: any) {
    console.error("Get Job Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateJob = async (req: Request, res: Response) => {
  try {
    const job = await Job.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    res.status(200).json({ success: true, data: job });
  } catch (error: any) {
    console.error("Update Job Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteJob = async (req: Request, res: Response) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    res.status(200).json({ success: true, message: "Vacancy removed successfully" });
  } catch (error: any) {
    console.error("Delete Job Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
