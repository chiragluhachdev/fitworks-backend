import mongoose, { Document, Schema } from "mongoose";

export interface IApplication extends Document {
  jobId: mongoose.Types.ObjectId;
  trainerId: mongoose.Types.ObjectId;
  gymId: mongoose.Types.ObjectId;
  status: "applied" | "reviewing" | "shortlisted" | "rejected" | "hired";
  coverLetter?: string;
  appliedAt: Date;
  updatedAt: Date;
}

const applicationSchema = new Schema<IApplication>(
  {
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    trainerId: {
      type: Schema.Types.ObjectId,
      ref: "Trainer",
      required: true,
    },
    gymId: {
      type: Schema.Types.ObjectId,
      ref: "Gym",
      required: true,
    },
    status: {
      type: String,
      enum: ["applied", "reviewing", "shortlisted", "rejected", "hired"],
      default: "applied",
    },
    coverLetter: {
      type: String,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Prevent multiple applications by same trainer for same job
applicationSchema.index({ jobId: 1, trainerId: 1 }, { unique: true });

export const Application = mongoose.model<IApplication>("Application", applicationSchema);
