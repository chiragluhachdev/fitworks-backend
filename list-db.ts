/* eslint-disable */
// @ts-nocheck
// READ ONLY — lists what's currently in the database.
import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "./src/models/User";
import { Gym } from "./src/models/Gym";
import { Trainer } from "./src/models/Trainer";
import { Job } from "./src/models/Job";
dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  console.log("\n=== TRAINERS ===");
  for (const t of await Trainer.find().sort({ createdAt: 1 })) {
    console.log(`  ${t.personal?.fullName?.padEnd(22) || "?".padEnd(22)} ${String(t.verificationStatus).padEnd(9)} paid=${t.payment?.isPaid ? "yes" : "no "}  ${t.createdAt?.toISOString().slice(0,10)}  /${t.slug}`);
  }

  console.log("\n=== GYMS ===");
  for (const g of await Gym.find().sort({ createdAt: 1 })) {
    console.log(`  ${g.gymName?.padEnd(28)} ${String(g.address?.city).padEnd(14)} ${g.createdAt?.toISOString().slice(0,10)}  /${g.slug}`);
  }

  console.log("\n=== USERS ===");
  for (const u of await User.find().sort({ createdAt: 1 })) {
    console.log(`  ${u.email?.padEnd(34)} ${String(u.role).padEnd(8)} ${u.createdAt?.toISOString().slice(0,10)}`);
  }

  console.log("\n=== VACANCIES ===");
  for (const j of await Job.find().sort({ createdAt: 1 })) {
    console.log(`  ${j.position?.padEnd(28)} ${String(j.status).padEnd(7)} ${j.createdAt?.toISOString().slice(0,10)}`);
  }
  console.log();
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
