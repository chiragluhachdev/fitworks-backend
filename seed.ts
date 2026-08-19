/* eslint-disable */
// @ts-nocheck
// Seed script — run with: npx tsx seed.ts
import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "./src/models/User";
import { Gym } from "./src/models/Gym";
import { Trainer } from "./src/models/Trainer";
import { Job } from "./src/models/Job";
import { Application } from "./src/models/Application";
import { Connection } from "./src/models/Connection";

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI as string);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("Error connecting to MongoDB", error);
    process.exit(1);
  }
};

const seedData = async () => {
  await connectDB();

  try {
    // Clear existing data
    await User.deleteMany({});
    await Gym.deleteMany({});
    await Trainer.deleteMany({});
    await Job.deleteMany({});
    await Application.deleteMany({});
    await Connection.deleteMany({});

    console.log("Existing data cleared.");

    // User ObjectIDs
    const gymUserId1 = new mongoose.Types.ObjectId();
    const gymUserId2 = new mongoose.Types.ObjectId();
    const trainerUserId1 = new mongoose.Types.ObjectId();
    const trainerUserId2 = new mongoose.Types.ObjectId();
    const trainerUserId3 = new mongoose.Types.ObjectId();

    // 1. Create Gyms
    const gym1 = await Gym.create({
      userId: gymUserId1,
      gymName: "PowerFit Studio",
      slug: "powerfit-studio",
      gymLogo: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300&auto=format&fit=crop&q=80",
      gymDescription: "A premium boutique fitness studio focusing on functional movement, holistic yoga, and mobility training.",
      numberOfLocations: 2,
      website: "https://powerfit.in",
      instagram: "@powerfit_studio",
      address: {
        street: "Linking Road, Bandra West",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400050",
      },
      hiringInformation: {
        trainersRequired: 3,
        trainerTypes: ["Yoga", "Pilates", "Functional Training"],
        preferredExperience: "1-3 Years",
        salaryBudget: "25,000 - 35,000",
        hiringFrequency: "Regular",
      },
      contactPerson: {
        name: "Raj Mehta",
        designation: "Owner & General Manager",
        phone: "+91 98765 43210",
      },
    });

    const gym2 = await Gym.create({
      userId: gymUserId2,
      gymName: "Flex Gym & CrossFit",
      slug: "flex-gym",
      gymLogo: "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=300&auto=format&fit=crop&q=80",
      gymDescription: "State-of-the-art strength facility and licensed CrossFit affiliate with high performance athletic equipment.",
      numberOfLocations: 1,
      website: "https://flexgym.in",
      instagram: "@flexgym_india",
      address: {
        street: "100 Feet Road, Indiranagar",
        city: "Bangalore",
        state: "Karnataka",
        pincode: "560038",
      },
      hiringInformation: {
        trainersRequired: 2,
        trainerTypes: ["CrossFit", "Strength & Conditioning", "HIIT"],
        preferredExperience: "3-5 Years",
        salaryBudget: "35,000 - 50,000",
        hiringFrequency: "Urgent",
      },
      contactPerson: {
        name: "Anil Kumar",
        designation: "Head of Operations",
        phone: "+91 98765 43211",
      },
    });

    // 2. Create Gym Users (plain text password gets hashed by pre-save hook)
    await User.create({
      _id: gymUserId1,
      email: "raj@powerfit.com",
      passwordHash: "password123",
      role: "gym",
      profileId: gym1._id,
    });

    await User.create({
      _id: gymUserId2,
      email: "anil@flexgym.com",
      passwordHash: "password123",
      role: "gym",
      profileId: gym2._id,
    });

    // 3. Create Trainers
    const trainer1 = await Trainer.create({
      userId: trainerUserId1,
      slug: "rahul-sharma",
      personal: {
        fullName: "Rahul Sharma",
        profilePhoto: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80",
        dateOfBirth: new Date("1995-05-15"),
        gender: "Male",
        city: "Mumbai",
        location: "Bandra West",
      },
      professional: {
        professionalTitle: "Senior Yoga & Functional Coach",
        yearsOfExperience: 5,
        specializations: ["Yoga", "Meditation", "Pilates", "Mobility"],
        skills: ["Hatha Yoga", "Vinyasa Flow", "Postural Assessment", "Breathwork"],
        certifications: [{ name: "RYT-500 Yoga Alliance" }, { name: "ACE Certified Functional Specialist" }],
        education: "B.Sc in Physical Education & Sports Science",
        bio: "Dedicated holistic coach with 5+ years guiding clients toward sustainable mobility, strength, and stress resilience.",
      },
      workPreferences: {
        expectedMonthlySalary: "35,000",
        employmentType: ["Full-time", "Part-time"],
        preferredLocations: ["Mumbai"],
        availability: "Immediate",
        willingToRelocate: false,
      },
      verificationStatus: "verified",
      verificationDocuments: ["https://example.com/cert1.pdf"],
    });

    const trainer2 = await Trainer.create({
      userId: trainerUserId2,
      slug: "priya-verma",
      personal: {
        fullName: "Priya Verma",
        profilePhoto: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",
        dateOfBirth: new Date("1998-08-22"),
        gender: "Female",
        city: "Delhi NCR",
        location: "Gurgaon Sector 43",
      },
      professional: {
        professionalTitle: "CrossFit & Athletic Conditioning Coach",
        yearsOfExperience: 3,
        specializations: ["CrossFit", "Strength", "HIIT", "Olympic Weightlifting"],
        skills: ["Barbell Technique", "Metabolic Conditioning", "Sports Nutrition"],
        certifications: [{ name: "CrossFit Level 2 Trainer" }, { name: "ISSA Certified Fitness Coach" }],
        education: "Diploma in Exercise Physiology",
        bio: "Former state athlete turned strength coach passionate about helping gym members hit PRs safely.",
      },
      workPreferences: {
        expectedMonthlySalary: "40,000",
        employmentType: ["Full-time"],
        preferredLocations: ["Delhi NCR"],
        availability: "15 Days",
        willingToRelocate: true,
      },
      verificationStatus: "pending",
      verificationDocuments: ["https://example.com/crossfit-cert.pdf"],
    });

    const trainer3 = await Trainer.create({
      userId: trainerUserId3,
      slug: "vikram-malhotra",
      personal: {
        fullName: "Vikram Malhotra",
        profilePhoto: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80",
        dateOfBirth: new Date("1993-11-10"),
        gender: "Male",
        city: "Bangalore",
        location: "Koramangala",
      },
      professional: {
        professionalTitle: "Master Bodybuilding & Hypertrophy Coach",
        yearsOfExperience: 7,
        specializations: ["Bodybuilding", "Hypertrophy", "Contest Prep", "Powerlifting"],
        skills: ["Biomechanics", "Nutritional Periodization", "Form Optimization"],
        certifications: [{ name: "Gold's Gym Fitness Institute Master Trainer" }],
        education: "B.Com + Certified Sports Nutritionist",
        bio: "Veteran fitness mentor with a decade of transforming physiques, developing coaches, and managing gym floors.",
      },
      workPreferences: {
        expectedMonthlySalary: "50,000",
        employmentType: ["Full-time"],
        preferredLocations: ["Bangalore"],
        availability: "15 Days Notice",
        willingToRelocate: false,
      },
      verificationStatus: "verified",
      verificationDocuments: ["https://example.com/cert3.pdf"],
    });

    // 4. Create Trainer Users
    await User.create({
      _id: trainerUserId1,
      email: "rahul@trainer.com",
      passwordHash: "password123",
      role: "trainer",
      profileId: trainer1._id,
    });

    await User.create({
      _id: trainerUserId2,
      email: "priya@trainer.com",
      passwordHash: "password123",
      role: "trainer",
      profileId: trainer2._id,
    });

    await User.create({
      _id: trainerUserId3,
      email: "vikram@trainer.com",
      passwordHash: "password123",
      role: "trainer",
      profileId: trainer3._id,
    });

    // 5. Create Job Vacancies
    const job1 = await Job.create({
      gymId: gym1._id,
      position: "Lead Yoga & Functional Instructor",
      description: "Looking for an energetic, experienced yoga teacher to conduct morning Vinyasa and flexibility classes for our premium members.",
      requirements: {
        experience: "1-3 Years",
        specialization: "Yoga",
      },
      salaryRange: "₹28,000 - ₹35,000 / mo",
      employmentType: "Full-time",
      location: "Bandra West, Mumbai",
      numberOfOpenings: 1,
      applicationDeadline: new Date(Date.now() + 15 * 86400000),
      status: "open",
    });

    const job2 = await Job.create({
      gymId: gym1._id,
      position: "Pilates & Core Specialist",
      description: "Seeking a certified Pilates mat/reformer instructor for group conditioning and 1-on-1 client training.",
      requirements: {
        experience: "1-3 Years",
        specialization: "Pilates",
      },
      salaryRange: "₹30,000 - ₹40,000 / mo",
      employmentType: "Part-time",
      location: "Bandra West, Mumbai",
      numberOfOpenings: 1,
      applicationDeadline: new Date(Date.now() + 20 * 86400000),
      status: "open",
    });

    const job3 = await Job.create({
      gymId: gym2._id,
      position: "CrossFit & Athletic Strength Coach",
      description: "Need a high-tempo coach to lead daily WODs, coach barbell lifting mechanics, and motivate group workout classes.",
      requirements: {
        experience: "3-5 Years",
        specialization: "CrossFit",
      },
      salaryRange: "₹35,000 - ₹50,000 / mo",
      employmentType: "Full-time",
      location: "Indiranagar, Bangalore",
      numberOfOpenings: 2,
      applicationDeadline: new Date(Date.now() + 10 * 86400000),
      status: "open",
    });

    const job4 = await Job.create({
      gymId: gym2._id,
      position: "Personal Fitness & Transformation Coach",
      description: "Work with private clients to develop tailored nutrition and resistance training programs for fat loss and muscle gain.",
      requirements: {
        experience: "1-3 Years",
        specialization: "General Fitness",
      },
      salaryRange: "₹30,000 - ₹42,000 / mo",
      employmentType: "Full-time",
      location: "Indiranagar, Bangalore",
      numberOfOpenings: 1,
      applicationDeadline: new Date(Date.now() + 25 * 86400000),
      status: "open",
    });

    // 6. Create Applications
    await Application.create({
      jobId: job1._id,
      gymId: gym1._id,
      trainerId: trainer1._id,
      coverLetter: "I have 5+ years of experience leading Vinyasa and Functional movement batches. Looking forward to connecting!",
      status: "shortlisted",
    });

    await Application.create({
      jobId: job3._id,
      gymId: gym2._id,
      trainerId: trainer2._id,
      coverLetter: "Certified CrossFit L2 trainer with athletic coaching background. Excited about your high-performance facility.",
      status: "applied",
    });

    await Application.create({
      jobId: job4._id,
      gymId: gym2._id,
      trainerId: trainer3._id,
      coverLetter: "Experienced transformation coach with 50+ successful client body transformations in Bangalore.",
      status: "reviewing",
    });

    // 7. Create Connections
    await Connection.create({
      gymId: gym1._id,
      trainerId: trainer2._id,
      message: "Hi Priya! We saw your CrossFit background and would love to interview you for an upcoming weekend strength workshop.",
      status: "pending",
    });

    await Connection.create({
      gymId: gym2._id,
      trainerId: trainer1._id,
      message: "Hi Rahul! We're expanding our mobility coaching programs and would like to discuss a potential collaboration.",
      status: "accepted",
    });

    console.log("=========================================");
    console.log("   FITWORKS MVP DATA SEEDED SUCCESSFULLY ");
    console.log("=========================================");
    console.log("Accounts created:");
    console.log("1. Gym: raj@powerfit.com / password123 (PowerFit Studio)");
    console.log("2. Gym: anil@flexgym.com / password123 (Flex Gym & CrossFit)");
    console.log("3. Trainer: rahul@trainer.com / password123 (Rahul Sharma)");
    console.log("4. Trainer: priya@trainer.com / password123 (Priya Verma)");
    console.log("5. Trainer: vikram@trainer.com / password123 (Vikram Malhotra)");
    console.log("=========================================");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding data:", error);
    process.exit(1);
  }
};

seedData();
