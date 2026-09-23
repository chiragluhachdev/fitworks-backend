import { Request, Response } from "express";
import crypto from "crypto";
import { Gym } from "../models/Gym";
import { getRazorpay, keyId, keySecret } from "../config/razorpay";
import { isOwnerOrAdmin } from "../middleware/auth.middleware";
import { getPricedPlans, findPricedPlan, getGymSubscriptionState } from "../utils/hiring";
import { applyGymMembership, addMonths, nextPeriodStart } from "../utils/gymMembership";

/**
 * Razorpay checkout for gym memberships.
 *
 * Modelled on the trainer activation flow, with one difference that shapes
 * everything: a membership is a term that can be renewed, not a one-off. The
 * plan a payment buys is therefore decided when the order is raised and stored
 * against the gym — the browser never gets to name the plan at verification
 * time, or a ₹199 payment could buy a year.
 */

const gatewayReady = () => !!keyId() && !!keySecret();

/* ─────────────────────────── CREATE ORDER ─────────────────────────── */

export const createGymOrder = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!gatewayReady()) {
      return res.status(503).json({
        success: false,
        code: "PAYMENT_UNAVAILABLE",
        message: "Online payment is temporarily unavailable. Please contact FitWorks support.",
      });
    }

    const plan = await findPricedPlan(req.body?.plan);
    if (!plan) {
      return res.status(400).json({ success: false, message: "Choose one of the FitWorks plans." });
    }

    const gym = await Gym.findOne({ slug: req.params.slug });
    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }
    if (!isOwnerOrAdmin(req.user, gym._id)) {
      return res.status(403).json({ success: false, message: "Not authorized to pay for this gym" });
    }

    const amountPaise = plan.price * 100;

    const order = await getRazorpay().orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `fwg_${Date.now().toString(36)}_${gym._id.toString().slice(-8)}`.slice(0, 40),
      notes: {
        kind: "gym_membership",
        gymId: gym._id.toString(),
        gymSlug: gym.slug,
        plan: plan.id,
        amountPaise: String(amountPaise),
        purpose: `FitWorks ${plan.name} membership`,
      },
    });

    gym.subscription.pendingOrderId = order.id;
    gym.subscription.pendingPlan = plan.id;
    gym.subscription.pendingAmount = amountPaise;
    await gym.save();

    // What this payment buys, so checkout can say it plainly.
    const periodStart = nextPeriodStart(gym.subscription.expiresAt);
    const periodEnd = addMonths(periodStart, plan.months);

    return res.status(200).json({
      success: true,
      orderId: order.id,
      keyId: keyId(),
      amount: amountPaise,
      currency: "INR",
      plan: { id: plan.id, name: plan.name, price: plan.price, months: plan.months },
      coverUntil: periodEnd,
      renewal: !!gym.subscription.expiresAt,
      gymName: gym.gymName,
      contactName: gym.contactPerson?.name,
      contactPhone: gym.contactPerson?.phone,
      contactEmail: gym.contactPerson?.email,
    });
  } catch (error: any) {
    console.error("Gym Create Order Error:", error);
    return res.status(500).json({
      success: false,
      message: error?.error?.description || error?.message || "Failed to start payment",
    });
  }
};

/* ────────────────────── VERIFY CHECKOUT SIGNATURE ────────────────────── */

export const verifyGymPayment = async (req: Request, res: Response): Promise<any> => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Incomplete payment details" });
    }

    const gym = await Gym.findOne({ slug: req.params.slug });
    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }
    if (!isOwnerOrAdmin(req.user, gym._id)) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    // Only our key secret can produce this, so a forged callback cannot pass.
    const expected = crypto
      .createHmac("sha256", keySecret())
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const provided = Buffer.from(String(razorpay_signature), "utf8");
    const computed = Buffer.from(expected, "utf8");
    if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
      console.warn(`Invalid gym payment signature for order ${razorpay_order_id}`);
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    // The order must be one we raised for this gym.
    if (gym.subscription?.pendingOrderId !== razorpay_order_id) {
      // The webhook may already have applied it and cleared the pending order.
      const alreadyApplied = (gym.subscription?.history || []).some(
        (h) => h.orderId === razorpay_order_id
      );
      if (!alreadyApplied) {
        return res.status(400).json({ success: false, message: "Order does not belong to this gym" });
      }
      return res.status(200).json({
        success: true,
        subscription: getGymSubscriptionState(gym.subscription),
        message: "Payment already confirmed — your membership is active.",
      });
    }

    // The plan comes from what we charged for, never from the request body.
    const plan = await findPricedPlan(gym.subscription.pendingPlan);
    if (!plan) {
      return res.status(400).json({ success: false, message: "We couldn't match this payment to a plan." });
    }

    const order: any = await getRazorpay().orders.fetch(razorpay_order_id);

    // Check what they paid against what we asked Razorpay for, not against
    // today's price. An admin editing a plan's price while someone is at
    // checkout must not invalidate a payment that matched the quote.
    const quoted = Number(order.amount) || gym.subscription.pendingAmount || plan.price * 100;
    if (order.status !== "paid" || Number(order.amount_paid) < quoted) {
      return res.status(400).json({
        success: false,
        message: `Payment not complete (status: ${order.status})`,
      });
    }

    const updated = await applyGymMembership(
      { _id: gym._id },
      {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amountPaise: Number(order.amount_paid),
        plan: plan.id,
      }
    );

    return res.status(200).json({
      success: true,
      subscription: getGymSubscriptionState(updated?.subscription),
      message: `Payment received — your ${plan.name} membership is active.`,
    });
  } catch (error: any) {
    console.error("Gym Verify Payment Error:", error);
    return res.status(500).json({ success: false, message: "Error verifying payment" });
  }
};

/* ─────────────────────────── STATUS & HISTORY ─────────────────────────── */

/** Membership state plus the plan catalogue, for the Subscription screen. */
export const getGymMembership = async (req: Request, res: Response): Promise<any> => {
  try {
    const gym = await Gym.findOne({ slug: req.params.slug }).select("subscription gymName");
    if (!gym) {
      return res.status(404).json({ success: false, message: "Gym not found" });
    }
    if (!isOwnerOrAdmin(req.user, gym._id)) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    const history = [...(gym.subscription?.history || [])].sort(
      (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
    );

    return res.status(200).json({
      success: true,
      subscription: getGymSubscriptionState(gym.subscription),
      plans: await getPricedPlans(),
      paymentsEnabled: gatewayReady(),
      history,
    });
  } catch (error: any) {
    console.error("Get Gym Membership Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
