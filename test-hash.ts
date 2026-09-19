import crypto from "crypto";
const code = "5974";
const JWT_SECRET = "supersecretfitworkskey2026";
const hash = crypto.createHash("sha256").update(`${code}:${JWT_SECRET}`).digest("hex");
console.log("Hash of 5974:", hash);
