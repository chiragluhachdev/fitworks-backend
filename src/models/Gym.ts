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
    /** When this gym first became a member. Written once. */
    startedAt?: Date;
    /** End of the term currently paid for. */
    expiresAt?: Date;
    /** Rupees charged for the current term. */
    amount?: number;
    /** The order we are waiting on, and the plan it was raised for. */
    pendingOrderId?: string;
    pendingPlan?: "monthly" | "quarterly" | "annual";
    lastOrderId?: string;
    lastPaymentId?: string;
    /** Immutable payment record — every term this gym has bought. */
    history: {
      orderId: string;
      paymentId: string;
      plan: string;
      amount: number;
      paidAt: Date;
      periodStart: Date;
      periodEnd: Date;
    }[];
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
      // Held between raising the order and the payment coming back, so the
      // term is decided by what we charged for — never by what the browser
      // sends us at verification time.
      pendingOrderId: { type: String },
      pendingPlan: {
        type: String,
        enum: ["monthly", "quarterly", "annual"],
      },
      lastOrderId: { type: String },
      lastPaymentId: { type: String },
      history: [
        {
          orderId: { type: String, required: true },
          paymentId: { type: String, required: true },
          plan: { type: String, required: true },
          amount: { type: Number, required: true },
          paidAt: { type: Date, required: true },
          periodStart: { type: Date, required: true },
          periodEnd: { type: Date, required: true },
        },
      ],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

gymSchema.index({ "subscription.pendingOrderId": 1 });
gymSchema.index({ "subscription.status": 1, "subscription.expiresAt": 1 });

export const Gym = mongoose.model<IGym>("Gym", gymSchema);
