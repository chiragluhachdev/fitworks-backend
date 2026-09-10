/** Trainer subscription: ₹99 per 30-day cycle. */
export const SUBSCRIPTION_AMOUNT_PAISE = 9900;
export const SUBSCRIPTION_DAYS = 30;
export const SUBSCRIPTION_PLAN = "trainer_monthly_99";

/** Warn the trainer in-app once they're this close to expiry. */
export const RENEWAL_WARNING_DAYS = 7;

export interface SubscriptionState {
  status: "inactive" | "active" | "expiring_soon" | "expired";
  isActive: boolean;
  daysRemaining: number;
  expiresAt: Date | null;
  startedAt: Date | null;
  needsRenewal: boolean;
  cyclesPaid: number;
}

/**
 * Derives live subscription status from the stored period end.
 *
 * Status is always computed, never stored — a stored "active" flag would go
 * stale the moment the period lapsed with no one writing to the record.
 */
export const getSubscriptionState = (sub: any): SubscriptionState => {
  const end = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const start = sub?.currentPeriodStart ? new Date(sub.currentPeriodStart) : null;
  const cyclesPaid = sub?.cyclesPaid || 0;

  if (!end) {
    return {
      status: "inactive",
      isActive: false,
      daysRemaining: 0,
      expiresAt: null,
      startedAt: null,
      needsRenewal: true,
      cyclesPaid,
    };
  }

  const msLeft = end.getTime() - Date.now();
  const daysRemaining = Math.max(0, Math.ceil(msLeft / 86_400_000));
  const isActive = msLeft > 0;

  return {
    status: !isActive ? "expired" : daysRemaining <= RENEWAL_WARNING_DAYS ? "expiring_soon" : "active",
    isActive,
    daysRemaining,
    expiresAt: end,
    startedAt: start,
    needsRenewal: !isActive || daysRemaining <= RENEWAL_WARNING_DAYS,
    cyclesPaid,
  };
};

/**
 * Next period bounds. Renewing early stacks onto the remaining time rather than
 * discarding it, so a trainer is never punished for paying ahead.
 */
export const nextPeriod = (currentEnd?: Date | null) => {
  const now = new Date();
  const base = currentEnd && new Date(currentEnd) > now ? new Date(currentEnd) : now;
  const end = new Date(base);
  end.setDate(end.getDate() + SUBSCRIPTION_DAYS);
  return { periodStart: now, periodEnd: end };
};

/** Mongo filter fragment for "subscription currently active". */
export const activeSubscriptionFilter = () => ({
  "subscription.currentPeriodEnd": { $gt: new Date() },
});

export type AccessBlockReason = "pending_review" | "rejected" | "subscription_inactive" | null;

export interface JobAccess {
  allowed: boolean;
  reason: AccessBlockReason;
  title: string;
  message: string;
  /** Lets the review screen offer activation while the trainer waits. */
  membershipActive: boolean;
  /** Renewal rather than first activation — changes the wording. */
  hasLapsed: boolean;
}

/**
 * Whether a trainer may browse and apply to gym vacancies.
 *
 * Two independent gates: the profile must be approved, and the membership must
 * be paid. Verification is checked first because it's the more fundamental
 * blocker — no amount of paying fixes a rejected profile.
 */
export const getJobAccess = (trainer: any): JobAccess => {
  const status = trainer?.verificationStatus;
  const state = getSubscriptionState(trainer?.subscription);
  // Carried on every branch so the client can tailor the screen: offer
  // activation while a review is still pending, and say "renew" rather than
  // "activate" to someone who has paid before.
  const context = { membershipActive: state.isActive, hasLapsed: state.cyclesPaid > 0 };

  if (status === "pending") {
    return {
      allowed: false,
      reason: "pending_review",
      title: "Your profile is under review",
      message:
        "Our team is checking your documents. Once approved, gym vacancies unlock here — usually within 24 hours.",
      ...context,
    };
  }

  if (status === "rejected") {
    return {
      allowed: false,
      reason: "rejected",
      title: "Your profile needs attention",
      message:
        "We couldn't verify the documents you submitted. Re-upload a valid certificate and a clear government ID to get approved.",
      ...context,
    };
  }

  if (!state.isActive) {
    return {
      allowed: false,
      reason: "subscription_inactive",
      title: "Activate your membership",
      message:
        "FitWorks is a paid platform for trainers. Activate your ₹99/month membership to browse vacancies, apply to roles and be discovered by hiring gyms.",
      ...context,
    };
  }

  return { allowed: true, reason: null, title: "", message: "", ...context };
};
