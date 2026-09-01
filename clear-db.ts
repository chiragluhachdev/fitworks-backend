/* eslint-disable */
// @ts-nocheck
/**
 * Clears all marketplace data, preserving admin accounts.
 *
 *   npx tsx clear-db.ts             -> DRY RUN (counts only, deletes nothing)
 *   npx tsx clear-db.ts --confirm   -> actually deletes
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "./src/models/User";
import { Gym } from "./src/models/Gym";
import { Trainer } from "./src/models/Trainer";
import { Job } from "./src/models/Job";
import { Application } from "./src/models/Application";
import { Connection } from "./src/models/Connection";

dotenv.config();

const CONFIRMED = process.argv.includes("--confirm");

async function main() {
  const uri = process.env.MONGODB_URI as string;
  await mongoose.connect(uri);

  const conn = mongoose.connection;
  console.log(`\nConnected to: ${conn.host} / db "${conn.name}"`);
  console.log(CONFIRMED ? "\n*** LIVE RUN — DELETING ***\n" : "\n--- DRY RUN (nothing will be deleted) ---\n");

  const admins = await User.find({ role: "admin" }).select("email role");
  const nonAdmins = await User.countDocuments();

  const counts = {
    "users": nonAdmins,
    trainers: await Trainer.countDocuments(),
    gyms: await Gym.countDocuments(),
    "jobs/vacancies": await Job.countDocuments(),
    applications: await Application.countDocuments(),
    connections: await Connection.countDocuments(),
  };

  console.log("WILL DELETE:");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${String(v).padStart(5)}  ${k}`);

  console.log("\nWILL KEEP:");
  console.log(`     admin login via env (${process.env.ADMIN_EMAIL || "NOT SET"})`);
  admins.forEach((a) => console.log(`     ${a.email} (db record)`));

  if (!CONFIRMED) {
    console.log("\nDry run complete. Re-run with --confirm to delete.\n");
    await mongoose.disconnect();
    return;
  }

  // Admin login is env-based (see auth.controller.ts), not a DB record —
  // so guard on the env credentials rather than on a User document.
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.error("\nABORTED: ADMIN_EMAIL / ADMIN_PASSWORD not set. Refusing to wipe with no way to log back in.\n");
    await mongoose.disconnect();
    process.exit(1);
  }

  const results = {
    users: await User.deleteMany({}),
    trainers: await Trainer.deleteMany({}),
    gyms: await Gym.deleteMany({}),
    jobs: await Job.deleteMany({}),
    applications: await Application.deleteMany({}),
    connections: await Connection.deleteMany({}),
  };

  console.log("DELETED:");
  for (const [k, r] of Object.entries(results)) console.log(`  ${String(r.deletedCount).padStart(5)}  ${k}`);
  console.log(`\nAdmin accounts preserved: ${admins.length}\n`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
