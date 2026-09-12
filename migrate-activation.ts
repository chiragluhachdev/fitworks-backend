/* eslint-disable */
// @ts-nocheck
/**
 * Backfills subscription.activatedAt for trainers who paid under the monthly
 * model, so their purchase becomes a permanent activation.
 *
 *   npx tsx migrate-activation.ts            -> DRY RUN
 *   npx tsx migrate-activation.ts --confirm  -> writes
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const CONFIRMED = process.argv.includes("--confirm");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db;
  console.log(`\nDatabase: ${db.databaseName}`);
  console.log(CONFIRMED ? "*** LIVE RUN ***\n" : "--- DRY RUN (nothing written) ---\n");

  const all = await db.collection("trainers").find({}).toArray();
  const needsBackfill = all.filter(
    (t) => !t.subscription?.activatedAt && (t.subscription?.history || []).length > 0
  );
  const alreadyDone = all.filter((t) => t.subscription?.activatedAt);
  const neverPaid = all.filter(
    (t) => !t.subscription?.activatedAt && (t.subscription?.history || []).length === 0
  );

  console.log(`  ${String(all.length).padStart(3)}  trainers total`);
  console.log(`  ${String(alreadyDone.length).padStart(3)}  already have activatedAt`);
  console.log(`  ${String(needsBackfill.length).padStart(3)}  paid but need backfill  ← this migration`);
  console.log(`  ${String(neverPaid.length).padStart(3)}  never paid (left untouched)\n`);

  if (needsBackfill.length) {
    console.log("  WILL SET activatedAt:");
    for (const t of needsBackfill) {
      const first = t.subscription.history[0];
      const oldEnd = t.subscription.currentPeriodEnd
        ? new Date(t.subscription.currentPeriodEnd).toISOString().slice(0, 10)
        : "—";
      console.log(
        `    ${(t.personal?.fullName || "?").padEnd(24)} paid ${new Date(first.paidAt).toISOString().slice(0, 10)}` +
        `  ₹${first.amount}   (monthly access would have ended ${oldEnd} → now permanent)`
      );
    }
    console.log("");
  }

  if (!CONFIRMED) {
    console.log("  Re-run with --confirm to write.\n");
    await mongoose.disconnect();
    return;
  }

  let n = 0;
  for (const t of needsBackfill) {
    const first = t.subscription.history[0];
    await db.collection("trainers").updateOne(
      { _id: t._id },
      {
        $set: {
          "subscription.activatedAt": new Date(first.paidAt),
          "subscription.plan": "trainer_activation_99",
          "subscription.amountPaid": first.amount ?? 99,
        },
      }
    );
    n++;
  }
  console.log(`  Backfilled ${n} trainer(s).\n`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
