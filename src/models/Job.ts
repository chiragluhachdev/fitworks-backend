import mongoose, { Document, Schema } from "mongoose";

export interface IJob extends Document {
  gymId: mongoose.Types.ObjectId;
  position: string;
  description: string;
  requirements: {
    experience: string;
    specialization: string;
  };
  salaryRange: string;
  employmentType: string;
  location: string;
  numberOfOpenings: number;
  applicationDeadline: Date;
  status: "open" | "closed";
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    gymId: {
      type: Schema.Types.ObjectId,
      ref: "Gym",
      required: true,
    },
    position: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    requirements: {
      experience: { type: String, required: true },
      specialization: { type: String, required: true },
    },
    salaryRange: {
      type: String,
      required: true,
    },
    employmentType: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    numberOfOpenings: {
      type: Number,
      required: true,
      default: 1,
    },
    applicationDeadline: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },
  },
  { timestamps: true }
);

export const Job = mongoose.model<IJob>("Job", jobSchema);
