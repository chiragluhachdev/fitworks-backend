import mongoose, { Document, Schema } from "mongoose";

/**
 * Platform-wide configuration, in a single document.
 *
 * Anything an admin should be able to change without a deploy lives here.
 */
export interface ISystemSetting extends Document {
  otpEnabled: boolean;
  /** What a gym pays for each membership term, in whole rupees. */
  gymPlanPrices: {
    monthly: number;
    quarterly: number;
    annual: number;
  };
  updatedAt: Date;
}

/** The prices we launched with. A record with no prices set reads as these. */
export const DEFAULT_GYM_PRICES = { monthly: 199, quarterly: 499, annual: 999 };

const price = (fallback: number) => ({
  type: Number,
  default: fallback,
  min: [1, "A plan must cost at least ₹1"],
  max: [500000, "That price looks like a mistake"],
});

const systemSettingSchema = new Schema<ISystemSetting>(
  {
    otpEnabled: { type: Boolean, default: true },
    gymPlanPrices: {
      monthly: price(DEFAULT_GYM_PRICES.monthly),
      quarterly: price(DEFAULT_GYM_PRICES.quarterly),
      annual: price(DEFAULT_GYM_PRICES.annual),
    },
  },
  { timestamps: true }
);

export const SystemSetting = mongoose.model<ISystemSetting>("SystemSetting", systemSettingSchema);
