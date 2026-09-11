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

// 1. CORS Middleware - MUST be the absolute first middleware before all others
const corsOptions: cors.CorsOptions = {
  origin: true, // Allow all origins reflectively (supports credentials across domains like fitworks.in, localhost, etc.)
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Range",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers",
  ],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  optionsSuccessStatus: 200,
  maxAge: 86400,
};

app.use(cors(corsOptions));

// Explicit preflight fallback handler to guarantee CORS headers on every response
app.use((req: Request, res: Response, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, Range, Access-Control-Request-Method, Access-Control-Request-Headers"
  );
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, X-Content-Range");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// 2. Security Middlewares (configured to not interfere with CORS)
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Generous limit so normal use and admin views never 429
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS", // Never rate-limit preflight OPTIONS
  message: { success: false, message: "Too many requests from this IP, please try again after 15 minutes" },
});
app.use("/api", limiter);

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

app.listen(Number(port), "0.0.0.0", () => {
  console.log(`Server is running at http://0.0.0.0:${port}`);
});
