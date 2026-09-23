import { Gym } from "../models/Gym";
import { findPlan, type GymPlanId } from "./hiring";

/**
 * Writing a paid gym membership into the record.
 *
 * Shared by the browser callback and the Razorpay webhook, which routinely
 * race each other — whichever arrives first does the work and the other is a
 * no-op.
 */

/**
 * Where a newly bought term starts.
 *
 * A gym renewing on day 300 of an annual plan keeps the 65 days it has left:
 * the new term starts when the old one ends, not today. Only once a membership
 * has actually lapsed does a new term start from now.
 */
export const nextPeriodStart = (expiresAt?: Date | null, now = new Date()): Date => {
  if (!expiresAt) return now;
  const end = new Date(expiresAt);
  return end.getTime() > now.getTime() ? end : now;
};

export const addMonths = (from: Date, months: number): Date => {
  const to = new Date(from);
  to.setMonth(to.getMonth() + months);
  return to;
};

export interface MembershipPayment {
  orderId: string;
  paymentId: string;
  amountPaise: number;
  plan: GymPlanId;
}

/**
 * Applies a verified payment to a gym, extending its membership.
 *
 * Idempotent on the payment id: a webhook retry, or a webhook racing the
 * browser, cannot buy the same term twice. Returns null when no gym matches
 * the filter, which the caller should treat as a payment to investigate rather
 * than an error to swallow.
 */
export const applyGymMembership = async (
  filter: Record<string, unknown>,
  { orderId, paymentId, amountPaise, plan }: MembershipPayment
) => {
  const chosen = findPlan(plan);
  if (!chosen) {
    console.warn(`Membership: unknown plan "${plan}" for payment ${paymentId}`);
    return null;
  }

  const gym = await Gym.findOne(filter);
  if (!gym) return null;

  if ((gym.subscription?.history || []).some((h) => h.paymentId === paymentId)) {
    console.log(`Payment ${paymentId} already applied to ${gym.slug} — skipping.`);
    return gym;
  }

  const paidAt = new Date();
  const periodStart = nextPeriodStart(gym.subscription?.expiresAt, paidAt);
  const periodEnd = addMonths(periodStart, chosen.months);

  gym.subscription.plan = chosen.id;
  gym.subscription.status = "active";
  // startedAt is when they first joined us, so a renewal must not move it.
  if (!gym.subscription.startedAt) gym.subscription.startedAt = paidAt;
  gym.subscription.expiresAt = periodEnd;
  gym.subscription.amount = amountPaise / 100;
  gym.subscription.lastOrderId = orderId;
  gym.subscription.lastPaymentId = paymentId;
  gym.subscription.pendingOrderId = undefined;
  gym.subscription.pendingPlan = undefined;
  gym.subscription.pendingAmount = undefined;
  gym.subscription.history.push({
    orderId,
    paymentId,
    plan: chosen.id,
    amount: amountPaise / 100,
    paidAt,
    periodStart,
    periodEnd,
  });

  await gym.save();
  console.log(
    `Gym ${gym.slug} on ${chosen.name} until ${periodEnd.toISOString().slice(0, 10)} (₹${amountPaise / 100}).`
  );
  return gym;
};
