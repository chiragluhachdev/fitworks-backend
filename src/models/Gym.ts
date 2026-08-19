import mongoose, { Document, Schema } from "mongoose";

export interface IGym extends Document {
  userId: mongoose.Types.ObjectId; // References User
  gymName: string;
  gymLogo?: string;
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
