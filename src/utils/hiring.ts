import type { PipelineStage } from "../models/Job";
import type { CandidateStage } from "../models/Application";

/**
 * Gym membership plans.
 *
 * Every plan carries the same features — the only thing that changes is how
 * long it runs for, and the rate that falls out of that. Prices are in rupees.
 */
export const GYM_PLANS = [
  { id: "monthly", name: "Monthly", price: 199, months: 1 },
  { id: "quarterly", name: "3 Months", price: 499, months: 3 },
  { id: "annual", name: "Annual", price: 999, months: 12 },
] as const;

export type GymPlanId = (typeof GYM_PLANS)[number]["id"];

export const findPlan = (id: unknown) =>
  GYM_PLANS.find((p) => p.id === id) ?? null;

export interface GymSubscriptionState {
  plan: string;
  planName: string;
  isActive: boolean;
  status: "inactive" | "active" | "expired";
  startedAt: Date | null;
  expiresAt: Date | null;
  /** Whole days remaining, or null when there is no active term. */
  daysLeft: number | null;
  requestedPlan: string | null;
}

/**
 * Derives the live membership state from what is stored.
 *
 * An expiry date in the past means expired no matter what `status` says, so a
 * term that lapses between logins is never shown as active.
 */
export const getGymSubscriptionState = (sub: any): GymSubscriptionState => {
  const expiresAt = sub?.expiresAt ? new Date(sub.expiresAt) : null;
  const lapsed = !!expiresAt && expiresAt.getTime() < Date.now();
  const active = sub?.status === "active" && !lapsed;

  return {
    plan: sub?.plan || "none",
    planName: findPlan(sub?.plan)?.name || "No plan",
    isActive: active,
    status: active ? "active" : lapsed ? "expired" : sub?.status || "inactive",
    startedAt: sub?.startedAt ? new Date(sub.startedAt) : null,
    expiresAt,
    daysLeft: active && expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000) : null,
    requestedPlan: sub?.requestedPlan || null,
  };
};

/* ───────────────────────── Vacancy status ───────────────────────── */

export type GymVacancyStatus = "active" | "under_review" | "filled" | "closed";

/**
 * What a gym should be told a vacancy is doing.
 *
 * The team's eight working stages are more detail than a gym owner needs, so
 * they collapse into four. Both sides read from the same pipeline field, which
 * is why the two views can never disagree.
 */
export const gymVacancyStatus = (job: {
  status?: string;
  pipelineStatus?: PipelineStage | string;
}): GymVacancyStatus => {
  const stage = job?.pipelineStatus || "new";
  if (stage === "filled") return "filled";
  if (job?.status === "closed" || stage === "closed") return "closed";
  if (stage === "new" || stage === "under_review") return "under_review";
  return "active";
};

/** Candidate stages that mean "the team is working on this person right now". */
export const IN_REVIEW_STAGES: CandidateStage[] = [
  "shortlisted",
  "contacted",
  "interested",
  "shared",
  "reviewing",
  "applied",
];

/** Candidate stages a gym is allowed to see. Nothing before we've shared it. */
export const SHARED_WITH_GYM_STAGES: CandidateStage[] = ["shared", "connected", "hired"];
