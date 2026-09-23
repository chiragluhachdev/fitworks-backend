import mongoose, { Document, Schema } from "mongoose";

/**
 * A trainer under consideration for one gym's vacancy.
 *
 * Originally a trainer-submitted application. FitWorks now introduces trainers
 * itself, so these rows are created by the admin team instead — the shape was
 * already right, so it is reused rather than duplicated in a second collection.
 * `source` says which era a row came from, and the older statuses are kept so
 * historical rows stay readable.
 */
export const CANDIDATE_STAGES = [
  "applied",
  "reviewing",
  "shortlisted",
  "contacted",
  "interested",
  "not_interested",
  "shared",
  "connected",
  "hired",
  "rejected",
] as const;

export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export interface IApplication extends Document {
  jobId: mongoose.Types.ObjectId;
  trainerId: mongoose.Types.ObjectId;
  gymId: mongoose.Types.ObjectId;
  status: CandidateStage;
  /** "trainer" for rows from the self-apply era, "admin" for a shortlist. */
  source: "trainer" | "admin";
  coverLetter?: string;
  /** Internal — never returned to a gym or a trainer. */
  adminNotes?: string;
  contactedAt?: Date;
  sharedAt?: Date;
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
      enum: CANDIDATE_STAGES,
      default: "shortlisted",
    },
    // Existing rows have no source and all of them came from trainers applying.
    source: {
      type: String,
      enum: ["trainer", "admin"],
      default: "trainer",
    },
    coverLetter: {
      type: String,
    },
    adminNotes: {
      type: String,
    },
    contactedAt: { type: Date },
    sharedAt: { type: Date },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// One row per trainer per vacancy — stops a trainer being shortlisted twice.
applicationSchema.index({ jobId: 1, trainerId: 1 }, { unique: true });

export const Application = mongoose.model<IApplication>("Application", applicationSchema);
