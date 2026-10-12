/* eslint-disable */
// @ts-nocheck
/**
 * Moves gym billing from three terms to a single one-time fee.
 *
 *   npx tsx migrate-gym-one-time.ts            -> DRY RUN
 *   npx tsx migrate-gym-one-time.ts --confirm  -> writes
 *
 * Safe to run twice. No gym had ever paid when this was written, so there are
 * no terms to honour and no refunds to think about — it only rewrites the
 * settings document and clears pending orders that reference a plan id which
 * no longer exists.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();
const CONFIRMED = process.argv.includes("--confirm");
const PRICE = 499;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db!;
  console.log(`\nDatabase: ${db.databaseName}`);
  console.log(CONFIRMED ? "\n*** LIVE RUN ***\n" : "\n--- DRY RUN (nothing written) ---\n");

  // Anyone who actually paid would need their term honouring. Refuse rather
  // than quietly converting a half-used annual plan into a one-time fee.
  const paid = await db
    .collection("gyms")
    .countDocuments({ "subscription.history.0": { $exists: true } });
  console.log(`Gyms with payment history: ${paid}`);
  if (paid > 0) {
    console.error("\nRefusing to run: some gyms have paid for a term. Migrate them by hand.\n");
    await mongoose.disconnect();
    process.exit(1);
  }

  const settings = await db.collection("systemsettings").findOne({});
  console.log(`Settings gymPlanPrices: ${JSON.stringify(settings?.gymPlanPrices ?? null)}`);
  console.log(`Settings gymAccessPrice: ${settings?.gymAccessPrice ?? "(unset)"} -> ${PRICE}`);

  const stale = await db
    .collection("gyms")
    .find({ $or: [{ "subscription.pendingPlan": { $exists: true } }, { "subscription.expiresAt": { $exists: true } }] })
    .project({ slug: 1, subscription: 1 })
    .toArray();
  console.log(`\nGyms with stale term fields: ${stale.length}`);
  stale.forEach((g: any) =>
    console.log(`  ${g.slug}: pendingPlan=${g.subscription?.pendingPlan ?? "—"} expiresAt=${g.subscription?.expiresAt ?? "—"}`)
  );

  if (!CONFIRMED) {
    console.log("\n  Re-run with --confirm to write.\n");
    await mongoose.disconnect();
    return;
  }

  const s = await db.collection("systemsettings").updateMany(
    {},
    { $set: { gymAccessPrice: PRICE }, $unset: { gymPlanPrices: "" } }
  );
  console.log(`\nSettings updated: ${s.modifiedCount}`);

  // pendingPlan referenced "quarterly"/"annual", which no longer resolve, so a
  // returning checkout would fail to verify. Clearing it just means the gym
  // starts a fresh order.
  const g = await db.collection("gyms").updateMany(
    {},
    {
      $unset: {
        "subscription.pendingPlan": "",
        "subscription.expiresAt": "",
        "subscription.startedAt": "",
        "subscription.requestedPlan": "",
        "subscription.requestedAt": "",
      },
    }
  );
  console.log(`Gyms cleaned: ${g.modifiedCount}\n`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
