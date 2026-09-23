import { Request, Response } from "express";
import { Application } from "../models/Application";
import { isOwnerOrAdmin } from "../middleware/auth.middleware";

/**
 * Retired: trainers no longer apply to vacancies themselves.
 *
 * FitWorks introduces trainers to gyms, so a candidate row is created by the
 * team rather than by the trainer. The route is kept and answers plainly so an
 * old cached page gets an explanation instead of a silent failure.
 */
export const applyForJob = async (_req: Request, res: Response) => {
  return res.status(403).json({
    success: false,
    locked: true,
    reason: "handled_by_fitworks",
    title: "FitWorks handles introductions",
    message:
      "You don't need to apply. Keep your profile complete and verified — our team matches trainers to gym requirements and gets in touch when something suits you.",
  });
};

export const getTrainerApplications = async (req: Request, res: Response) => {
  try {
    const trainerId = req.params.trainerId;

    if (!isOwnerOrAdmin(req.user, trainerId)) {
      return res.status(403).json({ success: false, message: "Not authorized to view these applications" });
    }

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
    const gymId = req.params.gymId;

    if (!isOwnerOrAdmin(req.user, gymId)) {
      return res.status(403).json({ success: false, message: "Not authorized to view these applications" });
    }

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

    const existing = await Application.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    // Only the gym that received the application (or an admin) may move it along.
    if (!isOwnerOrAdmin(req.user, existing.gymId)) {
      return res.status(403).json({ success: false, message: "Not authorized to update this application" });
    }

    const application = await Application.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: application });
  } catch (error: any) {
    console.error("Update Application Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteApplication = async (req: Request, res: Response) => {
  try {
    const application = await Application.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    // Withdrawing an application is the trainer's call (or an admin's). A gym
    // rejects an application, it does not erase it.
    const isOwnTrainer =
      req.user?.role === "trainer" &&
      !!req.user.profileId &&
      application.trainerId.toString() === req.user.profileId;

    if (req.user?.role !== "admin" && !isOwnTrainer) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this application" });
    }

    await Application.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Application withdrawn/deleted successfully" });
  } catch (error: any) {
    console.error("Delete Application Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
