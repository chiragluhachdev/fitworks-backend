import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/db";
import authRoutes from "./routes/auth.routes";
import trainerRoutes from "./routes/trainer.routes";
import jobRoutes from "./routes/job.routes";
import applicationRoutes from "./routes/application.routes";
import connectionRoutes from "./routes/connection.routes";
import gymRoutes from "./routes/gym.routes";
import adminRoutes from "./routes/admin.routes";
import uploadRoutes from "./routes/upload.routes";
import paymentRoutes from "./routes/payment.routes";
import otpRoutes from "./routes/otp.routes";

import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 5001;

// Connect to MongoDB
connectDB();

// Security Middlewares
app.use(helmet());
// A blunt backstop only. The real abuse controls are per-number (OTP) and
// per-route, so this needs to sit well above what a real person generates.
//
// Ad traffic arrives over mobile carriers that put thousands of subscribers
// behind one CGNAT address, so an entire campaign audience can share a single
// bucket. The old ceiling of 200 was roughly five visitors per IP per window.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  // Must be an object. A bare string is sent as text/html, and every client
  // here parses JSON — a tripped limit then surfaced as "Network error",
  // telling the user nothing and hiding the cause from us.
  message: {
    success: false,
    code: "RATE_LIMITED",
    message: "Too many requests from this network. Please try again in a few minutes.",
  },
  // Preflights aren't user actions; spending budget on them breaks CORS.
  skip: (req) => req.method === "OPTIONS",
});
app.use("/api", limiter);

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Postman)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes("*") ||
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive fallback for deployment convenience
    },
    credentials: true,
  })
);
// Capture the raw body so the Razorpay webhook can verify its HMAC signature,
// which is computed over the exact bytes Razorpay sent.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/gyms", gymRoutes);
app.use("/api/trainers", trainerRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/connections", connectionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/otp", otpRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("FitWorks API is running");
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
