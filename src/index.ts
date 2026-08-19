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

import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 5001;

// Connect to MongoDB
connectDB();

// Security Middlewares
app.use(helmet());
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Increased limit for dev/testing
  message: "Too many requests from this IP, please try again after 15 minutes",
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
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/gyms", gymRoutes);
app.use("/api/trainers", trainerRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/connections", connectionRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("FitWorks API is running");
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
