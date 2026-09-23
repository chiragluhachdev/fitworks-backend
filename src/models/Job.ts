import mongoose, { Document, Schema } from "mongoose";

/**
 * The stages a vacancy moves through while the FitWorks team works on it.
 *
 * This is the admin's field. It is deliberately separate from `status`, which
 * is the gym's own open/closed switch: a gym closing a role and the team
 * finishing its search are different events, and one must not overwrite the
 * other.
 */
export const PIPELINE_STAGES = [
  "new",
  "under_review",
  "finding_trainers",
  "trainers_shortlisted",
  "gym_contacted",
  "connecting",
  "filled",
  "closed",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface IJob extends Document {
  gymId: mongoose.Types.ObjectId;
  position: string;
  description: string;
  requirements: {
    experience: string;
    specialization: string;
    /** The role itself — "Personal Trainer", "Yoga Instructor", … */
    trainerType?: string;
  };
  salaryRange: string;
  employmentType: string;
  location: string;
  /** Which branch this opening is for, when a gym runs more than one. */
  branchName?: string;
  workingHours?: string;
  /** Must-haves, kept apart from the description so both stay readable. */
  requirementsText?: string;
  additionalInfo?: string;
  numberOfOpenings: number;
  applicationDeadline?: Date;
  status: "open" | "closed";
  pipelineStatus: PipelineStage;
  /** Free text only the FitWorks team sees. */
  adminNotes?: string;
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
      trainerType: { type: String, trim: true },
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
    branchName: { type: String, trim: true },
    workingHours: { type: String, trim: true },
    requirementsText: { type: String },
    additionalInfo: { type: String },
    numberOfOpenings: {
      type: Number,
      required: true,
      default: 1,
    },
    // Optional: a gym hiring "until filled" shouldn't be forced to invent a date.
    applicationDeadline: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },
    // Vacancies posted before this field existed read as "new", which is
    // exactly where an unreviewed requirement belongs.
    pipelineStatus: {
      type: String,
      enum: PIPELINE_STAGES,
      default: "new",
    },
    adminNotes: { type: String },
  },
  { timestamps: true }
);

// The admin board sorts by stage; the gym dashboards filter by gym.
jobSchema.index({ pipelineStatus: 1, createdAt: -1 });
jobSchema.index({ gymId: 1, createdAt: -1 });

export const Job = mongoose.model<IJob>("Job", jobSchema);
