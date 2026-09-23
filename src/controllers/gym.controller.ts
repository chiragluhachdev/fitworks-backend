import { Request, Response } from "express";
import { Gym } from "../models/Gym";
import { Job } from "../models/Job";
import { Application } from "../models/Application";
import { isOwnerOrAdmin } from "../middleware/auth.middleware";
import {
  GYM_PLANS,
  findPlan,
  getGymSubscriptionState,
  gymVacancyStatus,
  IN_REVIEW_STAGES,
  SHARED_WITH_GYM_STAGES,
} from "../utils/hiring";

/**
 * How finished a gym's profile is, as a percentage.
 *
 * Weighted by what actually helps us place trainers: a gym with no description
 * and no contact person is far harder to hire for than one missing its
 * Instagram handle.
 */
const profileCompletion = (gym: any) => {
  const checks: { label: string; done: boolean; weight: number }[] = [
    { label: "Gym name", done: !!gym.gymName, weight: 10 },
    { label: "Logo", done: !!gym.gymLogo, weight: 10 },
    { label: "Cover image", done: !!gym.coverImage, weight: 5 },
    { label: "About the gym", done: (gym.gymDescription || "").length >= 40, weight: 15 },
    { label: "Full address", done: !!gym.address?.street && !!gym.address?.city, weight: 15 },
    { label: "Contact person", done: !!gym.contactPerson?.name && !!gym.contactPerson?.phone, weight: 15 },
    { label: "Facilities", done: (gym.facilities || []).length > 0, weight: 10 },
    { label: "Specializations", done: (gym.specializations || []).length > 0, weight: 10 },
    { label: "Hiring preferences", done: !!gym.hiringInformation?.salaryBudget, weight: 5 },
    { label: "Website or Instagram", done: !!gym.website || !!gym.instagram, weight: 5 },
  ];

  const percent = checks.reduce((sum, c) => sum + (c.done ? c.weight : 0), 0);
  return { percent, missing: checks.filter((c) => !c.done).map((c) => c.label) };
};

export const getGymBySlug = async (req: Request, res: Response) => {
  try {
    const gym = await Gym.findOne({ slug: req.params.slug });
    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }
    // The public profile is just the gym. Its membership and how finished the
    // profile is are the owner's business, and an admin's.
    const payload: Record<string, unknown> = { success: true, data: gym };
    if (isOwnerOrAdmin(req.user, gym._id)) {
      payload.subscription = getGymSubscriptionState(gym.subscription);
      payload.completion = profileCompletion(gym);
    }

    res.status(200).json(payload);
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

    // A gym account may only edit itself. Admins go through /api/admin/gyms/:id.
    if (!isOwnerOrAdmin(req.user, gym._id)) {
      return res.status(403).json({ success: false, message: "Not authorized to edit this gym" });
    }

    if (req.body.gymName) gym.gymName = req.body.gymName;
    if (req.body.gymLogo !== undefined) gym.gymLogo = req.body.gymLogo;
    if (req.body.coverImage !== undefined) gym.coverImage = req.body.coverImage;
    if (req.body.gymDescription) gym.gymDescription = req.body.gymDescription;
    if (req.body.website !== undefined) gym.website = req.body.website;
    if (req.body.instagram !== undefined) gym.instagram = req.body.instagram;
    if (req.body.numberOfLocations !== undefined) gym.numberOfLocations = req.body.numberOfLocations;
    if (Array.isArray(req.body.facilities)) gym.facilities = req.body.facilities;
    if (Array.isArray(req.body.specializations)) gym.specializations = req.body.specializations;
    if (req.body.address) gym.address = { ...gym.address, ...req.body.address };
    if (req.body.hiringInformation) gym.hiringInformation = { ...gym.hiringInformation, ...req.body.hiringInformation };
    if (req.body.contactPerson) gym.contactPerson = { ...gym.contactPerson, ...req.body.contactPerson };

    await gym.save();

    res.status(200).json({
      success: true,
      data: gym,
      completion: profileCompletion(gym),
    });
  } catch (error: any) {
    console.error("Update Gym Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Everything the Overview screen needs, in one round trip.
 *
 * "Trainers being reviewed" counts the people our team is actively working on
 * for this gym — not applications, which gyms no longer receive.
 */
export const getGymDashboardStats = async (req: Request, res: Response) => {
  try {
    const gym = await Gym.findOne({ slug: req.params.slug });
    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }

    if (!isOwnerOrAdmin(req.user, gym._id)) {
      return res.status(403).json({ success: false, message: "Not authorized to view this dashboard" });
    }

    const jobs = await Job.find({ gymId: gym._id }).sort({ createdAt: -1 });
    const jobIds = jobs.map((j) => j._id);

    const candidates = await Application.find({ gymId: gym._id }).select("jobId status");

    const perJob = new Map<string, { inReview: number; shared: number }>();
    for (const c of candidates) {
      const key = String(c.jobId);
      const entry = perJob.get(key) || { inReview: 0, shared: 0 };
      if (IN_REVIEW_STAGES.includes(c.status)) entry.inReview++;
      if (SHARED_WITH_GYM_STAGES.includes(c.status)) entry.shared++;
      perJob.set(key, entry);
    }

    const withCounts = jobs.map((j) => {
      const counts = perJob.get(String(j._id)) || { inReview: 0, shared: 0 };
      return {
        ...j.toObject(),
        gymStatus: gymVacancyStatus(j),
        candidatesInReview: counts.inReview,
        candidatesShared: counts.shared,
      };
    });

    const open = withCounts.filter((j) => j.gymStatus === "active" || j.gymStatus === "under_review");

    res.status(200).json({
      success: true,
      data: {
        gym,
        subscription: getGymSubscriptionState(gym.subscription),
        completion: profileCompletion(gym),
        stats: {
          totalVacancies: jobs.length,
          activeVacancies: open.length,
          trainersInReview: candidates.filter((c) => IN_REVIEW_STAGES.includes(c.status)).length,
          trainersShared: candidates.filter((c) => SHARED_WITH_GYM_STAGES.includes(c.status)).length,
          filled: jobs.filter((j) => j.pipelineStatus === "filled").length,
        },
        vacancies: withCounts,
        activeVacancies: open.slice(0, 5),
      },
    });
  } catch (error: any) {
    console.error("Get Gym Dashboard Stats Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Trainers the FitWorks team has put forward to this gym.
 *
 * Only rows we have actually shared are returned, and only the fields a gym
 * needs to judge a fit. A phone number or an email address is never included —
 * the introduction is made by our team, not by the gym reaching out cold.
 */
export const getGymRecommendations = async (req: Request, res: Response) => {
  try {
    const gym = await Gym.findOne({ slug: req.params.slug });
    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }
    if (!isOwnerOrAdmin(req.user, gym._id)) {
      return res.status(403).json({ success: false, message: "Not authorized to view this gym" });
    }

    const rows = await Application.find({
      gymId: gym._id,
      status: { $in: SHARED_WITH_GYM_STAGES },
    })
      .sort({ sharedAt: -1, updatedAt: -1 })
      .populate("jobId", "position location requirements")
      .populate(
        "trainerId",
        "personal.fullName personal.city personal.location personal.profilePhoto professional verificationStatus slug"
      );

    // Strip anything the gym shouldn't see, including our internal notes.
    const data = rows
      .filter((r) => r.trainerId)
      .map((r) => {
        const t: any = r.trainerId;
        return {
          _id: r._id,
          status: r.status,
          gymInterest: r.gymInterest,
          sharedAt: r.sharedAt,
          vacancy: r.jobId,
          trainer: {
            fullName: t.personal?.fullName,
            city: t.personal?.city,
            location: t.personal?.location,
            profilePhoto: t.personal?.profilePhoto,
            verificationStatus: t.verificationStatus,
            professionalTitle: t.professional?.professionalTitle,
            yearsOfExperience: t.professional?.yearsOfExperience,
            specializations: t.professional?.specializations || [],
            skills: t.professional?.skills || [],
            certifications: (t.professional?.certifications || []).map((c: any) => c.name),
            education: t.professional?.education,
            bio: t.professional?.bio,
          },
        };
      });

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error: any) {
    console.error("Get Gym Recommendations Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * The gym's reply to a trainer we put forward.
 *
 * It records interest and nothing more — our team still makes the introduction,
 * so this never exposes the trainer's contact details.
 */
export const setGymInterest = async (req: Request, res: Response) => {
  try {
    const { interest } = req.body;
    if (!["none", "interested", "contact_requested"].includes(interest)) {
      return res.status(400).json({ success: false, message: "Invalid response" });
    }

    const row = await Application.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Recommendation not found" });
    }
    if (!isOwnerOrAdmin(req.user, row.gymId)) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    // A gym can only respond to someone we have actually shown them.
    if (!SHARED_WITH_GYM_STAGES.includes(row.status)) {
      return res.status(403).json({ success: false, message: "This trainer hasn't been shared with you yet" });
    }

    row.gymInterest = interest;
    await row.save();

    res.status(200).json({ success: true, data: { _id: row._id, gymInterest: row.gymInterest } });
  } catch (error: any) {
    console.error("Set Gym Interest Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** The plan catalogue. Public — the pricing page reads it too. */
export const getGymPlans = async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: GYM_PLANS });
};

/**
 * Records that a gym wants a plan.
 *
 * Billing is handled by our team by hand for now, so this takes no money and
 * grants no access — it puts the request in front of an admin.
 */
export const requestGymPlan = async (req: Request, res: Response) => {
  try {
    const plan = findPlan(req.body?.plan);
    if (!plan) {
      return res.status(400).json({ success: false, message: "Unknown plan" });
    }

    const gym = await Gym.findOne({ slug: req.params.slug });
    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }
    if (!isOwnerOrAdmin(req.user, gym._id)) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    gym.subscription.requestedPlan = plan.id;
    gym.subscription.requestedAt = new Date();
    await gym.save();

    res.status(200).json({
      success: true,
      message: "Our team will get in touch to set up your plan.",
      subscription: getGymSubscriptionState(gym.subscription),
    });
  } catch (error: any) {
    console.error("Request Gym Plan Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
