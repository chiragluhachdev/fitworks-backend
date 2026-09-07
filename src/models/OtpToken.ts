import mongoose, { Document, Schema } from "mongoose";

export interface IOtpToken extends Document {
  phone: string;
  codeHash: string;
  purpose: "registration" | "login";
  expiresAt: Date;
  attempts: number;
  verified: boolean;
  /** Set once verified; the client presents this to complete the action. */
  verificationToken?: string;
  lastSentAt: Date;
  sendCount: number;
  createdAt: Date;
}

const otpTokenSchema = new Schema<IOtpToken>(
  {
    phone: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ["registration", "login"], required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    verificationToken: { type: String, index: true },
    lastSentAt: { type: Date, default: Date.now },
    sendCount: { type: Number, default: 1 },
  },
  { timestamps: true }
);

// Mongo removes each document an hour past expiry, so verified and stale codes
// clean themselves up without a scheduled job.
otpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export const OtpToken = mongoose.model<IOtpToken>("OtpToken", otpTokenSchema);
