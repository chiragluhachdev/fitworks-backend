import { Gym } from "../models/Gym";

/**
 * Granting a gym access once it has paid.
 *
 * Shared by the browser callback and the Razorpay webhook, which routinely
 * race each other — whichever arrives first does the work and the other is a
 * no-op.
 *
 * There is no period to compute any more: gyms pay once, so this grants access
 * permanently rather than extending a term.
 */

export interface AccessPayment {
  orderId: string;
  paymentId: string;
  amountPaise: number;
}

/**
 * Applies a verified payment to a gym.
 *
 * Idempotent on the payment id: a webhook retry, or a webhook racing the
 * browser, cannot record the same payment twice. activatedAt is written once,
 * so a second payment — a duplicate we chose to honour, say — never moves the
 * date they joined.
 *
 * Returns null when no gym matches the filter, which the caller should treat
 * as a payment to investigate rather than an error to swallow.
 */
export const applyGymAccess = async (
  filter: Record<string, unknown>,
  { orderId, paymentId, amountPaise }: AccessPayment
) => {
  const gym = await Gym.findOne(filter);
  if (!gym) return null;

  if ((gym.subscription?.history || []).some((h) => h.paymentId === paymentId)) {
    console.log(`Payment ${paymentId} already applied to ${gym.slug} — skipping.`);
    return gym;
  }

  const paidAt = new Date();

  gym.subscription.plan = "lifetime";
  gym.subscription.status = "active";
  if (!gym.subscription.activatedAt) gym.subscription.activatedAt = paidAt;
  gym.subscription.amount = amountPaise / 100;
  gym.subscription.lastOrderId = orderId;
  gym.subscription.lastPaymentId = paymentId;
  gym.subscription.pendingOrderId = undefined;
  gym.subscription.pendingAmount = undefined;
  gym.subscription.history.push({ orderId, paymentId, amount: amountPaise / 100, paidAt });

  await gym.save();
  console.log(`Gym ${gym.slug} now has access (one-time ₹${amountPaise / 100}).`);
  return gym;
};
