import crypto from "crypto";
const JWT_SECRET = "supersecretfitworkskey2026";
const targetHash = "f5440f886e2fbcacae59234468a9d9aa4702e193be26154811de30df7ff6a5fe";
let found = null;
for (let i = 0; i < 1000000; i++) {
  const code = String(i).padStart(4, "0");
  const hash = crypto.createHash("sha256").update(`${code}:${JWT_SECRET}`).digest("hex");
  if (hash === targetHash) {
    found = code;
    break;
  }
}
console.log("Found code:", found);
