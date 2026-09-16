import mongoose, { Document, Schema } from "mongoose";

/**
 * A person who filled in a Meta (Instagram/Facebook) instant form.
 *
 * Deliberately its own collection, separate from Trainer and User: these people
 * have not signed up for anything yet. Nothing else in the app reads it, and a
 * lead only becomes a trainer by registering on the site like anyone else.
 */
export interface IInstantLead extends Document {
  fullName: string;
  /** Bare 10-digit Indian mobile, normalised on import so WhatsApp links work. */
  phone: string;
  email?: string;
  city?: string;
  /** Meta's own lead id. Unique so re-importing the same export can't duplicate. */
  leadId?: string;
  formName?: string;
  campaignName?: string;
  platform?: string;
  /** When Meta recorded the submission. */
  submittedAt?: Date;
  status: "new" | "contacted" | "registered" | "not_interested";
  notes?: string;
  /** Every column from the uploaded file, kept verbatim for anything we didn't map. */
  raw?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const instantLeadSchema = new Schema<IInstantLead>(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    city: { type: String, trim: true },
    leadId: { type: String, index: { unique: true, sparse: true } },
    formName: { type: String, trim: true },
    campaignName: { type: String, trim: true },
    platform: { type: String, trim: true },
    submittedAt: { type: Date },
    status: {
      type: String,
      enum: ["new", "contacted", "registered", "not_interested"],
      default: "new",
    },
    notes: { type: String },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const InstantLead = mongoose.model<IInstantLead>("InstantLead", instantLeadSchema);
