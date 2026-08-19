import mongoose, { Document, Schema } from "mongoose";

export interface ITrainer extends Document {
  userId: mongoose.Types.ObjectId;
  personal: {
    fullName: string;
    profilePhoto?: string;
    dateOfBirth: Date;
    gender: string;
    city: string;
    location: string;
  };
  professional: {
    professionalTitle: string;
    yearsOfExperience: number;
    specializations: string[];
    skills: string[];
    certifications: { name: string; url?: string }[];
    education: string;
    previousGyms?: string;
    bio: string;
  };
  workPreferences: {
    expectedMonthlySalary: string;
    employmentType: string[]; // e.g. ["Full-time", "Freelance"]
    preferredLocations: string[];
    availability: string;
    willingToRelocate: boolean;
  };
  verificationStatus: "pending" | "verified" | "rejected";
  verificationDocuments: string[]; // URLs to documents
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

const trainerSchema = new Schema<ITrainer>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    personal: {
      fullName: { type: String, required: true, trim: true },
      profilePhoto: { type: String, default: "" },
      dateOfBirth: { type: Date, required: true },
      gender: { type: String, required: true },
      city: { type: String, required: true },
      location: { type: String, required: true },
    },
    professional: {
      professionalTitle: { type: String, required: true },
      yearsOfExperience: { type: Number, required: true },
      specializations: [{ type: String }],
      skills: [{ type: String }],
      certifications: [
        {
          name: { type: String, required: true },
          url: { type: String },
        },
      ],
      education: { type: String, required: true },
      previousGyms: { type: String },
      bio: { type: String, required: true },
    },
    workPreferences: {
      expectedMonthlySalary: { type: String, required: true },
      employmentType: [{ type: String }],
      preferredLocations: [{ type: String }],
      availability: { type: String, required: true },
      willingToRelocate: { type: Boolean, required: true, default: false },
    },
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },
    verificationDocuments: [{ type: String }],
    slug: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

export const Trainer = mongoose.model<ITrainer>("Trainer", trainerSchema);
