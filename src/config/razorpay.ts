import Razorpay from "razorpay";

// Read at call time, not module load: ES imports are evaluated before
// dotenv.config() runs in index.ts, so a top-level read is always empty.
export const keyId = () => process.env.RAZORPAY_KEY_ID || "";
export const keySecret = () => process.env.RAZORPAY_KEY_SECRET || "";
export const webhookSecret = () => process.env.RAZORPAY_WEBHOOK_SECRET || "";

let client: Razorpay | null = null;

/** Lazily constructed so the credentials are present by first use. */
export const getRazorpay = (): Razorpay => {
  if (!client) {
    client = new Razorpay({ key_id: keyId(), key_secret: keySecret() });
  }
  return client;
};
