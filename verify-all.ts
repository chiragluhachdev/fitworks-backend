import dotenv from "dotenv";
dotenv.config();

const API_BASE = "http://localhost:5001/api";

async function runComprehensiveVerification() {
  console.log("=================================================");
  console.log("   FITWORKS COMPREHENSIVE E2E & ADMIN AUDIT      ");
  console.log("=================================================\n");

  let testPassed = 0;
  let testTotal = 0;

  function assert(condition: boolean, msg: string) {
    testTotal++;
    if (condition) {
      testPassed++;
      console.log(`✅ [PASS] ${msg}`);
    } else {
      console.error(`❌ [FAIL] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  // 1. Check Public Endpoints
  console.log("--- 1. Testing Public Endpoints ---");
  const trainersRes = await fetch(`${API_BASE}/trainers`);
  const trainersData = await trainersRes.json();
  assert(trainersRes.ok && trainersData.success, "Public GET /api/trainers returns list");

  // 2. Admin Authentication
  console.log("\n--- 2. Testing Admin Security & Login ---");
  const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@fitworks.com", password: "admin@2026" }),
  });
  const adminLoginData = await adminLoginRes.json();
  assert(adminLoginRes.ok && adminLoginData.user?.role === "admin", "Admin Login succeeds with role: admin");
  const adminToken = adminLoginData.token;

  // Test Invalid Admin Password
  const badAdminRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@fitworks.com", password: "wrongpassword" }),
  });
  assert(badAdminRes.status === 401, "Bad admin password rejected with 401");

  // 3. Admin Dashboard & Directory Endpoints
  console.log("\n--- 3. Testing Admin Dashboard & Directories ---");
  const statsRes = await fetch(`${API_BASE}/admin/stats`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const statsData = await statsRes.json();
  assert(statsRes.ok && typeof statsData.stats.totalGyms === "number", "Admin GET /api/admin/stats returns aggregate metrics");
  console.log(`   📊 Live Stats: ${statsData.stats.totalGyms} Gyms, ${statsData.stats.totalTrainers} Trainers, ${statsData.stats.totalVacancies} Vacancies, ${statsData.stats.totalApplications} Applications`);

  const adminUsersRes = await fetch(`${API_BASE}/admin/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminUsersData = await adminUsersRes.json();
  assert(adminUsersRes.ok && Array.isArray(adminUsersData.data), "Admin GET /api/admin/users returns list");

  const adminTrainersRes = await fetch(`${API_BASE}/admin/trainers`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminTrainersData = await adminTrainersRes.json();
  assert(adminTrainersRes.ok && Array.isArray(adminTrainersData.data), "Admin GET /api/admin/trainers returns list");

  const adminGymsRes = await fetch(`${API_BASE}/admin/gyms`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminGymsData = await adminGymsRes.json();
  assert(adminGymsRes.ok && Array.isArray(adminGymsData.data), "Admin GET /api/admin/gyms returns list");

  const adminVacanciesRes = await fetch(`${API_BASE}/admin/vacancies`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminVacanciesData = await adminVacanciesRes.json();
  assert(adminVacanciesRes.ok && Array.isArray(adminVacanciesData.data), "Admin GET /api/admin/vacancies returns list");

  const adminAppsRes = await fetch(`${API_BASE}/admin/applications`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminAppsData = await adminAppsRes.json();
  assert(adminAppsRes.ok && Array.isArray(adminAppsData.data), "Admin GET /api/admin/applications returns list");

  const adminConnsRes = await fetch(`${API_BASE}/admin/connections`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminConnsData = await adminConnsRes.json();
  assert(adminConnsRes.ok && Array.isArray(adminConnsData.data), "Admin GET /api/admin/connections returns list");

  // 4. Admin Verification Toggle Action
  console.log("\n--- 4. Testing Admin Verification Workflow ---");
  const testTrainerId = adminTrainersData.data[0]._id;
  const verifyRes = await fetch(`${API_BASE}/admin/trainers/${testTrainerId}/verify`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ status: "verified" }),
  });
  const verifyData = await verifyRes.json();
  assert(verifyRes.ok && verifyData.data.verificationStatus === "verified", "Admin approves trainer verification status");

  // 5. Gym Flow Verification
  console.log("\n--- 5. Testing Gym Account Flows ---");
  const gymLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "raj@powerfit.com", password: "password123" }),
  });
  const gymLoginData = await gymLoginRes.json();
  assert(gymLoginRes.ok && gymLoginData.user?.role === "gym", "Gym login succeeds");
  const gymToken = gymLoginData.token;
  const gymSlug = gymLoginData.user.slug;

  const gymDashRes = await fetch(`${API_BASE}/gyms/${gymSlug}/dashboard`, {
    headers: { Authorization: `Bearer ${gymToken}` },
  });
  const gymDashData = await gymDashRes.json();
  assert(gymDashRes.ok && typeof gymDashData.data?.stats?.activeVacancies === "number", "Gym dashboard stats fetched");

  // 6. Trainer Flow Verification
  console.log("\n--- 6. Testing Trainer Account Flows ---");
  const trainerLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "rahul@trainer.com", password: "password123" }),
  });
  const trainerLoginData = await trainerLoginRes.json();
  assert(trainerLoginRes.ok && trainerLoginData.user?.role === "trainer", "Trainer login succeeds");
  const trainerToken = trainerLoginData.token;
  const trainerSlug = trainerLoginData.user.slug;

  const trainerDashRes = await fetch(`${API_BASE}/trainers/${trainerSlug}/dashboard`, {
    headers: { Authorization: `Bearer ${trainerToken}` },
  });
  const trainerDashData = await trainerDashRes.json();
  assert(trainerDashRes.ok && typeof trainerDashData.data?.stats?.activeApplications === "number", "Trainer dashboard stats fetched");

  // 7. Security: Role Barrier Checks
  console.log("\n--- 7. Testing Security & Authorization Barriers ---");
  const gymToAdminRes = await fetch(`${API_BASE}/admin/stats`, {
    headers: { Authorization: `Bearer ${gymToken}` },
  });
  assert(gymToAdminRes.status === 403, "Gym token blocked from /api/admin/* with 403 Forbidden");

  const trainerToAdminRes = await fetch(`${API_BASE}/admin/stats`, {
    headers: { Authorization: `Bearer ${trainerToken}` },
  });
  assert(trainerToAdminRes.status === 403, "Trainer token blocked from /api/admin/* with 403 Forbidden");

  const anonToAdminRes = await fetch(`${API_BASE}/admin/stats`);
  assert(anonToAdminRes.status === 401, "Unauthenticated request blocked with 401 Unauthorized");

  console.log("\n=================================================");
  console.log(`   🎉 ALL ${testPassed}/${testTotal} VERIFICATION CHECKS PASSED!   `);
  console.log("=================================================");
}

runComprehensiveVerification().catch((err) => {
  console.error("Verification failed with error:", err);
  process.exit(1);
});
