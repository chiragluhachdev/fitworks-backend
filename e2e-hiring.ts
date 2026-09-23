/* eslint-disable */
// @ts-nocheck
/**
 * End-to-end check of the admin-controlled hiring workflow, against the
 * scratch database only. Seeds its own gym, trainers and admin, mints their
 * tokens directly (registration needs a real OTP), then drives the whole
 * journey through HTTP exactly as the dashboards do.
 */
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
import { User } from "./src/models/User";
import { Gym } from "./src/models/Gym";
import { Trainer } from "./src/models/Trainer";
import { Job } from "./src/models/Job";
import { Application } from "./src/models/Application";
import { SystemSetting } from "./src/models/SystemSetting";

dotenv.config();
const BASE = "http://localhost:5099/api";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${detail && !ok ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const call = async (path: string, init: any = {}, token?: string) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
};

const sign = (u: any, role: string, profileId: any) =>
  jwt.sign({ userId: String(u._id), role, profileId: String(profileId) }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db.databaseName;
  if (!db.includes("e2e")) throw new Error(`Refusing to run against "${db}"`);
  console.log(`\nDatabase: ${db}\n`);

  // Clean slate for this run only.
  await Promise.all([
    User.deleteMany({ email: /@e2e\.local$/ }),
    Gym.deleteMany({ slug: /^e2e-/ }),
    Trainer.deleteMany({ slug: /^e2e-/ }),
  ]);
  await SystemSetting.deleteMany({});
  const staleGyms = await Gym.find({ slug: /^e2e-/ }).select("_id");
  await Job.deleteMany({ gymId: { $in: staleGyms.map((g) => g._id) } });

  /* ── Seed ── */
  const adminUser = await User.create({
    email: "admin@e2e.local", passwordHash: "x".repeat(60), role: "admin", phone: "9000000001",
  });
  const gymUser = await User.create({
    email: "gym@e2e.local", passwordHash: "x".repeat(60), role: "gym", phone: "9000000002",
  });
  const gym = await Gym.create({
    userId: gymUser._id,
    gymName: "E2E Strength Club",
    gymDescription: "A scratch gym used only by the automated workflow check.",
    address: { street: "1 Test Road", city: "Bangalore", state: "Karnataka", pincode: "560001" },
    numberOfLocations: 1,
    hiringInformation: {
      trainersRequired: 2, trainerTypes: ["Personal Trainer"],
      preferredExperience: "1-3 Years", salaryBudget: "25000-35000", hiringFrequency: "Regular",
    },
    contactPerson: { name: "E2E Owner", designation: "Owner", phone: "9000000002" },
    slug: "e2e-strength-club",
  });

  const makeTrainer = async (n: number, status: string) => {
    const u = await User.create({
      email: `trainer${n}@e2e.local`, passwordHash: "x".repeat(60), role: "trainer", phone: `900000010${n}`,
    });
    const t = await Trainer.create({
      userId: u._id,
      personal: {
        fullName: `E2E Trainer ${n}`, phone: `900000010${n}`, email: `trainer${n}@e2e.local`,
        dateOfBirth: new Date("1995-01-01"), gender: "Male", city: "Bangalore", location: "Indiranagar",
      },
      professional: {
        professionalTitle: "Personal trainer", yearsOfExperience: 3,
        specializations: ["Strength & Conditioning"], skills: ["Client management"],
        education: "Level 3", bio: "A scratch profile created by the automated workflow check.",
        certifications: [],
      },
      workPreferences: {
        expectedMonthlySalary: "30000", employmentType: ["Full-time"],
        preferredLocations: ["Bangalore"], availability: "Immediate", willingToRelocate: true,
      },
      verificationStatus: status,
      slug: `e2e-trainer-${n}`,
    });
    return { u, t, token: sign(u, "trainer", t._id) };
  };

  const verified = await makeTrainer(1, "verified");
  const pending = await makeTrainer(2, "pending");

  const adminToken = sign(adminUser, "admin", adminUser._id);
  const gymToken = sign(gymUser, "gym", gym._id);

  /* ── 1. Gym posts a vacancy ── */
  console.log("1. Gym posts a vacancy");
  const created = await call("/jobs", {
    method: "POST",
    body: {
      gymSlug: gym.slug,
      position: "Senior Personal Trainer",
      description: "Running personal training sessions for six to eight clients a day.",
      requirements: { experience: "3-5 Years", specialization: "Strength & Conditioning", trainerType: "Personal Trainer" },
      salaryRange: "₹30,000 - ₹45,000 / month",
      employmentType: "Full-time",
      location: "Indiranagar, Bangalore",
      branchName: "100 Feet Road",
      workingHours: "Split shift (morning + evening)",
      requirementsText: "Certified trainer, English and Kannada.",
      additionalInfo: "Incentives on PT packages.",
      numberOfOpenings: 2,
    },
  }, gymToken);
  check("vacancy created", created.status === 201, JSON.stringify(created.json).slice(0, 160));
  const jobId = created.json?.data?._id;
  check("lands in the team's queue as 'new'", created.json?.data?.pipelineStatus === "new", created.json?.data?.pipelineStatus);
  check("new fields stored", created.json?.data?.workingHours === "Split shift (morning + evening)" && created.json?.data?.branchName === "100 Feet Road");

  /* ── 2. Another gym cannot post in this gym's name ── */
  const otherGymUser = await User.create({ email: "gym2@e2e.local", passwordHash: "x".repeat(60), role: "gym", phone: "9000000003" });
  const otherToken = sign(otherGymUser, "gym", new mongoose.Types.ObjectId());
  const stolen = await call("/jobs", { method: "POST", body: { gymSlug: gym.slug, position: "X", description: "y", salaryRange: "1", employmentType: "Full-time", location: "Z" } }, otherToken);
  check("another gym is refused", stolen.status === 403, `${stolen.status}`);

  /* ── 3. Gym dashboard ── */
  console.log("\n2. Gym dashboard");
  const dash = await call(`/gyms/${gym.slug}/dashboard`, {}, gymToken);
  check("dashboard loads", dash.status === 200);
  check("counts one vacancy", dash.json?.data?.stats?.totalVacancies === 1, JSON.stringify(dash.json?.data?.stats));
  check("shows it as active", dash.json?.data?.stats?.activeVacancies === 1);
  check("no trainers in review yet", dash.json?.data?.stats?.trainersInReview === 0);
  check("subscription starts inactive", dash.json?.data?.subscription?.isActive === false);
  check("profile completion computed", typeof dash.json?.data?.completion?.percent === "number", String(dash.json?.data?.completion?.percent));

  /* ── 4. Gym can't see another gym's dashboard ── */
  const peek = await call(`/gyms/${gym.slug}/dashboard`, {}, otherToken);
  check("another gym is refused the dashboard", peek.status === 403, `${peek.status}`);

  /* ── 5. Admin board ── */
  console.log("\n3. Admin vacancy board");
  const board = await call("/admin/hiring/vacancies", {}, adminToken);
  check("board loads", board.status === 200);
  check("vacancy is on it", board.json?.data?.some((j: any) => String(j._id) === String(jobId)));
  check("stage counts present", board.json?.byStage?.new >= 1, JSON.stringify(board.json?.byStage));
  const nonAdmin = await call("/admin/hiring/vacancies", {}, gymToken);
  check("a gym is refused the board", nonAdmin.status === 403, `${nonAdmin.status}`);

  /* ── 6. Trainer search ── */
  console.log("\n4. Trainer search & shortlisting");
  const search = await call(`/admin/hiring/trainer-search?jobId=${jobId}&city=Bangalore`, {}, adminToken);
  check("search returns the verified trainer", search.json?.data?.some((t: any) => t.slug === "e2e-trainer-1"));
  check("search hides the pending trainer", !search.json?.data?.some((t: any) => t.slug === "e2e-trainer-2"));

  const shortlisted = await call(`/admin/hiring/vacancies/${jobId}/shortlist`, { method: "POST", body: { trainerId: verified.t._id } }, adminToken);
  check("trainer shortlisted", shortlisted.status === 201, JSON.stringify(shortlisted.json).slice(0, 160));
  const rowId = shortlisted.json?.data?._id;

  const dupe = await call(`/admin/hiring/vacancies/${jobId}/shortlist`, { method: "POST", body: { trainerId: verified.t._id } }, adminToken);
  check("the same trainer can't be added twice", dupe.status === 400, `${dupe.status}`);

  const afterShortlist = await call(`/admin/hiring/vacancies/${jobId}`, {}, adminToken);
  check("vacancy auto-moved to 'trainers_shortlisted'", afterShortlist.json?.data?.vacancy?.pipelineStatus === "trainers_shortlisted", afterShortlist.json?.data?.vacancy?.pipelineStatus);

  const searchAgain = await call(`/admin/hiring/trainer-search?jobId=${jobId}`, {}, adminToken);
  check("an already-shortlisted trainer drops out of the picker", !searchAgain.json?.data?.some((t: any) => t.slug === "e2e-trainer-1"));

  /* ── 7. The gym sees progress, never the candidates ── */
  console.log("\n5. The gym sees progress, never the candidates");
  const midDash = await call(`/gyms/${gym.slug}/dashboard`, {}, gymToken);
  check("gym sees 1 trainer in review", midDash.json?.data?.stats?.trainersInReview === 1,
    String(midDash.json?.data?.stats?.trainersInReview));
  check("no shared count is published", midDash.json?.data?.stats?.trainersShared === undefined);

  const gone = await call(`/gyms/${gym.slug}/recommendations`, {}, gymToken);
  check("the recommendations endpoint is gone", gone.status === 404, `${gone.status}`);
  const goneInterest = await call(`/gyms/recommendations/${rowId}/interest`,
    { method: "PUT", body: { interest: "interested" } }, gymToken);
  check("so is the interest endpoint", goneInterest.status === 404, `${goneInterest.status}`);

  const ownerList = await call(`/jobs/gym/slug/${gym.slug}`, {}, gymToken);
  check("the vacancy list carries only the review count",
    ownerList.json?.data?.[0]?.candidatesInReview === 1,
    String(ownerList.json?.data?.[0]?.candidatesInReview));
  check("and no shared count", ownerList.json?.data?.[0]?.candidatesShared === undefined);

  /* ── 8. Admin contacts, then shares ── */
  console.log("\n6. Admin contacts, then shares");
  const contacted = await call(`/admin/hiring/shortlist/${rowId}`,
    { method: "PATCH", body: { status: "contacted" } }, adminToken);
  check("marked contacted", contacted.json?.data?.status === "contacted");
  check("contactedAt recorded", !!contacted.json?.data?.contactedAt);

  const shared = await call(`/admin/hiring/shortlist/${rowId}`,
    { method: "PATCH", body: { status: "shared" } }, adminToken);
  check("marked shared", shared.json?.data?.status === "shared");
  check("sharedAt recorded", !!shared.json?.data?.sharedAt);

  const afterShare = await call(`/admin/hiring/vacancies/${jobId}`, {}, adminToken);
  check("vacancy moved to 'gym_contacted'",
    afterShare.json?.data?.vacancy?.pipelineStatus === "gym_contacted",
    afterShare.json?.data?.vacancy?.pipelineStatus);

  /* ── 9. The trainer's details never reach the gym ── */
  console.log("\n7. The trainer's details never reach the gym");
  const gymViewOfJob = JSON.stringify((await call(`/jobs/${jobId}`, {}, gymToken)).json);
  check("no trainer phone in the gym's view", !gymViewOfJob.includes("9000000101"), "phone leaked");
  check("no trainer email either", !gymViewOfJob.toLowerCase().includes("trainer1@e2e.local"), "email leaked");
  check("and no internal notes", !gymViewOfJob.includes("adminNotes"), "adminNotes leaked");

  /* ── 10. Hiring closes the role ── */
  console.log("\n8. Hiring closes the role");
  const hired = await call(`/admin/hiring/shortlist/${rowId}`, { method: "PATCH", body: { status: "hired" } }, adminToken);
  check("marked hired", hired.json?.data?.status === "hired");
  const closed = await call(`/admin/hiring/vacancies/${jobId}`, {}, adminToken);
  check("vacancy is filled", closed.json?.data?.vacancy?.pipelineStatus === "filled");
  check("and no longer open", closed.json?.data?.vacancy?.status === "closed");
  check("gym-facing status reads 'filled'", closed.json?.data?.vacancy?.gymStatus === "filled", closed.json?.data?.vacancy?.gymStatus);

  const trainerJobs = await call("/jobs", {}, verified.token);
  check("a filled role drops out of trainer opportunities", !trainerJobs.json?.data?.some((j: any) => String(j._id) === String(jobId)));

  /* ── 11. Trainers can no longer apply ── */
  console.log("\n9. Trainers no longer apply");
  const apply = await call("/applications", { method: "POST", body: { jobId } }, verified.token);
  check("apply endpoint is closed", apply.status === 403, `${apply.status}`);
  check("and explains why", /FitWorks/i.test(apply.json?.title || "") && /our team/i.test(apply.json?.message || ""), `${apply.json?.title} / ${apply.json?.message}`);

  const pendingJobs = await call("/jobs", {}, pending.token);
  check("an unverified trainer still sees nothing", pendingJobs.status === 403 && pendingJobs.json?.locked === true, `${pendingJobs.status}`);

  /* ── 12. Gym membership: Razorpay ── */
  console.log("\n10. Gym membership (Razorpay)");

  // Every webhook below is signed with the scratch secret and handled entirely
  // by our own code — nothing in this file reaches Razorpay's API.
  const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET as string;
  const sendWebhook = async (body: any) => {
    const raw = JSON.stringify(body);
    const signature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
    const res = await fetch(`${BASE}/payments/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-razorpay-signature": signature },
      body: raw,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  /**
   * A captured payment shaped exactly as Razorpay sends one back, including the
   * notes createGymOrder writes. `quoted` defaults to the amount paid; pass it
   * separately to simulate someone paying less than we asked for.
   */
  const capture = (over: any = {}) => {
    const amount = over.amount ?? 99900;
    return {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: over.id || `pay_e2e_${Date.now()}`,
            order_id: over.order_id || "order_e2e_1",
            amount,
            notes: {
              kind: "gym_membership",
              gymId: String(gym._id),
              gymSlug: gym.slug,
              plan: over.plan || "annual",
              amountPaise: String(over.quoted ?? amount),
            },
          },
        },
      },
    };
  };

  const membership = async () => (await call(`/gyms/${gym.slug}/membership`, {}, gymToken)).json;

  // Start from the launch prices however the previous run left them. Going
  // through the endpoint is what clears the server's price cache.
  await call("/admin/settings", { method: "PUT", body: { gymPlanPrices: { monthly: 199, quarterly: 499, annual: 999 } } }, adminToken);

  const before = await membership();
  check("membership starts inactive", before?.subscription?.isActive === false);
  check("plan catalogue returned", before?.plans?.length === 3, String(before?.plans?.length));
  check("no payments yet", before?.history?.length === 0);

  /* An unsigned webhook must be refused outright. */
  const unsigned = await fetch(`${BASE}/payments/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(capture()),
  });
  check("unsigned webhook refused", unsigned.status === 400, `${unsigned.status}`);

  const forged = await fetch(`${BASE}/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": "deadbeef".repeat(8) },
    body: JSON.stringify(capture()),
  });
  check("forged signature refused", forged.status === 400, `${forged.status}`);

  /* An underpaid order must not buy a term. */
  const underpaid = await sendWebhook(
    capture({ id: "pay_e2e_under", order_id: "order_e2e_under", amount: 19900, quoted: 99900, plan: "annual" })
  );
  check("underpaid webhook accepted but ignored", underpaid.status === 200);
  const afterUnderpaid = await membership();
  check("underpayment grants nothing", afterUnderpaid?.subscription?.isActive === false);

  /* The real thing. */
  const paid = await sendWebhook(capture({ id: "pay_e2e_annual", order_id: "order_e2e_annual", amount: 99900, plan: "annual" }));
  check("captured payment accepted", paid.status === 200);
  const afterPaid = await membership();
  check("membership is active", afterPaid?.subscription?.isActive === true, JSON.stringify(afterPaid?.subscription));
  check("on the annual plan", afterPaid?.subscription?.plan === "annual");
  const firstDays = afterPaid?.subscription?.daysLeft;
  check("a year of cover", firstDays > 300 && firstDays <= 366, `daysLeft=${firstDays}`);
  check("receipt recorded", afterPaid?.history?.length === 1, String(afterPaid?.history?.length));
  check("receipt shows ₹999", afterPaid?.history?.[0]?.amount === 999, String(afterPaid?.history?.[0]?.amount));
  const firstStarted = afterPaid?.subscription?.startedAt;

  /* Razorpay retries. The same payment must not buy a second year. */
  const replay = await sendWebhook(capture({ id: "pay_e2e_annual", order_id: "order_e2e_annual", amount: 99900, plan: "annual" }));
  check("replayed webhook accepted", replay.status === 200);
  const afterReplay = await membership();
  check("replay buys nothing extra", afterReplay?.subscription?.daysLeft === firstDays, `${afterReplay?.subscription?.daysLeft} vs ${firstDays}`);
  check("and adds no second receipt", afterReplay?.history?.length === 1);

  /* Renewing early keeps the days already paid for. */
  const renew = await sendWebhook(capture({ id: "pay_e2e_monthly", order_id: "order_e2e_monthly", amount: 19900, plan: "monthly" }));
  check("renewal accepted", renew.status === 200);
  const afterRenew = await membership();
  check("renewal extends rather than resets", afterRenew?.subscription?.daysLeft > firstDays, `${afterRenew?.subscription?.daysLeft} vs ${firstDays}`);
  check("member-since is unchanged", afterRenew?.subscription?.startedAt === firstStarted);
  check("two receipts now", afterRenew?.history?.length === 2, String(afterRenew?.history?.length));

  /* Checkout guards. */
  const badPlan = await call(`/gyms/${gym.slug}/membership/order`, { method: "POST", body: { plan: "lifetime" } }, gymToken);
  check("an unknown plan is refused", badPlan.status === 400, `${badPlan.status}`);

  const strangerOrder = await call(`/gyms/${gym.slug}/membership/order`, { method: "POST", body: { plan: "monthly" } }, otherToken);
  check("another gym can't raise an order here", strangerOrder.status === 403, `${strangerOrder.status}`);

  const trainerOrder = await call(`/gyms/${gym.slug}/membership/order`, { method: "POST", body: { plan: "monthly" } }, verified.token);
  check("a trainer can't either", trainerOrder.status === 403, `${trainerOrder.status}`);

  /* Verification refuses anything it did not raise. */
  const forgedVerify = await call(`/gyms/${gym.slug}/membership/verify`, {
    method: "POST",
    body: { razorpay_order_id: "order_fake", razorpay_payment_id: "pay_fake", razorpay_signature: "nope" },
  }, gymToken);
  check("a forged signature is refused", forgedVerify.status === 400, `${forgedVerify.status}`);

  const wellSigned = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET as string)
    .update("order_not_ours|pay_not_ours").digest("hex");
  const strayOrder = await call(`/gyms/${gym.slug}/membership/verify`, {
    method: "POST",
    body: { razorpay_order_id: "order_not_ours", razorpay_payment_id: "pay_not_ours", razorpay_signature: wellSigned },
  }, gymToken);
  check("a correctly signed but unknown order is refused", strayOrder.status === 400, `${strayOrder.status}`);

  const strangerMembership = await call(`/gyms/${gym.slug}/membership`, {}, otherToken);
  check("another gym can't read the membership", strangerMembership.status === 403, `${strangerMembership.status}`);

  /* Admin override still works, and takes no money. */
  const override = await call(`/admin/gyms/${gym._id}/subscription`, { method: "PUT", body: { plan: "monthly" } }, adminToken);
  check("admin can grant a term", override.status === 200 && override.json?.subscription?.isActive === true);
  const afterOverride = await membership();
  check("a granted term writes no receipt", afterOverride?.history?.length === 2, String(afterOverride?.history?.length));

  const deactivated = await call(`/admin/gyms/${gym._id}/subscription`, { method: "PUT", body: { action: "deactivate" } }, adminToken);
  check("admin can deactivate", deactivated.json?.subscription?.isActive === false);

  const gymSelfActivate = await call(`/admin/gyms/${gym._id}/subscription`, { method: "PUT", body: { plan: "annual" } }, gymToken);
  check("a gym can't grant itself a plan", gymSelfActivate.status === 403, `${gymSelfActivate.status}`);

  // Put it back so the dashboard assertions below see a live membership.
  await call(`/admin/gyms/${gym._id}/subscription`, { method: "PUT", body: { plan: "annual" } }, adminToken);

  const finalDash = await call(`/gyms/${gym.slug}/dashboard`, {}, gymToken);
  check("dashboard shows the active plan", finalDash.json?.data?.subscription?.isActive === true);
  check("and the filled role", finalDash.json?.data?.stats?.filled === 1, String(finalDash.json?.data?.stats?.filled));
  check("with no active vacancies left", finalDash.json?.data?.stats?.activeVacancies === 0, String(finalDash.json?.data?.stats?.activeVacancies));

  /* ── 12b. Admin-configurable prices ── */
  console.log("\n10b. Prices are set in Settings");

  const setPrices = (body: any, token = adminToken) =>
    call("/admin/settings", { method: "PUT", body }, token);

  const plansNow = async () => (await call("/gyms/plans")).json?.data || [];

  // Production's settings document predates prices; it must still work.
  await SystemSetting.deleteMany({});
  await SystemSetting.collection.insertOne({ otpEnabled: true, createdAt: new Date(), updatedAt: new Date() } as any);
  // Reading through the endpoint refreshes the cache from that document.
  await call("/admin/settings", { method: "PUT", body: { otpEnabled: true } }, adminToken);
  const legacyRead = await call("/admin/settings", {}, adminToken);
  check("a settings doc with no prices still loads", legacyRead.status === 200);
  check("and reads as the launch prices",
    legacyRead.json?.plans?.find((p: any) => p.id === "annual")?.price === 999,
    String(legacyRead.json?.plans?.find((p: any) => p.id === "annual")?.price));

  const defaults = await plansNow();
  check("default prices served", defaults.find((p: any) => p.id === "annual")?.price === 999,
    JSON.stringify(defaults.map((p: any) => p.price)));

  const raised = await setPrices({ gymPlanPrices: { monthly: 299, quarterly: 799, annual: 1499 } });
  check("admin can change prices", raised.status === 200, JSON.stringify(raised.json).slice(0, 140));

  const after = await plansNow();
  check("new prices are served at once", after.find((p: any) => p.id === "annual")?.price === 1499,
    JSON.stringify(after.map((p: any) => p.price)));
  check("per-month is recomputed", after.find((p: any) => p.id === "annual")?.perMonth === 125,
    String(after.find((p: any) => p.id === "annual")?.perMonth));
  check("savings recomputed against the new monthly rate",
    after.find((p: any) => p.id === "annual")?.savingsPercent === 58,
    String(after.find((p: any) => p.id === "annual")?.savingsPercent));

  const membershipPlans = (await call(`/gyms/${gym.slug}/membership`, {}, gymToken)).json?.plans;
  check("the gym's own screen shows them too",
    membershipPlans?.find((p: any) => p.id === "monthly")?.price === 299,
    String(membershipPlans?.find((p: any) => p.id === "monthly")?.price));

  /* Guards. */
  const negative = await setPrices({ gymPlanPrices: { monthly: -5 } });
  check("a negative price is refused", negative.status === 400, `${negative.status}`);
  const fractional = await setPrices({ gymPlanPrices: { monthly: 199.5 } });
  check("a fractional price is refused", fractional.status === 400, `${fractional.status}`);
  const absurd = await setPrices({ gymPlanPrices: { monthly: 9999999 } });
  check("an absurd price is refused", absurd.status === 400, `${absurd.status}`);
  const inverted = await setPrices({ gymPlanPrices: { monthly: 999, quarterly: 499, annual: 1499 } });
  check("a longer term costing less is refused", inverted.status === 400, `${inverted.status}`);

  const stillRight = await plansNow();
  check("a refused edit changes nothing", stillRight.find((p: any) => p.id === "monthly")?.price === 299,
    String(stillRight.find((p: any) => p.id === "monthly")?.price));

  const gymEdit = await setPrices({ gymPlanPrices: { monthly: 1 } }, gymToken);
  check("a gym can't set prices", gymEdit.status === 403, `${gymEdit.status}`);
  const trainerEdit = await setPrices({ gymPlanPrices: { monthly: 1 } }, verified.token);
  check("a trainer can't either", trainerEdit.status === 403, `${trainerEdit.status}`);

  /* A price change must not invalidate a payment already quoted. */
  const quotedAtOldPrice = await sendWebhook({
    event: "payment.captured",
    payload: { payment: { entity: {
      id: "pay_e2e_quoted", order_id: "order_e2e_quoted", amount: 149900,
      notes: { kind: "gym_membership", gymId: String(gym._id), plan: "annual", amountPaise: "149900" },
    } } },
  });
  check("a payment matching its quote is honoured", quotedAtOldPrice.status === 200);
  const honoured = (await call(`/gyms/${gym.slug}/membership`, {}, gymToken)).json;
  check("and the term is written", honoured?.history?.some((h: any) => h.paymentId === "pay_e2e_quoted"));
  check("at the amount actually charged",
    honoured?.history?.find((h: any) => h.paymentId === "pay_e2e_quoted")?.amount === 1499,
    String(honoured?.history?.find((h: any) => h.paymentId === "pay_e2e_quoted")?.amount));

  // Raise the price, then replay a payment quoted at the old one.
  await setPrices({ gymPlanPrices: { monthly: 399, quarterly: 999, annual: 1999 } });
  const stale = await sendWebhook({
    event: "payment.captured",
    payload: { payment: { entity: {
      id: "pay_e2e_stale", order_id: "order_e2e_stale", amount: 149900,
      notes: { kind: "gym_membership", gymId: String(gym._id), plan: "annual", amountPaise: "149900" },
    } } },
  });
  check("a mid-flight quote survives a price rise", stale.status === 200);
  const afterStale = (await call(`/gyms/${gym.slug}/membership`, {}, gymToken)).json;
  check("and still buys its term",
    afterStale?.history?.some((h: any) => h.paymentId === "pay_e2e_stale"),
    "payment quoted before the rise was rejected");

  // But a payment below its own quote is still an underpay.
  const short = await sendWebhook({
    event: "payment.captured",
    payload: { payment: { entity: {
      id: "pay_e2e_short", order_id: "order_e2e_short", amount: 10000,
      notes: { kind: "gym_membership", gymId: String(gym._id), plan: "annual", amountPaise: "199900" },
    } } },
  });
  check("paying under the quote still fails", short.status === 200);
  const afterShort = (await call(`/gyms/${gym.slug}/membership`, {}, gymToken)).json;
  check("and buys nothing", !afterShort?.history?.some((h: any) => h.paymentId === "pay_e2e_short"));

  await call("/admin/settings", { method: "PUT", body: { gymPlanPrices: { monthly: 199, quarterly: 499, annual: 999 } } }, adminToken);

  /* ── 13. Counts stay private ── */
  console.log("\n11. Candidate counts stay private");
  const anon = await call(`/jobs/gym/slug/${gym.slug}`);
  check("anonymous list has no candidate counts", anon.json?.data?.[0]?.candidatesInReview === undefined);
  const owner = await call(`/jobs/gym/slug/${gym.slug}`, {}, gymToken);
  check("the owner's list does", owner.json?.data?.[0]?.candidatesInReview !== undefined,
    JSON.stringify(owner.json?.data?.[0]?.candidatesInReview));
  const anonDetail = await call(`/jobs/${jobId}`);
  check("anonymous detail has no counts", anonDetail.json?.data?.candidatesInReview === undefined);
  check("anonymous detail has no internal notes", anonDetail.json?.data?.adminNotes === undefined);

  const anonGym = await call(`/gyms/${gym.slug}`);
  check("anonymous gym profile hides the plan", anonGym.json?.subscription === undefined);
  const ownGym = await call(`/gyms/${gym.slug}`, {}, gymToken);
  check("the owner's does not", ownGym.json?.subscription?.isActive === true);

  /* ── Clean up ── */
  await Job.deleteMany({ gymId: gym._id });
  await Application.deleteMany({ gymId: gym._id });
  await Gym.deleteMany({ slug: /^e2e-/ });
  await Trainer.deleteMany({ slug: /^e2e-/ });
  await User.deleteMany({ email: /@e2e\.local$/ });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
