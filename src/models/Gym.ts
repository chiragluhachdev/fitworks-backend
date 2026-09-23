import mongoose, { Document, Schema } from "mongoose";

export interface IGym extends Document {
  userId: mongoose.Types.ObjectId; // References User
  gymName: string;
  gymLogo?: string;
  /** Wide banner shown across the top of the gym profile. */
  coverImage?: string;
  gymDescription: string;
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
  website?: string;
  instagram?: string;
  numberOfLocations: number;
  /** Equipment and amenities — what a trainer would want to know. */
  facilities: string[];
  /** The kinds of training this gym runs. */
  specializations: string[];
  hiringInformation: {
    trainersRequired: number;
    trainerTypes: string[];
    preferredExperience: string;
    salaryBudget: string;
    hiringFrequency: string;
  };
  contactPerson: {
    name: string;
    designation: string;
    phone: string;
    email?: string;
  };
  subscription: {
    plan: "none" | "monthly" | "quarterly" | "annual";
    status: "inactive" | "active" | "expired";
    startedAt?: Date;
    expiresAt?: Date;
    /** Rupees charged for the current term. */
    amount?: number;
    /** A plan the gym asked for; the team activates it by hand. */
    requestedPlan?: "monthly" | "quarterly" | "annual";
    requestedAt?: Date;
  };
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

const gymSchema = new Schema<IGym>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    gymName: {
      type: String,
      required: true,
      trim: true,
    },
    gymLogo: {
      type: String,
      default: "",
    },
    coverImage: {
      type: String,
      default: "",
    },
    gymDescription: {
      type: String,
      required: true,
    },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
    },
    website: String,
    instagram: String,
    numberOfLocations: {
      type: Number,
      required: true,
      default: 1,
    },
    facilities: [{ type: String, trim: true }],
    specializations: [{ type: String, trim: true }],
    hiringInformation: {
      trainersRequired: { type: Number, required: true },
      trainerTypes: [{ type: String }],
      preferredExperience: { type: String, required: true },
      salaryBudget: { type: String, required: true },
      hiringFrequency: { type: String, required: true },
    },
    contactPerson: {
      name: { type: String, required: true },
      designation: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, lowercase: true, trim: true },
    },
    // Gyms that signed up before plans existed read as inactive, which is
    // correct — nobody has been charged.
    subscription: {
      plan: {
        type: String,
        enum: ["none", "monthly", "quarterly", "annual"],
        default: "none",
      },
      status: {
        type: String,
        enum: ["inactive", "active", "expired"],
        default: "inactive",
      },
      startedAt: { type: Date },
      expiresAt: { type: Date },
      amount: { type: Number },
      requestedPlan: {
        type: String,
        enum: ["monthly", "quarterly", "annual"],
      },
      requestedAt: { type: Date },
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

export const Gym = mongoose.model<IGym>("Gym", gymSchema);
