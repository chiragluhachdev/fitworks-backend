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
