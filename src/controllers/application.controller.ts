import { Request, Response } from "express";
import { Application } from "../models/Application";
import { Job } from "../models/Job";

export const applyForJob = async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== "trainer") {
      return res.status(403).json({ success: false, message: "Only trainers can apply for jobs" });
    }

    const { jobId, coverLetter } = req.body;
    const trainerId = req.user.profileId; // In production this comes from the auth token

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    const application = await Application.create({
      jobId,
      trainerId,
      gymId: job.gymId,
      coverLetter,
    });

    res.status(201).json({ success: true, data: application });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "You have already applied for this job" });
    }
    console.error("Apply Job Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getTrainerApplications = async (req: Request, res: Response) => {
  try {
    const trainerId = req.params.trainerId; // In production use req.user.profileId
    const applications = await Application.find({ trainerId })
      .populate("jobId", "position location salaryRange employmentType")
      .populate("gymId", "gymName gymLogo slug");

    res.status(200).json({ success: true, data: applications });
  } catch (error: any) {
    console.error("Get Trainer Applications Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getGymApplications = async (req: Request, res: Response) => {
  try {
    const gymId = req.params.gymId; // In production use req.user.profileId
    const applications = await Application.find({ gymId })
      .populate("jobId", "position")
      .populate("trainerId", "personal professional slug");

    res.status(200).json({ success: true, data: applications });
  } catch (error: any) {
    console.error("Get Gym Applications Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateApplicationStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const application = await Application.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }
    res.status(200).json({ success: true, data: application });
  } catch (error: any) {
    console.error("Update Application Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
