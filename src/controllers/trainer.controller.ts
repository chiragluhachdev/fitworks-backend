import { Request, Response } from "express";
import { Trainer } from "../models/Trainer";
import { Job } from "../models/Job";
import { Application } from "../models/Application";
import { Connection } from "../models/Connection";
import { isOwnerOrAdmin } from "../middleware/auth.middleware";
import { getActivationState, getJobAccess } from "../utils/subscription";

export const getTrainerBySlug = async (req: Request, res: Response) => {
  try {
    const trainer = await Trainer.findOne({ slug: req.params.slug });

    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    // A trainer profile is private to its owner. Gyms never browse trainers —
    // they see the ones who applied to their own vacancies, with exactly the
    // fields that endpoint chooses to populate.
    if (!isOwnerOrAdmin(req.user, trainer._id)) {
      return res.status(403).json({ success: false, message: "Not authorized to view this profile" });
    }

    const data = trainer.toObject();

    res.status(200).json({
      success: true,
      data,
      // Derived, never stored: a trainer is live only once approved AND activated.
      activation: getActivationState(trainer.subscription),
    });
  } catch (error: any) {
    console.error("Get Trainer Error:", error);
    res.status(500).json({ success: false, message: "Server error while fetching trainer" });
  }
};

export const updateTrainerProfile = async (req: Request, res: Response) => {
  try {
    const trainer = await Trainer.findOne({ slug: req.params.slug });

    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    // Without this any signed-in trainer could rewrite any other trainer's
    // profile just by putting their slug in the URL.
    if (!isOwnerOrAdmin(req.user, trainer._id)) {
      return res.status(403).json({ success: false, message: "Not authorized to edit this profile" });
    }

    if (req.body.personal) {
      trainer.personal = { ...trainer.personal, ...req.body.personal };
    }
    if (req.body.professional) {
      trainer.professional = { ...trainer.professional, ...req.body.professional };
    }
    if (req.body.workPreferences) {
      trainer.workPreferences = { ...trainer.workPreferences, ...req.body.workPreferences };
    }

    await trainer.save();

    res.status(200).json({ success: true, data: trainer });
  } catch (error: any) {
    console.error("Update Trainer Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error updating profile" });
  }
};

export const submitVerificationDocuments = async (req: Request, res: Response) => {
  try {
    const { documents } = req.body;

    const trainer = await Trainer.findOne({ slug: req.params.slug });
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }
    if (!isOwnerOrAdmin(req.user, trainer._id)) {
      return res.status(403).json({ success: false, message: "Not authorized to submit documents for this profile" });
    }

    trainer.verificationDocuments = documents || [];
    // An already-approved trainer adding another certificate stays approved.
    // Silently dropping them back to "pending" is what made admin approvals look
    // like they had been undone.
    if (trainer.verificationStatus !== "verified") {
      trainer.verificationStatus = "pending";
    }
    await trainer.save();

    res.status(200).json({
      success: true,
      message:
        trainer.verificationStatus === "verified"
          ? "Document added to your verified profile"
          : "Verification documents submitted for review",
      data: trainer,
    });
  } catch (error: any) {
    console.error("Submit Verification Error:", error);
    res.status(500).json({ success: false, message: "Server error submitting documents" });
  }
};

export const getTrainerDashboardStats = async (req: Request, res: Response) => {
  try {
    const trainer = await Trainer.findOne({ slug: req.params.slug });
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    if (!isOwnerOrAdmin(req.user, trainer._id)) {
      return res.status(403).json({ success: false, message: "Not authorized to view this dashboard" });
    }

    const applications = await Application.find({ trainerId: trainer._id })
      .populate("jobId", "position location salaryRange employmentType")
      .populate("gymId", "gymName gymLogo slug");

    const connections = await Connection.find({ trainerId: trainer._id })
      .populate("gymId", "gymName gymLogo address slug contactPerson");

    // Vacancies obey exactly the same gate as the Find Jobs page and the apply
    // endpoint, so the dashboard can never dangle a job the trainer can't act on.
    const jobAccess = getJobAccess(trainer);
    const recommendedJobs = jobAccess.allowed
      ? await Job.find({ status: "open" })
          .limit(4)
          .populate("gymId", "gymName gymLogo address slug")
      : [];

    const activation = getActivationState(trainer.subscription);

    res.status(200).json({
      success: true,
      data: {
        trainer,
        activation,
        jobAccess,
        stats: {
          activeApplications: applications.length,
          newConnections: connections.filter(c => c.status === "pending").length,
          verificationStatus: trainer.verificationStatus,
          // Free for trainers, so a profile is live unless it was rejected.
          accountActive: trainer.verificationStatus !== "rejected",
        },
        applications,
        connections,
        recommendedJobs,
      },
    });
  } catch (error: any) {
    console.error("Get Trainer Dashboard Stats Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
