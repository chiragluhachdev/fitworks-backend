import { Request, Response } from "express";
import { Trainer } from "../models/Trainer";
import { Job } from "../models/Job";
import { Application } from "../models/Application";
import { Connection } from "../models/Connection";

export const getTrainers = async (req: Request, res: Response) => {
  try {
    const { location, experience, specialization, type, limit = 20, page = 1 } = req.query;

    const query: any = {
      verificationStatus: "verified", // Only show verified trainers in public search
    };

    if (location) {
      query["personal.city"] = { $regex: location, $options: "i" };
    }
    if (experience) {
      query["professional.yearsOfExperience"] = { $gte: Number(experience) };
    }
    if (specialization) {
      query["professional.specializations"] = { $regex: specialization, $options: "i" };
    }
    if (type) {
      query["workPreferences.employmentType"] = { $in: [type] };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const trainers = await Trainer.find(query)
      .skip(skip)
      .limit(Number(limit))
      .select("-verificationDocuments -createdAt -updatedAt");

    const total = await Trainer.countDocuments(query);

    res.status(200).json({
      success: true,
      count: trainers.length,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      data: trainers,
    });
  } catch (error: any) {
    console.error("Get Trainers Error:", error);
    res.status(500).json({ success: false, message: "Server error while fetching trainers" });
  }
};

export const getTrainerBySlug = async (req: Request, res: Response) => {
  try {
    const trainer = await Trainer.findOne({ slug: req.params.slug });

    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    res.status(200).json({
      success: true,
      data: trainer,
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
    const trainer = await Trainer.findOneAndUpdate(
      { slug: req.params.slug },
      { 
        $set: { 
          verificationDocuments: documents || [],
          verificationStatus: "pending" 
        } 
      },
      { new: true }
    );

    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    res.status(200).json({ 
      success: true, 
      message: "Verification documents submitted for review",
      data: trainer 
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

    const applications = await Application.find({ trainerId: trainer._id })
      .populate("jobId", "position location salaryRange employmentType")
      .populate("gymId", "gymName gymLogo slug");

    const connections = await Connection.find({ trainerId: trainer._id })
      .populate("gymId", "gymName gymLogo address slug contactPerson");

    const recommendedJobs = await Job.find({ status: "open" })
      .limit(4)
      .populate("gymId", "gymName gymLogo address slug");

    res.status(200).json({
      success: true,
      data: {
        trainer,
        stats: {
          profileViews: 48,
          activeApplications: applications.length,
          newConnections: connections.filter(c => c.status === "pending").length,
          verificationStatus: trainer.verificationStatus,
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
