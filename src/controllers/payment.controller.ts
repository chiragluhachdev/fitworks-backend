import { Request, Response } from "express";
import crypto from "crypto";
import { Trainer } from "../models/Trainer";
import { getRazorpay, keyId, keySecret, webhookSecret } from "../config/razorpay";
import { isOwnerOrAdmin } from "../middleware/auth.middleware";
import {
  SUBSCRIPTION_AMOUNT_PAISE,
  SUBSCRIPTION_PLAN,
  SUBSCRIPTION_DAYS,
  getSubscriptionState,
  nextPeriod,
} from "../utils/subscription";

/**
 * Extends a trainer's subscription by one cycle and appends to billing history.
 * Only ever called once a payment signature has been verified.
 *
 * Idempotent: a payment id already present in history is ignored, so a webhook
 * retry (or a webhook racing the browser callback) can't grant two cycles.
 */
const applyPaidCycle = async (
  filter: Record<string, unknown>,
  { orderId, paymentId, amountPaise }: { orderId: string; paymentId: string; amountPaise: number }
) => {
  const trainer = await Trainer.findOne(filter);
  if (!trainer) return null;

  const alreadyApplied = trainer.subscription?.history?.some((h) => h.paymentId === paymentId);
  if (alreadyApplied) {
    console.log(`Payment ${paymentId} already applied to ${trainer.slug} — skipping.`);
    return trainer;
  }

  const { periodStart, periodEnd } = nextPeriod(trainer.subscription?.currentPeriodEnd);
  const amount = amountPaise / 100;

  trainer.subscription.plan = SUBSCRIPTION_PLAN;
  trainer.subscription.amountPerCycle = SUBSCRIPTION_AMOUNT_PAISE / 100;
  trainer.subscription.currentPeriodStart = trainer.subscription.currentPeriodStart || periodStart;
  trainer.subscription.currentPeriodEnd = periodEnd;
  trainer.subscription.lastOrderId = orderId;
  trainer.subscription.lastPaymentId = paymentId;
  trainer.subscription.pendingOrderId = undefined;
  trainer.subscription.cyclesPaid = (trainer.subscription.cyclesPaid || 0) + 1;
  trainer.subscription.history.push({ orderId, paymentId, amount, paidAt: new Date(), periodStart, periodEnd });

  await trainer.save();
  console.log(`Subscription extended for ${trainer.slug} until ${periodEnd.toISOString()}`);
  return trainer;
};

/* ─────────────────────── CREATE / RENEW ORDER ─────────────────────── */

export const createTrainerPaymentOrder = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!keyId() || !keySecret()) {
      return res.status(500).json({ success: false, message: "Payment gateway is not configured" });
    }

    const { trainerSlug } = req.body;
    if (!trainerSlug) {
      return res.status(400).json({ success: false, message: "Trainer identifier is required" });
    }

    const trainer = await Trainer.findOne({ slug: trainerSlug });
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer profile not found" });
    }
    if (!isOwnerOrAdmin(req.user, trainer._id)) {
      return res.status(403).json({ success: false, message: "Not authorized to pay for this profile" });
    }

    const state = getSubscriptionState(trainer.subscription);
    const isRenewal = state.cyclesPaid > 0;

    const order = await getRazorpay().orders.create({
      amount: SUBSCRIPTION_AMOUNT_PAISE,
      currency: "INR",
      receipt: `fw_${Date.now().toString(36)}_${trainer._id.toString().slice(-8)}`.slice(0, 40),
      notes: {
        trainerId: trainer._id.toString(),
        trainerSlug: trainer.slug,
        plan: SUBSCRIPTION_PLAN,
        purpose: isRenewal ? "FitWorks trainer renewal" : "FitWorks trainer activation",
      },
    });

    trainer.subscription.pendingOrderId = order.id;
    await trainer.save();

    return res.status(200).json({
      success: true,
      orderId: order.id,
      keyId: keyId(),
      amount: SUBSCRIPTION_AMOUNT_PAISE,
      currency: "INR",
      isRenewal,
      cycleDays: SUBSCRIPTION_DAYS,
      trainerName: trainer.personal?.fullName,
      trainerPhone: trainer.personal?.phone,
      trainerEmail: trainer.personal?.email,
    });
  } catch (error: any) {
    console.error("Razorpay Create Order Error:", error);
    return res.status(500).json({
      success: false,
      message: error?.error?.description || error?.message || "Failed to start payment",
    });
  }
};

/* ────────────────────── VERIFY CHECKOUT SIGNATURE ────────────────────── */

export const verifyTrainerPayment = async (req: Request, res: Response): Promise<any> => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, trainerSlug } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Incomplete payment details" });
    }

    const trainer = await Trainer.findOne({ slug: trainerSlug });
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }
    if (!isOwnerOrAdmin(req.user, trainer._id)) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    // Only our key secret can produce this, so a forged request cannot pass.
    const expected = crypto
      .createHmac("sha256", keySecret())
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const provided = Buffer.from(razorpay_signature, "utf8");
    const computed = Buffer.from(expected, "utf8");
    if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
      console.warn(`Invalid payment signature for order ${razorpay_order_id}`);
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    // The order must be one we issued for this trainer.
    const knownOrder =
      trainer.subscription?.pendingOrderId === razorpay_order_id ||
      trainer.subscription?.lastOrderId === razorpay_order_id;
    if (!knownOrder) {
      return res.status(400).json({ success: false, message: "Order does not belong to this profile" });
    }

    const order: any = await getRazorpay().orders.fetch(razorpay_order_id);
    if (order.status !== "paid" || Number(order.amount_paid) < SUBSCRIPTION_AMOUNT_PAISE) {
      return res.status(400).json({
        success: false,
        message: `Payment not complete (status: ${order.status})`,
      });
    }

    const updated = await applyPaidCycle(
      { slug: trainerSlug },
      { orderId: razorpay_order_id, paymentId: razorpay_payment_id, amountPaise: Number(order.amount_paid) }
    );

    return res.status(200).json({
      success: true,
      isPaid: true,
      subscription: getSubscriptionState(updated?.subscription),
      message: "Payment verified — your membership is active.",
    });
  } catch (error: any) {
    console.error("Razorpay Verify Error:", error);
    return res.status(500).json({ success: false, message: "Error verifying payment" });
  }
};

/* ─────────────────────────────── WEBHOOK ─────────────────────────────── */

/**
 * Razorpay's server-to-server confirmation — the safety net for when the
 * browser never returns from checkout. Signature covers the RAW body, captured
 * by the express.json verify hook in index.ts.
 */
export const razorpayWebhook = async (req: Request, res: Response): Promise<any> => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const raw = (req as any).rawBody;

    if (!signature || !raw || !webhookSecret()) {
      return res.status(400).json({ success: false, message: "Invalid webhook request" });
    }

    const expected = crypto.createHmac("sha256", webhookSecret()).update(raw).digest("hex");
    const provided = Buffer.from(signature, "utf8");
    const computed = Buffer.from(expected, "utf8");
    if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
      console.warn("Razorpay webhook: signature mismatch");
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    const event = req.body?.event as string;
    const payment = req.body?.payload?.payment?.entity;

    if (event === "payment.captured" && payment) {
      if (Number(payment.amount) >= SUBSCRIPTION_AMOUNT_PAISE) {
        const trainerId = payment.notes?.trainerId;
        const filter = trainerId
          ? { _id: trainerId }
          : { "subscription.pendingOrderId": payment.order_id };
        const updated = await applyPaidCycle(filter, {
          orderId: payment.order_id,
          paymentId: payment.id,
          amountPaise: Number(payment.amount),
        });
        if (!updated) console.warn(`Webhook: no trainer matched order ${payment.order_id}`);
      } else {
        console.warn(`Webhook: underpaid order ${payment.order_id} — ${payment.amount} paise`);
      }
    }

    if (event === "payment.failed" && payment) {
      await Trainer.findOneAndUpdate(
        { "subscription.pendingOrderId": payment.order_id },
        { $unset: { "subscription.pendingOrderId": "" } }
      );
    }

    // Always 200 on a valid signature, else Razorpay keeps retrying.
    return res.status(200).json({ success: true, received: true });
  } catch (error: any) {
    console.error("Razorpay Webhook Error:", error);
    return res.status(200).json({ success: true, received: true });
  }
};

/* ─────────────────────── SUBSCRIPTION STATUS ─────────────────────── */

export const getTrainerPaymentStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const trainer = await Trainer.findOne({ slug: req.params.trainerSlug }).select(
      "subscription verificationStatus"
    );
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }
    return res.status(200).json({
      success: true,
      subscription: getSubscriptionState(trainer.subscription),
      amountPerCycle: SUBSCRIPTION_AMOUNT_PAISE / 100,
      cycleDays: SUBSCRIPTION_DAYS,
    });
  } catch (error: any) {
    console.error("Get Subscription Status Error:", error);
    return res.status(500).json({ success: false, message: "Server error fetching subscription" });
  }
};

/** Billing history for the trainer's own account page. */
export const getTrainerBillingHistory = async (req: Request, res: Response): Promise<any> => {
  try {
    const trainer = await Trainer.findOne({ slug: req.params.trainerSlug }).select("subscription");
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }
    if (!isOwnerOrAdmin(req.user, trainer._id)) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    const history = [...(trainer.subscription?.history || [])].sort(
      (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
    );
    return res.status(200).json({ success: true, history });
  } catch (error: any) {
    console.error("Billing History Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
