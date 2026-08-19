import mongoose from "mongoose";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

import slugify from "slugify";
import { Gym } from "../models/Gym";
import { Trainer } from "../models/Trainer";

const generateToken = (userId: string, role: string, profileId?: string) => {
  return jwt.sign({ userId, role, profileId }, process.env.JWT_SECRET as string, {
    expiresIn: "7d",
  });
};

const generateUniqueSlug = async (name: string, Model: any): Promise<string> => {
  let baseSlug = slugify(name, { lower: true, strict: true });
  let slug = baseSlug;
  let counter = 1;

  while (await Model.findOne({ slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return slug;
};

export const registerGym = async (req: Request, res: Response) => {
  try {
    const { 
      email, password, gymName, gymDescription, 
      address, numberOfLocations, hiringInformation, contactPerson, website, instagram
    } = req.body;

    if (!email || !password || !gymName) {
      return res.status(400).json({ success: false, message: "Please provide all required fields" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: "Email already in use" });
    }

    // 1. Create User
    const user = await User.create({
      email,
      passwordHash: password,
      role: "gym",
    });

    // 2. Generate slug and create Gym
    const slug = await generateUniqueSlug(gymName, Gym);
    const gym = await Gym.create({
      userId: user._id,
      gymName,
      gymDescription: gymDescription || `${gymName} is a premier fitness facility.`,
      address: address || { street: "Main St", city: "Mumbai", state: "Maharashtra", pincode: "400001" },
      numberOfLocations: numberOfLocations || 1,
      hiringInformation: hiringInformation || {
        trainersRequired: 2,
        trainerTypes: ["General Fitness"],
        preferredExperience: "1-3 Years",
        salaryBudget: "25,000 - 35,000",
        hiringFrequency: "Regular",
      },
      contactPerson: contactPerson || {
        name: "Gym Owner",
        designation: "Owner",
        phone: "+91 99999 99999",
      },
      website,
      instagram,
      slug,
    });

    // 3. Link gym to user
    user.profileId = gym._id as mongoose.Types.ObjectId;
    await user.save();

    const token = generateToken(user.id, user.role, gym._id.toString());

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profileId: gym._id,
        slug: gym.slug,
        gymName: gym.gymName,
      },
      gym,
    });
  } catch (error: any) {
    console.error("Register Gym Error:", error);
    const message = error?.code === 11000 
      ? "Account with this email already exists" 
      : error?.message || "Registration failed. Please verify your details.";
    res.status(400).json({ success: false, message });
  }
};

export const registerTrainer = async (req: Request, res: Response) => {
  try {
    const { 
      email, password, personal, professional, workPreferences, verificationDocuments
    } = req.body;

    if (!email || !password || !personal?.fullName) {
      return res.status(400).json({ success: false, message: "Please provide all required fields: Email, Password, and Full Name" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: "Email already in use. Please log in or use another email." });
    }

    // 1. Create User
    const user = await User.create({
      email,
      passwordHash: password,
      role: "trainer",
    });

    // 2. Generate slug and create Trainer
    const slug = await generateUniqueSlug(personal.fullName, Trainer);
    
    // Safe DOB parser
    let parsedDob = new Date("1995-01-01");
    if (personal.dateOfBirth) {
      const d = new Date(personal.dateOfBirth);
      if (!isNaN(d.getTime())) {
        parsedDob = d;
      }
    }

    const trainer = await Trainer.create({
      userId: user._id,
      personal: {
        fullName: personal.fullName.trim(),
        dateOfBirth: parsedDob,
        gender: personal.gender || "Male",
        city: personal.city || "Mumbai",
        location: personal.location || personal.city || "Mumbai",
      },
      professional: {
        professionalTitle: professional?.professionalTitle || "Certified Fitness Trainer",
        yearsOfExperience: Number(professional?.yearsOfExperience) || 1,
        specializations: professional?.specializations && professional.specializations.length > 0 ? professional.specializations : ["General Fitness"],
        skills: professional?.skills && professional.skills.length > 0 ? professional.skills : ["Fitness Coaching"],
        education: professional?.education || "Certified Trainer",
        bio: professional?.bio || "Passionate fitness professional dedicated to helping clients achieve peak wellness.",
      },
      workPreferences: workPreferences || {
        expectedMonthlySalary: "30,000",
        employmentType: ["Full-time"],
        availability: "Immediate",
        willingToRelocate: false,
      },
      verificationDocuments: verificationDocuments || [],
      slug,
    });

    // 3. Link trainer to user
    user.profileId = trainer._id as mongoose.Types.ObjectId;
    await user.save();

    const token = generateToken(user.id, user.role, trainer._id.toString());

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profileId: trainer._id,
        slug: trainer.slug,
        fullName: trainer.personal.fullName,
      },
      trainer,
    });
  } catch (error: any) {
    console.error("Register Trainer Error:", error);
    const message = error?.code === 11000 
      ? "Account with this email already exists" 
      : error?.message || "Registration failed. Please verify your details.";
    res.status(400).json({ success: false, message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please provide email and password" });
    }

    // Intercept Admin Login
    if (email === process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL) {
      if (password === process.env.ADMIN_PASSWORD) {
        const token = generateToken("admin-id", "admin");
        return res.status(200).json({
          success: true,
          token,
          user: {
            id: "admin-id",
            email: process.env.ADMIN_EMAIL,
            role: "admin",
            displayName: "FitWorks Admin",
          },
        });
      } else {
        return res.status(401).json({ success: false, message: "Invalid admin credentials" });
      }
    }

    // Find user and explicitly select passwordHash
    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    let slug = "";
    let displayName = "";

    if (user.role === "gym") {
      const gym = await Gym.findOne({ userId: user._id }) || (user.profileId ? await Gym.findById(user.profileId) : null);
      if (gym) {
        slug = gym.slug;
        displayName = gym.gymName;
        user.profileId = gym._id as any;
      }
    } else if (user.role === "trainer") {
      const trainer = await Trainer.findOne({ userId: user._id }) || (user.profileId ? await Trainer.findById(user.profileId) : null);
      if (trainer) {
        slug = trainer.slug;
        displayName = trainer.personal?.fullName;
        user.profileId = trainer._id as any;
      }
    }

    const token = generateToken(user.id, user.role, user.profileId?.toString());

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profileId: user.profileId,
        slug: slug || (user.role === "gym" ? "powerfit-studio" : "rahul-sharma"),
        gymName: user.role === "gym" ? displayName : undefined,
        fullName: user.role === "trainer" ? displayName : undefined,
      },
    });
  } catch (error: any) {
    console.error("Login Error:", error);
    res.status(500).json({ success: false, message: "Server error during login" });
  }
};

export const updatePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword, email } = req.body;
    let query: any = {};
    if (req.user?.userId) query._id = req.user.userId;
    else if (email) query.email = email;

    const user = await User.findOne(query).select("+passwordHash");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (currentPassword) {
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: "Current password is incorrect" });
      }
    }

    user.passwordHash = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: "Password updated successfully" });
  } catch (error: any) {
    console.error("Update Password Error:", error);
    res.status(500).json({ success: false, message: "Server error updating password" });
  }
};

