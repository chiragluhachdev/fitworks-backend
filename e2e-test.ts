/* eslint-disable */
// @ts-nocheck
import dotenv from "dotenv";
dotenv.config();

const API = "http://localhost:5001/api";

async function runE2ETest() {
  console.log("=================================================");
  console.log("   STARTING FITWORKS REAL-USER E2E TEST SUITE   ");
  console.log("=================================================\n");

  let testGymToken = "";
  let testGymSlug = "";
  let testGymId = "";
  let testTrainerToken = "";
  let testTrainerSlug = "";
  let testTrainerId = "";
  let createdJobId = "";
  let connectionId = "";
  let applicationId = "";

  const gymEmail = `apex-${Date.now()}@gymtest.com`;
  const trainerEmail = `rohit-${Date.now()}@trainertest.com`;

  // STEP 1: Register New Gym
  console.log("➡️ [STEP 1] Registering New Gym:", gymEmail);
  const regGymRes = await fetch(`${API}/auth/register/gym`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: gymEmail,
      password: "password123",
      gymName: "Apex Fitness Club",
      gymDescription: "High end strength and conditioning gym.",
      address: {
        street: "Park Street",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
      },
      numberOfLocations: 2,
      hiringInformation: {
        trainersRequired: 2,
        trainerTypes: ["Strength", "CrossFit"],
        preferredExperience: "2-4 Years",
        salaryBudget: "40,000 - 55,000",
        hiringFrequency: "Immediate",
      },
      contactPerson: {
        name: "Siddharth Rao",
        designation: "Managing Director",
        phone: "+91 91234 56789",
      },
    }),
  });
  const regGymData = await regGymRes.json();
  if (!regGymData.success) throw new Error("Gym registration failed: " + JSON.stringify(regGymData));
  testGymToken = regGymData.token;
  testGymSlug = regGymData.user.slug;
  testGymId = regGymData.user.profileId;
  console.log(`✅ Gym Registered! Slug: ${testGymSlug}, ID: ${testGymId}\n`);

  // STEP 2: Register New Trainer
  console.log("➡️ [STEP 2] Registering New Trainer:", trainerEmail);
  const regTrainerRes = await fetch(`${API}/auth/register/trainer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: trainerEmail,
      password: "password123",
      personal: {
        fullName: "Rohit Verma",
        city: "Mumbai",
        location: "Bandra",
      },
      professional: {
        professionalTitle: "Certified Strength Specialist",
        yearsOfExperience: 4,
        specializations: ["Strength", "CrossFit", "HIIT"],
        skills: ["Olympic Lifting", "Kettlebells"],
        education: "CSCS Certified",
        bio: "Specializing in athletic performance and metabolic conditioning.",
      },
      workPreferences: {
        expectedMonthlySalary: "45,000",
        employmentType: ["Full-time"],
        availability: "Immediate",
        willingToRelocate: true,
      },
      verificationDocuments: ["https://example.com/cscs-cert.pdf"],
    }),
  });
  const regTrainerData = await regTrainerRes.json();
  if (!regTrainerData.success) throw new Error("Trainer registration failed: " + JSON.stringify(regTrainerData));
  testTrainerToken = regTrainerData.token;
  testTrainerSlug = regTrainerData.user.slug;
  testTrainerId = regTrainerData.user.profileId;
  console.log(`✅ Trainer Registered! Slug: ${testTrainerSlug}, ID: ${testTrainerId}\n`);

  // STEP 3: Login as Gym & Send Connection Request
  console.log("➡️ [STEP 3] Gym Login & Sending Invitation to Trainer");
  const gymLoginRes = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: gymEmail, password: "password123" }),
  });
  const gymLoginData = await gymLoginRes.json();
  if (!gymLoginData.success) throw new Error("Gym login failed: " + JSON.stringify(gymLoginData));
  testGymToken = gymLoginData.token;

  const sendConnRes = await fetch(`${API}/connections`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testGymToken}`,
    },
    body: JSON.stringify({
      trainerId: testTrainerId,
      message: "We'd like to interview you for Head Strength Coach position at Apex Fitness Club.",
    }),
  });
  const sendConnData = await sendConnRes.json();
  if (!sendConnData.success) throw new Error("Send connection failed: " + JSON.stringify(sendConnData));
  connectionId = sendConnData.data._id;
  console.log(`✅ Connection invitation sent to Trainer! Connection ID: ${connectionId}\n`);

  // STEP 4: Login as Trainer & Accept Invitation
  console.log("➡️ [STEP 4] Trainer Login & Accepting Invitation");
  const trainerLoginRes = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: trainerEmail, password: "password123" }),
  });
  const trainerLoginData = await trainerLoginRes.json();
  if (!trainerLoginData.success) throw new Error("Trainer login failed: " + JSON.stringify(trainerLoginData));
  testTrainerToken = trainerLoginData.token;

  const acceptConnRes = await fetch(`${API}/connections/${connectionId}/status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testTrainerToken}`,
    },
    body: JSON.stringify({ status: "accepted" }),
  });
  const acceptConnData = await acceptConnRes.json();
  if (!acceptConnData.success || acceptConnData.data.status !== "accepted") {
    throw new Error("Accept connection failed: " + JSON.stringify(acceptConnData));
  }
  console.log(`✅ Trainer accepted gym invitation! Status is now: ${acceptConnData.data.status}\n`);

  // STEP 5: Gym Creates Vacancy
  console.log("➡️ [STEP 5] Gym Posts a New Vacancy");
  const createJobRes = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testGymToken}`,
    },
    body: JSON.stringify({
      gymSlug: testGymSlug,
      gymId: testGymId,
      position: "Head Functional Coach",
      description: "Lead group functional and strength classes across our Mumbai club locations.",
      requirements: {
        experience: "3-5 Years",
        specialization: "Strength",
      },
      salaryRange: "₹45,000 - ₹60,000 / mo",
      employmentType: "Full-time",
      location: "Bandra, Mumbai",
      numberOfOpenings: 1,
    }),
  });
  const createJobData = await createJobRes.json();
  if (!createJobData.success) throw new Error("Job creation failed: " + JSON.stringify(createJobData));
  createdJobId = createJobData.data._id;
  console.log(`✅ Vacancy created! Job ID: ${createdJobId}, Position: ${createJobData.data.position}\n`);

  // STEP 6: Trainer Finds Vacancy & Applies
  console.log("➡️ [STEP 6] Trainer Applies for Vacancy");
  const applyRes = await fetch(`${API}/applications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testTrainerToken}`,
    },
    body: JSON.stringify({
      jobId: createdJobId,
      coverLetter: "Certified CSCS with 4 years coaching experience. Ready for immediate joining!",
    }),
  });
  const applyData = await applyRes.json();
  if (!applyData.success) throw new Error("Apply failed: " + JSON.stringify(applyData));
  applicationId = applyData.data._id;
  console.log(`✅ Application submitted! Application ID: ${applicationId}\n`);

  // STEP 7: Gym Reviews Application -> Shortlist -> Hire
  console.log("➡️ [STEP 7] Gym Reviews Application, Shortlists & Marks Hired");
  const shortlistRes = await fetch(`${API}/applications/${applicationId}/status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testGymToken}`,
    },
    body: JSON.stringify({ status: "shortlisted" }),
  });
  const shortlistData = await shortlistRes.json();
  if (shortlistData.data.status !== "shortlisted") throw new Error("Shortlist failed");
  console.log("   - Application status updated to: SHORTLISTED");

  const hireRes = await fetch(`${API}/applications/${applicationId}/status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testGymToken}`,
    },
    body: JSON.stringify({ status: "hired" }),
  });
  const hireData = await hireRes.json();
  if (hireData.data.status !== "hired") throw new Error("Hire failed");
  console.log("   - Application status updated to: HIRED! 🎉\n");

  // STEP 8: Edit Both Profiles and Confirm Persistence
  console.log("➡️ [STEP 8] Edit Gym and Trainer Profiles & Verify Persistence");
  const updateGymRes = await fetch(`${API}/gyms/${testGymSlug}/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testGymToken}`,
    },
    body: JSON.stringify({
      gymDescription: "Updated: Mumbai's premier elite performance center.",
      website: "https://apexfitness.com",
    }),
  });
  const updateGymData = await updateGymRes.json();
  if (updateGymData.data.website !== "https://apexfitness.com") throw new Error("Gym profile update not persisted");

  const updateTrainerRes = await fetch(`${API}/trainers/${testTrainerSlug}/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testTrainerToken}`,
    },
    body: JSON.stringify({
      personal: { fullName: "Rohit Verma", city: "Mumbai", location: "Juhu" },
      professional: { professionalTitle: "Master Athletic Coach", yearsOfExperience: 5, specializations: ["Strength", "Mobility"], skills: ["Lifting"] },
    }),
  });
  const updateTrainerData = await updateTrainerRes.json();
  if (!updateTrainerData.success) {
    throw new Error("Trainer profile update failed: " + JSON.stringify(updateTrainerData));
  }
  if (updateTrainerData.data?.professional?.professionalTitle !== "Master Athletic Coach") {
    throw new Error("Trainer profile update not persisted: " + JSON.stringify(updateTrainerData));
  }

  console.log("✅ Both Gym and Trainer profile edits successfully persisted in DB!\n");

  // STEP 9: Test Logout & Login Persistence
  console.log("➡️ [STEP 9] Testing Re-Login with Updated Profiles");
  const reloginGym = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: gymEmail, password: "password123" }),
  });
  const reloginGymData = await reloginGym.json();
  if (!reloginGymData.success || reloginGymData.user.slug !== testGymSlug) throw new Error("Gym re-login failed");

  const reloginTrainer = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: trainerEmail, password: "password123" }),
  });
  const reloginTrainerData = await reloginTrainer.json();
  if (!reloginTrainerData.success || reloginTrainerData.user.slug !== testTrainerSlug) throw new Error("Trainer re-login failed");
  console.log("✅ Re-login confirmed for both Gym and Trainer accounts!\n");

  // STEP 10: Role-Based Authorization Enforcement
  console.log("➡️ [STEP 10] Testing Role-Based Authorization Enforcement");
  
  // Trainer trying to create a vacancy (Should fail with 403 Forbidden)
  const unauthorizedJobPost = await fetch(`${API}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testTrainerToken}`,
    },
    body: JSON.stringify({ position: "Hacked Job" }),
  });
  if (unauthorizedJobPost.status !== 403) {
    throw new Error(`Expected 403 Forbidden for Trainer posting job, got ${unauthorizedJobPost.status}`);
  }
  console.log("   - [PASS] Trainer blocked from posting vacancies (403 Forbidden)");

  // Gym trying to apply for a job (Should fail with 403 Forbidden)
  const unauthorizedApply = await fetch(`${API}/applications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testGymToken}`,
    },
    body: JSON.stringify({ jobId: createdJobId, coverLetter: "Gym applying" }),
  });
  if (unauthorizedApply.status !== 403) {
    throw new Error(`Expected 403 Forbidden for Gym applying for job, got ${unauthorizedApply.status}`);
  }
  console.log("   - [PASS] Gym blocked from applying to vacancies (403 Forbidden)");

  console.log("\n=================================================");
  console.log("   🎉 ALL 10 USER SCENARIOS PASSED WITH 100% SUCCESS ");
  console.log("=================================================");
}

runE2ETest().catch((err) => {
  console.error("❌ Test Suite Failed:", err);
  process.exit(1);
});
