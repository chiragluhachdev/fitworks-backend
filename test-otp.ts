import { generateOtp, hashOtp, OTP_LENGTH } from "./src/config/sms";
import crypto from "crypto";

const code = generateOtp();
console.log("Generated code:", code);
console.log("Length:", OTP_LENGTH);
const hash = hashOtp(code);
console.log("Hash:", hash);

// Verify
const provided = Buffer.from(hashOtp(code), "utf8");
const expected = Buffer.from(hash, "utf8");
const matches = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
console.log("Matches?", matches);
