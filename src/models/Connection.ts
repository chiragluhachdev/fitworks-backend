import mongoose, { Document, Schema } from "mongoose";

export interface IConnection extends Document {
  gymId: mongoose.Types.ObjectId;
  trainerId: mongoose.Types.ObjectId;
  status: "pending" | "accepted" | "rejected";
  message?: string;
  createdAt: Date;
  updatedAt: Date;
}

const connectionSchema = new Schema<IConnection>(
  {
    gymId: {
      type: Schema.Types.ObjectId,
      ref: "Gym",
      required: true,
    },
    trainerId: {
      type: Schema.Types.ObjectId,
      ref: "Trainer",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    message: {
      type: String,
    },
  },
  { timestamps: true }
);

// Prevent duplicate connection requests
connectionSchema.index({ gymId: 1, trainerId: 1 }, { unique: true });

export const Connection = mongoose.model<IConnection>("Connection", connectionSchema);
