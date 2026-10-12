import type { PipelineStage } from "../models/Job";
import type { CandidateStage } from "../models/Application";
import { SystemSetting } from "../models/SystemSetting";

/* ───────────────────────── Gym access ───────────────────────── */

/**
 * Gyms pay once.
 *
 * There used to be three terms — monthly, quarterly, annual — which brought
 * expiry dates, renewals that extended from the old end date, and a carousel
 * to choose between them. Nobody ever bought one. A single one-time fee does
 * the same job with none of that machinery: paid is paid, permanently.
 *
 * The price is set by an admin in Settings; the constant below is only the
 * fallback for a platform whose settings have never been saved.
 */
export const DEFAULT_GYM_ACCESS_PRICE = 499;

export interface GymAccessPlan {
  id: "lifetime";
  name: string;
  /** Rupees, charged once. */
  price: number;
}

export const gymAccessPlan = (price: number): GymAccessPlan => ({
  id: "lifetime",
  name: "FitWorks Gym Access",
  price,
});

/**
 * The live price, from Settings.
 *
 * Cached for a minute: this is read on every checkout, every dashboard load
 * and every pricing page render, and it changes about once a quarter. Saving a
 * price clears the cache, so an admin never waits to see their change.
 */
let priceCache: { price: number; at: number } | null = null;
const PRICE_CACHE_MS = 60_000;

export const clearPlanCache = () => {
  priceCache = null;
};

export const getGymAccessPrice = async (): Promise<number> => {
  if (priceCache && Date.now() - priceCache.at < PRICE_CACHE_MS) return priceCache.price;

  let price = DEFAULT_GYM_ACCESS_PRICE;
  try {
    const settings = await SystemSetting.findOne().select("gymAccessPrice").lean();
    if (settings?.gymAccessPrice) price = settings.gymAccessPrice;
  } catch (error) {
    // Never let a settings read stop someone paying us. Falling back to the
    // launch price is wrong by at most one price change; failing is worse.
    console.error("Gym access price: falling back to default —", error);
  }

  priceCache = { price, at: Date.now() };
  return price;
};

/** The plan, priced. There is only one, so there is nothing to look up. */
export const getPricedGymPlan = async (): Promise<GymAccessPlan> =>
  gymAccessPlan(await getGymAccessPrice());

export interface GymSubscriptionState {
  isActive: boolean;
  status: "inactive" | "active";
  /** When they paid. Null until they do. Never cleared, never expires. */
  activatedAt: Date | null;
  /** Rupees actually received, summed from the payment record. */
  amountPaid: number;
  /** The order we are waiting on, if checkout is mid-flight. */
  pendingOrderId: string | null;
}

/**
 * Derives access from the payment record.
 *
 * There is no expiry to compute: one payment, permanent access. A record with
 * a payment in its history is active even if `status` was never written —
 * money received is the fact; the flag is only a cache of it.
 */
export const getGymSubscriptionState = (sub: any): GymSubscriptionState => {
  const history = sub?.history || [];
  const activatedAt = sub?.activatedAt
    ? new Date(sub.activatedAt)
    : history[0]?.paidAt
    ? new Date(history[0].paidAt)
    : null;

  // An admin can comp access without a payment, which is why the stored
  // status is honoured on its own as well.
  const active = !!activatedAt || sub?.status === "active";

  return {
    isActive: active,
    status: active ? "active" : "inactive",
    activatedAt,
    amountPaid: history.reduce((sum: number, h: any) => sum + (h.amount || 0), 0),
    pendingOrderId: sub?.pendingOrderId || null,
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
  "reviewing",
  "applied",
];


