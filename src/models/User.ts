import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcrypt";

export interface IUser extends Document {
  email: string;
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
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
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
