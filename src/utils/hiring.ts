import type { PipelineStage } from "../models/Job";
import type { CandidateStage } from "../models/Application";
import { SystemSetting, DEFAULT_GYM_PRICES } from "../models/SystemSetting";

export { DEFAULT_GYM_PRICES };

/**
 * Gym membership plans.
 *
 * Every plan carries the same features — the only thing that changes is how
 * long it runs for, and the rate that falls out of that.
 *
 * The shape is fixed in code; the prices are not. An admin sets those in
 * Settings, and everything that quotes or charges reads them from there. What
 * is written below is only the fallback for a platform whose settings have
 * never been saved.
 */
const PLAN_SHAPE = [
  { id: "monthly", name: "FitWorks Monthly", months: 1, cadence: "per month", best: false },
  { id: "quarterly", name: "FitWorks 3 Months", months: 3, cadence: "per 3 months", best: false },
  { id: "annual", name: "FitWorks Annual", months: 12, cadence: "per year", best: true },
] as const;

export type GymPlanId = (typeof PLAN_SHAPE)[number]["id"];

export interface GymPlan {
  id: GymPlanId;
  name: string;
  /** Rupees for the whole term. */
  price: number;
  months: number;
  cadence: string;
  /** What the term works out to per month, for comparing terms honestly. */
  perMonth: number;
  /** Saving against the monthly rate, which is the yardstick by definition. */
  savingsPercent: number;
  best: boolean;
}

export type GymPrices = Record<GymPlanId, number>;

/** Applies prices to the fixed plan shape and derives the comparisons. */
export const buildGymPlans = (prices: Partial<GymPrices>): GymPlan[] => {
  const monthlyRate = prices.monthly || DEFAULT_GYM_PRICES.monthly;
  return PLAN_SHAPE.map((shape) => {
    const price = prices[shape.id] ?? DEFAULT_GYM_PRICES[shape.id];
    return {
      id: shape.id,
      name: shape.name,
      months: shape.months,
      cadence: shape.cadence,
      best: shape.best,
      price,
      perMonth: Math.round(price / shape.months),
      // A term priced at or above the monthly rate saves nothing — never show
      // a negative saving.
      savingsPercent: Math.max(0, Math.round((1 - price / shape.months / monthlyRate) * 100)),
    };
  });
};

/**
 * The live plans, priced from Settings.
 *
 * Cached for a minute: this is read on every checkout, every dashboard load
 * and every pricing page render, and it changes about once a quarter. Saving
 * a price clears the cache, so an admin never waits to see their change.
 */
let priceCache: { plans: GymPlan[]; at: number } | null = null;
const PRICE_CACHE_MS = 60_000;

export const clearPlanCache = () => {
  priceCache = null;
};

export const getPricedPlans = async (): Promise<GymPlan[]> => {
  if (priceCache && Date.now() - priceCache.at < PRICE_CACHE_MS) return priceCache.plans;

  let prices: Partial<GymPrices> = {};
  try {
    const settings = await SystemSetting.findOne().select("gymPlanPrices").lean();
    if (settings?.gymPlanPrices) prices = settings.gymPlanPrices;
  } catch (error) {
    // Never let a settings read stop someone paying us. Falling back to the
    // launch prices is wrong by at most one price change; failing is worse.
    console.error("Plan prices: falling back to defaults —", error);
  }

  const plans = buildGymPlans(prices);
  priceCache = { plans, at: Date.now() };
  return plans;
};

/** One plan, priced from Settings. Null for an id we don't sell. */
export const findPricedPlan = async (id: unknown): Promise<GymPlan | null> =>
  (await getPricedPlans()).find((p) => p.id === id) ?? null;

/**
 * A plan's identity only — id, name, length. Carries no price.
 *
 * Anything involving money must use findPricedPlan instead, so it cannot quote
 * or charge a number that is no longer what we sell for.
 */
export const findPlan = (id: unknown) => PLAN_SHAPE.find((p) => p.id === id) ?? null;

export interface GymSubscriptionState {
  plan: string;
  planName: string;
  isActive: boolean;
  status: "inactive" | "active" | "expired";
  startedAt: Date | null;
  expiresAt: Date | null;
  /** Whole days remaining, or null when there is no active term. */
  daysLeft: number | null;
  /** The order we're waiting on, if checkout is mid-flight. */
  pendingOrderId: string | null;
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
  "shared",
  "reviewing",
  "applied",
];

/** Candidate stages a gym is allowed to see. Nothing before we've shared it. */
export const SHARED_WITH_GYM_STAGES: CandidateStage[] = ["shared", "connected", "hired"];
