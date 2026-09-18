import mongoose, { Document, Schema } from "mongoose";

export interface ISystemSetting extends Document {
  otpEnabled: boolean;
  updatedAt: Date;
}

const systemSettingSchema = new Schema<ISystemSetting>(
  {
    otpEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const SystemSetting = mongoose.model<ISystemSetting>("SystemSetting", systemSettingSchema);
