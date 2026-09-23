import { Request, Response } from "express";
import { Job } from "../models/Job";
import { Gym } from "../models/Gym";
import { Trainer } from "../models/Trainer";
import { Application } from "../models/Application";
import { isOwnerOrAdmin } from "../middleware/auth.middleware";
import { getJobAccess } from "../utils/subscription";
import { gymVacancyStatus, IN_REVIEW_STAGES, SHARED_WITH_GYM_STAGES } from "../utils/hiring";

/** Trims a string field, returning undefined for blanks so they aren't stored. */
const text = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || undefined;
};

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
      branchName,
      workingHours,
      requirementsText,
      additionalInfo,
      numberOfOpenings,
      applicationDeadline,
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

    // The gym id arrives in the body, so it has to be checked — otherwise one
    // gym could post vacancies in another gym's name.
    if (!isOwnerOrAdmin(req.user, targetGymId)) {
      return res.status(403).json({ success: false, message: "Not authorized to post vacancies for this gym" });
    }

    const job = await Job.create({
      gymId: targetGymId,
      position,
      description,
      requirements: {
        experience: requirements?.experience || "1-3 Years",
        specialization: requirements?.specialization || "General Fitness",
        trainerType: text(requirements?.trainerType),
      },
      salaryRange,
      employmentType,
      location,
      branchName: text(branchName),
      workingHours: text(workingHours),
      requirementsText: text(requirementsText),
      additionalInfo: text(additionalInfo),
      numberOfOpenings: Number(numberOfOpenings) || 1,
      applicationDeadline: applicationDeadline || undefined,
      status: "open",
      // Every new requirement lands in the team's queue.
      pipelineStatus: "new",
    });

    res.status(201).json({ success: true, data: job });
  } catch (error: any) {
    console.error("Create Job Error:", error);
    res.status(500).json({ success: false, message: "Server error creating vacancy" });
  }
};

export const getJobs = async (req: Request, res: Response) => {
  try {
    // A signed-in trainer must be approved before vacancies are returned.
    // Gyms and admins are unaffected.
    if (req.user?.role === "trainer") {
      const trainer = await Trainer.findById(req.user.profileId).select(
        "verificationStatus subscription"
      );
      const access = getJobAccess(trainer);
      if (!access.allowed) {
        return res.status(403).json({
          success: false,
          locked: true,
          reason: access.reason,
          title: access.title,
          message: access.message,
          data: [],
        });
      }
    }

    const { status = "open", specialization, location, type } = req.query;
    const query: any = {};

    if (status) query.status = status;
    if (specialization) query["requirements.specialization"] = { $regex: specialization, $options: "i" };
    if (location) query.location = { $regex: location, $options: "i" };
    if (type) query.employmentType = { $regex: type, $options: "i" };

    // A role the team has already filled isn't an opportunity any more.
    query.pipelineStatus = { $ne: "filled" };

    const jobs = await Job.find(query)
      .sort({ createdAt: -1 })
      .populate("gymId", "gymName gymLogo address city slug website instagram gymDescription numberOfLocations");

    res.status(200).json({ success: true, count: jobs.length, data: jobs });
  } catch (error: any) {
    console.error("Get Jobs Error:", error);
    res.status(500).json({ success: false, message: "Server error fetching jobs" });
  }
};

/**
 * A gym's own vacancies, each with how many trainers we're working on for it.
 *
 * The counts are the point of the screen: they are the only signal a gym gets
 * that its requirement is moving.
 */
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

    // How the search is going is between us and the gym that asked for it.
    const owner = isOwnerOrAdmin(req.user, targetGymId);
    const counts = new Map<string, { inReview: number; shared: number }>();

    if (owner) {
      const candidates = await Application.find({ gymId: targetGymId }).select("jobId status");
      for (const c of candidates) {
        const key = String(c.jobId);
        const entry = counts.get(key) || { inReview: 0, shared: 0 };
        if (IN_REVIEW_STAGES.includes(c.status)) entry.inReview++;
        if (SHARED_WITH_GYM_STAGES.includes(c.status)) entry.shared++;
        counts.set(key, entry);
      }
    }

    const data = jobs.map((j) => {
      const c = counts.get(String(j._id)) || { inReview: 0, shared: 0 };
      const row: any = { ...j.toObject(), gymStatus: gymVacancyStatus(j) };
      if (owner) {
        row.candidatesInReview = c.inReview;
        row.candidatesShared = c.shared;
      } else {
        delete row.adminNotes;
      }
      return row;
    });

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error("Get Jobs By Gym Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getJobById = async (req: Request, res: Response) => {
  try {
    const job = await Job.findById(req.params.id).populate(
      "gymId",
      "gymName gymLogo gymDescription address slug contactPerson"
    );
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    const data: any = { ...job.toObject(), gymStatus: gymVacancyStatus(job) };

    // Only the gym that owns the vacancy (or an admin) is told how the search
    // is going. Internal notes stay internal either way.
    if (isOwnerOrAdmin(req.user, (job.gymId as any)?._id ?? job.gymId)) {
      const rows = await Application.find({ jobId: job._id }).select("status");
      data.candidatesInReview = rows.filter((r) => IN_REVIEW_STAGES.includes(r.status)).length;
      data.candidatesShared = rows.filter((r) => SHARED_WITH_GYM_STAGES.includes(r.status)).length;
    } else {
      delete data.adminNotes;
    }

    res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error("Get Job Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateJob = async (req: Request, res: Response) => {
  try {
    const existing = await Job.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    if (!isOwnerOrAdmin(req.user, existing.gymId)) {
      return res.status(403).json({ success: false, message: "Not authorized to edit this vacancy" });
    }

    // gymId is never reassignable here, and the working stage belongs to the
    // team — a gym closing a role must not rewrite where our search had got to.
    const { gymId: _gym, pipelineStatus: _stage, adminNotes: _notes, ...updates } = req.body ?? {};
    if (req.user?.role === "admin" && req.body?.pipelineStatus) {
      (updates as any).pipelineStatus = req.body.pipelineStatus;
    }

    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    res.status(200).json({ success: true, data: { ...job!.toObject(), gymStatus: gymVacancyStatus(job!) } });
  } catch (error: any) {
    console.error("Update Job Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteJob = async (req: Request, res: Response) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    if (!isOwnerOrAdmin(req.user, job.gymId)) {
      return res.status(403).json({ success: false, message: "Not authorized to remove this vacancy" });
    }

    await Job.findByIdAndDelete(req.params.id);
    // Candidate rows pointing at a deleted vacancy would render as blank rows
    // in the admin board, so they go with it.
    await Application.deleteMany({ jobId: job._id });

    res.status(200).json({ success: true, message: "Vacancy removed successfully" });
  } catch (error: any) {
    console.error("Delete Job Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
