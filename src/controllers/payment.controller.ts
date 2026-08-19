import { Request, Response } from "express";
import { Trainer } from "../models/Trainer";

const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID || "";
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY || "";
const CASHFREE_ENV = process.env.CASHFREE_ENV || "production";
const CASHFREE_BASE_URL = CASHFREE_ENV === "production" 
  ? "https://api.cashfree.com/pg" 
  : "https://sandbox.cashfree.com/pg";

// CREATE CASHFREE PAYMENT ORDER FOR ₹99
export const createTrainerPaymentOrder = async (req: Request, res: Response): Promise<any> => {
  try {
    const { trainerSlug, email, phone, name } = req.body;

    if (!trainerSlug) {
      return res.status(400).json({ success: false, message: "Trainer identifier is required" });
    }

    const trainer = await Trainer.findOne({ slug: trainerSlug });
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer profile not found" });
    }

    // Unique order ID (Alphanumeric, max 45 chars)
    const orderId = `FW_TR_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`.toUpperCase();
    const customerPhone = (phone || "9876543210").replace(/[^0-9]/g, "").slice(-10) || "9876543210";
    const customerEmail = email || trainer.personal?.fullName?.toLowerCase().replace(/\s+/g, "") + "@fitworks.in";
    const customerName = name || trainer.personal?.fullName || "FitWorks Trainer";
    const customerId = `CUST_${trainer._id.toString().substring(0, 18)}`;

    const returnUrl = `https://fitworks.in/trainer/${trainerSlug}/dashboard?payment_status=success&order_id={order_id}`;

    const orderPayload = {
      order_id: orderId,
      order_amount: 99.00,
      order_currency: "INR",
      customer_details: {
        customer_id: customerId,
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone,
      },
      order_meta: {
        return_url: returnUrl,
        notify_url: "https://fitworks-backend-production.up.railway.app/api/payments/webhook",
      },
      order_note: "FitWorks ₹99 Lifetime Verified Trainer Profile Activation",
    };

    const cashfreeRes = await fetch(`${CASHFREE_BASE_URL}/orders`, {
      method: "POST",
      headers: {
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET_KEY,
        "x-api-version": "2023-08-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const cashfreeData: any = await cashfreeRes.json();

    if (!cashfreeRes.ok || !cashfreeData.payment_session_id) {
      console.error("Cashfree Order Creation Error:", cashfreeData);
      return res.status(400).json({
        success: false,
        message: cashfreeData.message || "Failed to initiate Cashfree payment session",
        error: cashfreeData,
      });
    }

    // Save pending order info to trainer profile
    trainer.payment = {
      isPaid: false,
      orderId: cashfreeData.order_id,
      amount: 99,
      status: "pending",
    };
    await trainer.save();

    return res.status(200).json({
      success: true,
      orderId: cashfreeData.order_id,
      paymentSessionId: cashfreeData.payment_session_id,
      orderStatus: cashfreeData.order_status,
      amount: 99,
      currency: "INR",
    });
  } catch (error: any) {
    console.error("Payment Order Controller Error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Internal server error initiating payment",
    });
  }
};

// VERIFY ORDER STATUS WITH CASHFREE
export const verifyTrainerPayment = async (req: Request, res: Response): Promise<any> => {
  try {
    const { orderId, trainerSlug } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }

    // Fetch order details from Cashfree
    const cashfreeRes = await fetch(`${CASHFREE_BASE_URL}/orders/${orderId}`, {
      method: "GET",
      headers: {
        "x-client-id": CASHFREE_APP_ID,
        "x-client-secret": CASHFREE_SECRET_KEY,
        "x-api-version": "2023-08-01",
      },
    });

    const orderData: any = await cashfreeRes.json();

    if (!cashfreeRes.ok) {
      return res.status(400).json({
        success: false,
        message: orderData.message || "Failed to fetch order details from Cashfree",
      });
    }

    const isPaid = orderData.order_status === "PAID";

    if (isPaid && trainerSlug) {
      await Trainer.findOneAndUpdate(
        { slug: trainerSlug },
        {
          $set: {
            "payment.isPaid": true,
            "payment.orderId": orderId,
            "payment.status": "completed",
            "payment.amount": 99,
            "payment.paidAt": new Date(),
          },
        }
      );
    }

    return res.status(200).json({
      success: true,
      orderId: orderData.order_id,
      orderStatus: orderData.order_status,
      isPaid,
      message: isPaid ? "Payment confirmed and verified successfully!" : `Order is currently ${orderData.order_status}`,
    });
  } catch (error: any) {
    console.error("Verify Payment Error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Internal error verifying payment",
    });
  }
};

// GET TRAINER PAYMENT STATUS
export const getTrainerPaymentStatus = async (req: Request, res: Response): Promise<any> => {
  try {
    const { trainerSlug } = req.params;
    const trainer = await Trainer.findOne({ slug: trainerSlug }).select("payment personal verificationStatus");
    if (!trainer) {
      return res.status(404).json({ success: false, message: "Trainer not found" });
    }

    return res.status(200).json({
      success: true,
      payment: trainer.payment || { isPaid: false, status: "unpaid", amount: 99 },
    });
  } catch (error: any) {
    console.error("Get Payment Status Error:", error);
    return res.status(500).json({ success: false, message: "Server error fetching payment status" });
  }
};
