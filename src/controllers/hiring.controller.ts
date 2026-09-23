import { Request, Response } from "express";
import { Job } from "../models/Job";
import { Gym } from "../models/Gym";
import { Trainer } from "../models/Trainer";
import { Application, CANDIDATE_STAGES } from "../models/Application";
import { PIPELINE_STAGES } from "../models/Job";
import { findPlan, getGymSubscriptionState, gymVacancyStatus, IN_REVIEW_STAGES } from "../utils/hiring";
import { addMonths, nextPeriodStart } from "../utils/gymMembership";

/**
 * The admin side of the hiring workflow.
 *
 * FitWorks is the intermediary: a gym posts a requirement, the team reviews it,
 * finds trainers, and makes the introduction. Everything in this file is an
 * admin action — nothing here is reachable by a gym or a trainer.
 */

/** Vacancy board: every requirement with the counts that drive the queue. */
export const getVacancyBoard = async (req: Request, res: Response) => {
  try {
    const { stage, gymId, q } = req.query;
    const query: any = {};
    if (stage && PIPELINE_STAGES.includes(stage as any)) query.pipelineStatus = stage;
    if (gymId) query.gymId = gymId;
    if (q) {
      query.$or = [
        { position: { $regex: q as string, $options: "i" } },
        { location: { $regex: q as string, $options: "i" } },
      ];
    }

    const jobs = await Job.find(query)
      .populate("gymId", "gymName gymLogo slug address contactPerson subscription")
      .sort({ createdAt: -1 });

    const rows = await Application.find({ jobId: { $in: jobs.map((j) => j._id) } }).select("jobId status");
    const counts = new Map<string, { total: number; inReview: number }>();
    for (const r of rows) {
      const key = String(r.jobId);
      const entry = counts.get(key) || { total: 0, inReview: 0 };
      entry.total++;
      if (IN_REVIEW_STAGES.includes(r.status)) entry.inReview++;
      counts.set(key, entry);
    }

    const data = jobs.map((j) => {
      const c = counts.get(String(j._id)) || { total: 0, inReview: 0 };
      return {
        ...j.toObject(),
        gymStatus: gymVacancyStatus(j),
        shortlistedCount: c.total,
        inReviewCount: c.inReview,
      };
    });

    const byStage: Record<string, number> = {};
    for (const s of PIPELINE_STAGES) byStage[s] = 0;
    for (const j of data) byStage[j.pipelineStatus] = (byStage[j.pipelineStatus] || 0) + 1;

    res.status(200).json({ success: true, count: data.length, byStage, data });
  } catch (error: any) {
    console.error("Get Vacancy Board Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** One vacancy, the gym behind it, and every trainer on its shortlist. */
export const getVacancyDetail = async (req: Request, res: Response) => {
  try {
    const job = await Job.findById(req.params.id).populate(
      "gymId",
      "gymName gymLogo slug address contactPerson gymDescription subscription facilities specializations"
    );
    if (!job) {
      return res.status(404).json({ success: false, message: "Vacancy not found" });
    }

    const shortlist = await Application.find({ jobId: job._id })
      .sort({ createdAt: -1 })
      .populate(
        "trainerId",
        "personal professional verificationStatus slug"
      );

    res.status(200).json({
      success: true,
      data: {
        vacancy: { ...job.toObject(), gymStatus: gymVacancyStatus(job) },
        gymSubscription: getGymSubscriptionState((job.gymId as any)?.subscription),
        shortlist: shortlist.filter((s) => s.trainerId),
      },
    });
  } catch (error: any) {
    console.error("Get Vacancy Detail Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** Moves a vacancy along the pipeline. */
export const updateVacancyStage = async (req: Request, res: Response) => {
  try {
    const { pipelineStatus, adminNotes } = req.body;

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Vacancy not found" });
    }

    if (pipelineStatus !== undefined) {
      if (!PIPELINE_STAGES.includes(pipelineStatus)) {
        return res.status(400).json({ success: false, message: "Unknown stage" });
      }
      job.pipelineStatus = pipelineStatus;
      // Filled and closed are endings — the vacancy stops being open with them,
      // so a gym is never shown a live role that is actually finished.
      if (pipelineStatus === "filled" || pipelineStatus === "closed") {
        job.status = "closed";
      } else if (job.status === "closed") {
        job.status = "open";
      }
    }
    if (adminNotes !== undefined) job.adminNotes = adminNotes;

    await job.save();
    res.status(200).json({ success: true, data: { ...job.toObject(), gymStatus: gymVacancyStatus(job) } });
  } catch (error: any) {
    console.error("Update Vacancy Stage Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Trainers to consider for a vacancy.
 *
 * Only approved trainers are offered: a gym is never shown somebody whose
 * documents we haven't checked. Anyone already on this vacancy's shortlist is
 * filtered out so the picker can't create a duplicate.
 */
export const searchTrainersForVacancy = async (req: Request, res: Response) => {
  try {
    const { q, city, specialization, experience, status = "verified", limit = "40" } = req.query;

    const query: any = {};
    if (status && status !== "any") query.verificationStatus = status;
    if (city) query["personal.city"] = { $regex: city as string, $options: "i" };
    if (specialization) query["professional.specializations"] = { $regex: specialization as string, $options: "i" };
    if (experience) query["professional.yearsOfExperience"] = { $gte: Number(experience) || 0 };
    if (q) {
      query.$or = [
        { "personal.fullName": { $regex: q as string, $options: "i" } },
        { "personal.city": { $regex: q as string, $options: "i" } },
        { "professional.professionalTitle": { $regex: q as string, $options: "i" } },
        { "professional.specializations": { $regex: q as string, $options: "i" } },
      ];
    }

    if (req.query.jobId) {
      const taken = await Application.find({ jobId: String(req.query.jobId) }).select("trainerId");
      if (taken.length) query._id = { $nin: taken.map((t) => t.trainerId) };
    }

    const trainers = await Trainer.find(query)
      .select("personal professional verificationStatus slug createdAt")
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 40, 100));

    res.status(200).json({ success: true, count: trainers.length, data: trainers });
  } catch (error: any) {
    console.error("Search Trainers Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** Puts a trainer on a vacancy's shortlist. */
export const shortlistTrainer = async (req: Request, res: Response) => {
  try {
    const { trainerId, adminNotes } = req.body;

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Vacancy not found" });
    }
    const trainer = await Trainer.findById(trainerId).select("_id");
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    const row = await Application.create({
      jobId: job._id,
      trainerId: trainer._id,
      gymId: job.gymId,
      status: "shortlisted",
      source: "admin",
      adminNotes,
    });

    // Adding the first candidate is what "finding trainers" turns into.
    if (["new", "under_review", "finding_trainers"].includes(job.pipelineStatus)) {
      job.pipelineStatus = "trainers_shortlisted";
      await job.save();
    }

    const populated = await Application.findById(row._id).populate(
      "trainerId",
      "personal professional verificationStatus slug"
    );

    res.status(201).json({ success: true, data: populated });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "This trainer is already on the shortlist" });
    }
    console.error("Shortlist Trainer Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** Moves a shortlisted trainer along: contacted, interested, shared, hired… */
export const updateShortlistEntry = async (req: Request, res: Response) => {
  try {
    const { status, adminNotes } = req.body;

    const row = await Application.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Shortlist entry not found" });
    }

    if (status !== undefined) {
      if (!CANDIDATE_STAGES.includes(status)) {
        return res.status(400).json({ success: false, message: "Unknown stage" });
      }
      row.status = status;
      if (status === "contacted" && !row.contactedAt) row.contactedAt = new Date();
      // "shared" is the moment this trainer becomes visible to the gym.
      if (["shared", "connected", "hired"].includes(status) && !row.sharedAt) row.sharedAt = new Date();
    }
    if (adminNotes !== undefined) row.adminNotes = adminNotes;

    await row.save();

    // Keep the vacancy's stage honest about what has actually happened on it.
    if (status) {
      const job = await Job.findById(row.jobId);
      if (job && job.pipelineStatus !== "filled" && job.pipelineStatus !== "closed") {
        if (status === "hired") {
          job.pipelineStatus = "filled";
          job.status = "closed";
        } else if (["shared", "connected"].includes(status)) {
          job.pipelineStatus = status === "connected" ? "connecting" : "gym_contacted";
        }
        await job.save();
      }
    }

    const populated = await Application.findById(row._id).populate(
      "trainerId",
      "personal professional verificationStatus slug"
    );
    res.status(200).json({ success: true, data: populated });
  } catch (error: any) {
    console.error("Update Shortlist Entry Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const removeShortlistEntry = async (req: Request, res: Response) => {
  try {
    const row = await Application.findByIdAndDelete(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Shortlist entry not found" });
    }
    res.status(200).json({ success: true, message: "Removed from shortlist" });
  } catch (error: any) {
    console.error("Remove Shortlist Entry Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Grants or revokes a gym's membership by hand.
 *
 * Gyms pay through Razorpay; this is the support override for the cases a
 * gateway cannot cover — comping a partner, honouring a payment that failed to
 * come back, or cutting off an account. It writes no payment record, because
 * no payment was taken, and it is logged so a free term is never mistaken for
 * a purchased one.
 *
 * The expiry is computed from the plan's own length rather than typed in, so
 * the two cannot drift apart.
 */
export const updateGymSubscription = async (req: Request, res: Response) => {
  try {
    const { plan, action } = req.body;

    const gym = await Gym.findById(req.params.id);
    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }

    if (action === "deactivate") {
      gym.subscription.status = "inactive";
      console.log(`Admin ${req.user?.userId} deactivated membership for ${gym.slug}.`);
    } else {
      const chosen = findPlan(plan);
      if (!chosen) {
        return res.status(400).json({ success: false, message: "Unknown plan" });
      }
      // Extends from the current expiry, exactly as a paid renewal would, so a
      // comped month on top of a live term doesn't throw away what's left.
      const start = nextPeriodStart(gym.subscription?.expiresAt);
      const end = addMonths(start, chosen.months);

      gym.subscription.plan = chosen.id;
      gym.subscription.status = "active";
      if (!gym.subscription.startedAt) gym.subscription.startedAt = new Date();
      gym.subscription.expiresAt = end;
      gym.subscription.amount = chosen.price;
      console.log(
        `Admin ${req.user?.userId} granted ${chosen.name} to ${gym.slug} until ${end
          .toISOString()
          .slice(0, 10)} — no payment taken.`
      );
    }

    await gym.save();
    res.status(200).json({
      success: true,
      data: gym,
      subscription: getGymSubscriptionState(gym.subscription),
    });
  } catch (error: any) {
    console.error("Update Gym Subscription Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
