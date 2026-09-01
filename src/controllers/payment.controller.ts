import { Request, Response } from "express";
import crypto from "crypto";
import { Trainer } from "../models/Trainer";
import {
  razorpay,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET,
  BADGE_AMOUNT_PAISE,
} from "../config/razorpay";
import { isOwnerOrAdmin } from "../middleware/auth.middleware";

/** Marks a trainer paid. Only ever called after a signature has been verified. */
const markPaid = async (
  filter: Record<string, unknown>,
  { orderId, paymentId, amountPaise }: { orderId: string; paymentId: string; amountPaise: number }
) =>
  Trainer.findOneAndUpdate(
    filter,
    {
      $set: {
        "payment.isPaid": true,
        "payment.orderId": orderId,
        "payment.paymentId": paymentId,
        "payment.status": "completed",
        "payment.amount": amountPaise / 100,
        "payment.paidAt": new Date(),
      },
    },
    { new: true }
  );

/* ─────────────────────────── CREATE ORDER ─────────────────────────── */

export const createTrainerPaymentOrder = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
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

    if (trainer.payment?.isPaid) {
      return res.status(400).json({ success: false, message: "This profile is already activated" });
    }

    // Receipt is capped at 40 characters by Razorpay.
    const order = await razorpay.orders.create({
      amount: BADGE_AMOUNT_PAISE,
      currency: "INR",
      receipt: `fw_${trainer._id.toString()}`.slice(0, 40),
      notes: {
        trainerId: trainer._id.toString(),
        trainerSlug: trainer.slug,
        purpose: "FitWorks verified trainer badge",
      },
    });

    trainer.payment = {
      isPaid: false,
      orderId: order.id,
      amount: BADGE_AMOUNT_PAISE / 100,
      status: "pending",
    };
    await trainer.save();

    return res.status(200).json({
      success: true,
      orderId: order.id,
      // Returned rather than kept in a NEXT_PUBLIC_ var so the backend alone
      // decides which key (test or live) the checkout runs against.
      keyId: RAZORPAY_KEY_ID,
      amount: BADGE_AMOUNT_PAISE,
      currency: "INR",
      trainerName: trainer.personal?.fullName,
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

    // The signature can only be produced with our key secret, so a forged
    // request cannot pass this check.
    const expected = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const provided = Buffer.from(razorpay_signature, "utf8");
    const computed = Buffer.from(expected, "utf8");
    const signatureValid =
      provided.length === computed.length && crypto.timingSafeEqual(provided, computed);

    if (!signatureValid) {
      console.warn(`Invalid payment signature for order ${razorpay_order_id}`);
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    // The order must be the one we issued for this trainer, and fully paid.
    if (trainer.payment?.orderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: "Order does not belong to this profile" });
    }

    const order: any = await razorpay.orders.fetch(razorpay_order_id);
    if (order.status !== "paid" || Number(order.amount_paid) < BADGE_AMOUNT_PAISE) {
      return res.status(400).json({
        success: false,
        message: `Payment not complete (status: ${order.status})`,
      });
    }

    await markPaid({ slug: trainerSlug }, {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      amountPaise: Number(order.amount_paid),
    });

    return res.status(200).json({
      success: true,
      isPaid: true,
      message: "Payment verified — your verified badge is active.",
    });
  } catch (error: any) {
    console.error("Razorpay Verify Error:", error);
    return res.status(500).json({ success: false, message: "Error verifying payment" });
  }
};

/* ─────────────────────────────── WEBHOOK ─────────────────────────────── */

/**
 * Razorpay's server-to-server confirmation. This is the safety net for when the
 * browser never returns from checkout — the customer closed the tab, lost
 * signal, etc. Signature is computed over the RAW body, so `req.rawBody` is
 * captured by the express.json verify hook in index.ts.
 */
export const razorpayWebhook = async (req: Request, res: Response): Promise<any> => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const raw = (req as any).rawBody;

    if (!signature || !raw || !RAZORPAY_WEBHOOK_SECRET) {
      return res.status(400).json({ success: false, message: "Invalid webhook request" });
    }

    const expected = crypto.createHmac("sha256", RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex");
    const provided = Buffer.from(signature, "utf8");
    const computed = Buffer.from(expected, "utf8");

    if (provided.length !== computed.length || !crypto.timingSafeEqual(provided, computed)) {
      console.warn("Razorpay webhook: signature mismatch");
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    const event = req.body?.event as string;
    const payment = req.body?.payload?.payment?.entity;

    if (event === "payment.captured" && payment) {
      const trainerId = payment.notes?.trainerId;
      const filter = trainerId ? { _id: trainerId } : { "payment.orderId": payment.order_id };

      if (Number(payment.amount) >= BADGE_AMOUNT_PAISE) {
        const updated = await markPaid(filter, {
          orderId: payment.order_id,
          paymentId: payment.id,
          amountPaise: Number(payment.amount),
        });
        console.log(
          updated
            ? `Webhook: activated badge for ${updated.slug} (order ${payment.order_id})`
            : `Webhook: no trainer matched order ${payment.order_id}`
        );
      } else {
        console.warn(`Webhook: underpaid order ${payment.order_id} — ${payment.amount} paise`);
      }
    }

    if (event === "payment.failed" && payment) {
      await Trainer.findOneAndUpdate(
        { "payment.orderId": payment.order_id },
        { $set: { "payment.status": "failed", "payment.isPaid": false } }
      );
    }

    // Always 200 on a valid signature, otherwise Razorpay keeps retrying.
    return res.status(200).json({ success: true, received: true });
  } catch (error: any) {
    console.error("Razorpay Webhook Error:", error);
    return res.status(200).json({ success: true, received: true });
  }
};

/* ───────────────────────────── STATUS ───────────────────────────── */

export const getTrainerPaymentStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const trainer = await Trainer.findOne({ slug: req.params.trainerSlug }).select(
      "payment verificationStatus"
    );
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    const payment = trainer.payment || { isPaid: false, status: "unpaid", amount: 99 };
    return res.status(200).json({
      success: true,
      payment: { isPaid: !!payment.isPaid, status: payment.status, amount: payment.amount },
    });
  } catch (error: any) {
    console.error("Get Payment Status Error:", error);
    return res.status(500).json({ success: false, message: "Server error fetching payment status" });
  }
};
