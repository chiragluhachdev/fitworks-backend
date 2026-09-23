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
import dotenv from "dotenv";
import { User } from "./src/models/User";
import { Gym } from "./src/models/Gym";
import { Trainer } from "./src/models/Trainer";
import { Job } from "./src/models/Job";
import { Application } from "./src/models/Application";

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

  /* ── 7. Nothing reaches the gym before it's shared ── */
  console.log("\n5. Nothing reaches the gym before it is shared");
  const early = await call(`/gyms/${gym.slug}/recommendations`, {}, gymToken);
  check("recommendations still empty", early.json?.data?.length === 0, `${early.json?.data?.length}`);
  const midDash = await call(`/gyms/${gym.slug}/dashboard`, {}, gymToken);
  check("gym sees 1 trainer in review", midDash.json?.data?.stats?.trainersInReview === 1, String(midDash.json?.data?.stats?.trainersInReview));
  check("gym sees 0 shared", midDash.json?.data?.stats?.trainersShared === 0);

  const earlyInterest = await call(`/gyms/recommendations/${rowId}/interest`, { method: "PUT", body: { interest: "interested" } }, gymToken);
  check("gym can't respond to an unshared trainer", earlyInterest.status === 403, `${earlyInterest.status}`);

  /* ── 8. Admin contacts and shares ── */
  console.log("\n6. Admin contacts, then shares");
  const contacted = await call(`/admin/hiring/shortlist/${rowId}`, { method: "PATCH", body: { status: "contacted" } }, adminToken);
  check("marked contacted", contacted.json?.data?.status === "contacted");
  check("contactedAt recorded", !!contacted.json?.data?.contactedAt);

  const shared = await call(`/admin/hiring/shortlist/${rowId}`, { method: "PATCH", body: { status: "shared" } }, adminToken);
  check("marked shared", shared.json?.data?.status === "shared");
  check("sharedAt recorded", !!shared.json?.data?.sharedAt);

  const afterShare = await call(`/admin/hiring/vacancies/${jobId}`, {}, adminToken);
  check("vacancy moved to 'gym_contacted'", afterShare.json?.data?.vacancy?.pipelineStatus === "gym_contacted", afterShare.json?.data?.vacancy?.pipelineStatus);

  /* ── 9. Gym now sees it, without contact details ── */
  console.log("\n7. Gym sees the recommendation");
  const recs = await call(`/gyms/${gym.slug}/recommendations`, {}, gymToken);
  check("one recommendation returned", recs.json?.data?.length === 1, `${recs.json?.data?.length}`);
  const rec = recs.json?.data?.[0];
  check("trainer name present", rec?.trainer?.fullName === "E2E Trainer 1");
  check("phone NOT exposed", !JSON.stringify(rec).includes("9000000101"), "phone leaked to gym");
  check("email NOT exposed", !JSON.stringify(rec).toLowerCase().includes("trainer1@e2e.local"), "email leaked to gym");
  check("internal notes NOT exposed", !("adminNotes" in (rec || {})), "adminNotes leaked");

  const interest = await call(`/gyms/recommendations/${rowId}/interest`, { method: "PUT", body: { interest: "contact_requested" } }, gymToken);
  check("gym can request contact", interest.status === 200 && interest.json?.data?.gymInterest === "contact_requested");

  const otherInterest = await call(`/gyms/recommendations/${rowId}/interest`, { method: "PUT", body: { interest: "interested" } }, otherToken);
  check("another gym can't answer for this one", otherInterest.status === 403, `${otherInterest.status}`);

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

  /* ── 12. Gym membership ── */
  console.log("\n10. Gym membership");
  const request = await call(`/gyms/${gym.slug}/plan-request`, { method: "POST", body: { plan: "annual" } }, gymToken);
  check("gym can request a plan", request.status === 200 && request.json?.subscription?.requestedPlan === "annual");
  const badPlan = await call(`/gyms/${gym.slug}/plan-request`, { method: "POST", body: { plan: "lifetime" } }, gymToken);
  check("an unknown plan is refused", badPlan.status === 400, `${badPlan.status}`);

  const activate = await call(`/admin/gyms/${gym._id}/subscription`, { method: "PUT", body: { plan: "annual" } }, adminToken);
  check("admin activates it", activate.status === 200 && activate.json?.subscription?.isActive === true, JSON.stringify(activate.json?.subscription));
  const days = activate.json?.subscription?.daysLeft;
  check("expiry is a year out", days > 300 && days <= 366, `daysLeft=${days}`);
  check("request cleared once activated", !activate.json?.subscription?.requestedPlan);

  const gymSelfActivate = await call(`/admin/gyms/${gym._id}/subscription`, { method: "PUT", body: { plan: "annual" } }, gymToken);
  check("a gym can't activate its own plan", gymSelfActivate.status === 403, `${gymSelfActivate.status}`);

  const finalDash = await call(`/gyms/${gym.slug}/dashboard`, {}, gymToken);
  check("dashboard shows the active plan", finalDash.json?.data?.subscription?.isActive === true);
  check("and the filled role", finalDash.json?.data?.stats?.filled === 1, String(finalDash.json?.data?.stats?.filled));
  check("with no active vacancies left", finalDash.json?.data?.stats?.activeVacancies === 0, String(finalDash.json?.data?.stats?.activeVacancies));

  /* ── 13. Counts stay private ── */
  console.log("\n11. Candidate counts stay private");
  const anon = await call(`/jobs/gym/slug/${gym.slug}`);
  check("anonymous list has no candidate counts", anon.json?.data?.[0]?.candidatesInReview === undefined);
  const owner = await call(`/jobs/gym/slug/${gym.slug}`, {}, gymToken);
  check("the owner's list does", owner.json?.data?.[0]?.candidatesShared === 1, String(owner.json?.data?.[0]?.candidatesShared));
  const anonDetail = await call(`/jobs/${jobId}`);
  check("anonymous detail has no counts", anonDetail.json?.data?.candidatesShared === undefined);
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
