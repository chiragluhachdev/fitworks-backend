import { Request, Response } from "express";
import { User } from "../models/User";
import { Gym } from "../models/Gym";
import { Trainer } from "../models/Trainer";
import { Job } from "../models/Job";
import { Application } from "../models/Application";
import { Connection } from "../models/Connection";
import { SystemSetting } from "../models/SystemSetting";
import { getActivationState, activatedTrainerFilter, ACTIVATION_AMOUNT_PAISE } from "../utils/subscription";
import {
  getGymSubscriptionState,
  gymVacancyStatus,
  IN_REVIEW_STAGES,
  getPricedPlans,
  clearPlanCache,
  DEFAULT_GYM_PRICES,
} from "../utils/hiring";

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
    // The hiring queue: what the team has to act on today.
    const newRequirements = await Job.countDocuments({ pipelineStatus: { $in: ["new", "under_review"] } });
    const inProgress = await Job.countDocuments({
      pipelineStatus: { $in: ["finding_trainers", "trainers_shortlisted", "gym_contacted", "connecting"] },
    });
    const filledVacancies = await Job.countDocuments({ pipelineStatus: "filled" });
    const trainersInReview = await Application.countDocuments({ status: { $in: IN_REVIEW_STAGES } });
    const payingGyms = await Gym.countDocuments({
      "subscription.status": "active",
      $or: [{ "subscription.expiresAt": { $gt: new Date() } }, { "subscription.expiresAt": null }],
    });
    const lapsedGyms = await Gym.countDocuments({
      "subscription.expiresAt": { $lt: new Date() },
    });
    const activeMembers = await Trainer.countDocuments(activatedTrainerFilter());
    const lapsedMembers = totalTrainers - activeMembers;

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
        activeMembers,
        lapsedMembers,
        newRequirements,
        inProgress,
        filledVacancies,
        trainersInReview,
        payingGyms,
        lapsedGyms,
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
    // Attach derived membership status so admin can see who has lapsed, plus the
    // combined answer to "is this trainer actually live on the platform?" —
    // approved by an admin AND currently paid up.
    const data = trainers.map((t) => {
      const activation = getActivationState(t.subscription);
      return {
        ...t.toObject(),
        activation,
        accountActive: t.verificationStatus === "verified",
        totalPaid: activation.totalPaid,
      };
    });
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getGyms = async (req: Request, res: Response) => {
  try {
    const gyms = await Gym.find().sort({ createdAt: -1 });
    // Membership is derived, never trusted from the stored status alone — a
    // term that lapsed since the last login must not read as active.
    const data = gyms.map((g) => ({
      ...g.toObject(),
      subscriptionState: getGymSubscriptionState(g.subscription),
    }));
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getVacancies = async (req: Request, res: Response) => {
  try {
    const jobs = await Job.find()
      .populate("gymId", "gymName gymLogo address city slug location website instagram numberOfLocations")
      .sort({ createdAt: -1 });
    const data = jobs.map((j) => ({ ...j.toObject(), gymStatus: gymVacancyStatus(j) }));
    res.status(200).json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getApplications = async (req: Request, res: Response) => {
  try {
    const applications = await Application.find()
      .populate("jobId", "position")
      .populate("trainerId", "personal.fullName personal.profilePhoto slug")
      .populate("gymId", "gymName gymLogo slug")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: applications });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getConnections = async (req: Request, res: Response) => {
  try {
    const connections = await Connection.find()
      .populate("gymId", "gymName gymLogo slug")
      .populate("trainerId", "personal.fullName personal.profilePhoto slug")
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
    // Everything that pointed at this gym goes too. Leaving orphans behind is
    // what makes deleted accounts keep half-appearing across the app.
    await Job.deleteMany({ gymId: gym._id });
    await Application.deleteMany({ gymId: gym._id });
    await Connection.deleteMany({ gymId: gym._id });
    if (gym.userId) await User.findByIdAndDelete(gym.userId);

    res.status(200).json({
      success: true,
      message: "Gym, its login, vacancies, applications and invitations were all removed",
    });
  } catch (error: any) {
    console.error("Admin Delete Gym Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


/**
 * Removes a trainer completely: profile, login, applications and invitations.
 *
 * Deleting only the Trainer document (straight from the database, say) leaves
 * the User row behind — the person can still log in, and their dashboard URL
 * still resolves. This is the supported way to remove someone.
 */
export const deleteTrainer = async (req: Request, res: Response) => {
  try {
    const trainer = await Trainer.findById(req.params.id);
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    await Trainer.findByIdAndDelete(trainer._id);
    await Application.deleteMany({ trainerId: trainer._id });
    await Connection.deleteMany({ trainerId: trainer._id });
    if (trainer.userId) await User.findByIdAndDelete(trainer.userId);

    res.status(200).json({
      success: true,
      message: `${trainer.personal?.fullName || "Trainer"} and their login, applications and invitations were removed`,
    });
  } catch (error: any) {
    console.error("Admin Delete Trainer Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** Everything admin needs on one trainer: profile, account, documents, billing. */
export const getTrainerDetail = async (req: Request, res: Response) => {
  try {
    const trainer = await Trainer.findById(req.params.id);
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    const account = await User.findById(trainer.userId).select("email phone phoneVerified role createdAt");
    const applications = await Application.find({ trainerId: trainer._id })
      .populate("jobId", "position salaryRange location")
      .populate("gymId", "gymName slug")
      .sort({ createdAt: -1 });
    const connections = await Connection.find({ trainerId: trainer._id })
      .populate("gymId", "gymName slug")
      .sort({ createdAt: -1 });

    const activation = getActivationState(trainer.subscription);
    const history = [...(trainer.subscription?.history || [])].sort(
      (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
    );

    res.status(200).json({
      success: true,
      data: {
        trainer,
        account,
        activation,
        billingHistory: history,
        applications,
        connections,
        counts: {
          applications: applications.length,
          connections: connections.length,
          documents: trainer.verificationDocuments?.length || 0,
        },
      },
    });
  } catch (error: any) {
    console.error("Admin Trainer Detail Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** Membership ledger across all trainers, with revenue totals. */
export const getSubscriptions = async (req: Request, res: Response) => {
  try {
    const trainers = await Trainer.find().sort({ "subscription.activatedAt": -1, createdAt: -1 });

    const rows = trainers.map((t) => {
      const activation = getActivationState(t.subscription);
      const history = t.subscription?.history || [];
      return {
        _id: t._id,
        slug: t.slug,
        fullName: t.personal?.fullName,
        phone: t.personal?.phone,
        city: t.personal?.city,
        verificationStatus: t.verificationStatus,
        activation,
        lastPaidAt: history.length ? history[history.length - 1].paidAt : null,
        totalPaid: activation.totalPaid,
      };
    });

    const summary = {
      total: rows.length,
      active: rows.filter((r) => r.activation.isActive).length,
      neverPaid: rows.filter((r) => !r.activation.isActive).length,
      // Recorded as charged, never recomputed from current pricing.
      lifetimeRevenue: rows.reduce((sum, r) => sum + r.totalPaid, 0),
      // What the remaining unactivated trainers are worth if they all pay.
      pipelineValue:
        rows.filter((r) => !r.activation.isActive).length * (ACTIVATION_AMOUNT_PAISE / 100),
    };

    res.status(200).json({ success: true, summary, data: rows });
  } catch (error: any) {
    console.error("Admin Subscriptions Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getSettings = async (req: Request, res: Response) => {
  try {
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = await SystemSetting.create({});
    }
    res.status(200).json({
      success: true,
      data: settings,
      // What the prices currently in effect actually work out to, so the
      // settings screen shows the same figures a gym will see.
      plans: await getPricedPlans(),
      defaults: DEFAULT_GYM_PRICES,
    });
  } catch (error: any) {
    console.error("Admin Get Settings Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** A price must be a whole number of rupees, and a sane one. */
const readPrice = (value: unknown, label: string): { value?: number; error?: string } => {
  const n = Number(value);
  if (!Number.isFinite(n)) return { error: `${label} must be a number.` };
  if (!Number.isInteger(n)) return { error: `${label} must be a whole number of rupees.` };
  if (n < 1) return { error: `${label} must be at least ₹1.` };
  if (n > 500000) return { error: `${label} looks like a mistake — cap is ₹5,00,000.` };
  return { value: n };
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = new SystemSetting();
    }

    if (req.body.otpEnabled !== undefined) {
      settings.otpEnabled = req.body.otpEnabled;
    }

    const incoming = req.body.gymPlanPrices;
    if (incoming && typeof incoming === "object") {
      // A settings document saved before prices existed has no such field.
      if (!settings.gymPlanPrices) {
        settings.gymPlanPrices = { ...DEFAULT_GYM_PRICES };
      }

      const labels: Record<string, string> = {
        monthly: "The monthly price",
        quarterly: "The 3-month price",
        annual: "The annual price",
      };

      for (const key of ["monthly", "quarterly", "annual"] as const) {
        if (incoming[key] === undefined || incoming[key] === "") continue;
        const { value, error } = readPrice(incoming[key], labels[key]);
        if (error) return res.status(400).json({ success: false, message: error });
        settings.gymPlanPrices[key] = value!;
      }

      const { monthly, quarterly, annual } = settings.gymPlanPrices;
      // A longer term costing more in total than a shorter one is almost
      // certainly a typo, and it would be visibly absurd on the pricing page.
      if (quarterly < monthly || annual < quarterly) {
        return res.status(400).json({
          success: false,
          message: "Each longer term should cost more in total than the one before it.",
        });
      }

      console.log(
        `Admin ${req.user?.userId} set gym prices to ₹${monthly} / ₹${quarterly} / ₹${annual}.`
      );
    }

    await settings.save();
    // Checkout reads prices through a short cache; drop it so the change is
    // live immediately rather than up to a minute later.
    clearPlanCache();

    res.status(200).json({
      success: true,
      data: settings,
      plans: await getPricedPlans(),
    });
  } catch (error: any) {
    console.error("Admin Update Settings Error:", error);
    res.status(500).json({ success: false, message: error?.message || "Server error" });
  }
};
