import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcrypt";

export interface IUser extends Document {
  /** Optional — trainers may register with a phone number alone. */
  email?: string;
  /** Bare 10-digit Indian mobile. Primary login identifier. */
  phone: string;
  phoneVerified: boolean;
  passwordHash: string;
  role: "gym" | "trainer" | "admin";
  profileId?: mongoose.Types.ObjectId; // References Gym or Trainer document
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      // sparse so any number of accounts may omit an email, while the ones
      // that supply one still can't collide.
      index: { unique: true, sparse: true },
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"],
    },
    phoneVerified: { type: Boolean, default: false },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
      select: false, // Don't return password by default
    },
    role: {
      type: String,
      enum: ["gym", "trainer", "admin"],
      required: true,
    },
    profileId: {
      type: Schema.Types.ObjectId,
      refPath: "role", // Dynamic reference based on role ("gym" | "trainer")
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("passwordHash")) return;
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

export const User = mongoose.model<IUser>("User", userSchema);
