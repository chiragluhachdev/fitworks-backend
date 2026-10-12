import mongoose, { Document, Schema } from "mongoose";

/**
 * Platform-wide configuration, in a single document.
 *
 * Anything an admin should be able to change without a deploy lives here.
 */
export interface ISystemSetting extends Document {
  otpEnabled: boolean;
  /** What a gym pays, once, for access. Whole rupees. */
  gymAccessPrice: number;
  updatedAt: Date;
}

/** The price we launched with. A record with none set reads as this. */
export const DEFAULT_GYM_ACCESS_PRICE = 499;

const systemSettingSchema = new Schema<ISystemSetting>(
  {
    otpEnabled: { type: Boolean, default: true },
    gymAccessPrice: {
      type: Number,
      default: DEFAULT_GYM_ACCESS_PRICE,
      min: [1, "Access must cost at least ₹1"],
      max: [500000, "That price looks like a mistake"],
    },
  },
  { timestamps: true }
);

export const SystemSetting = mongoose.model<ISystemSetting>("SystemSetting", systemSettingSchema);
