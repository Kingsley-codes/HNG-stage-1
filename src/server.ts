// src/server.ts
import express from "express";
import cors from "cors";
import profileRoutes from "./routes/profileRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { healthCheck, rootEndpoint } from "./controllers/healthController.js";
import { db } from "./services/database.js";
import helmet from "helmet";
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT;

app.use(helmet());
app.use(cookieParser());
app.use(express.json());

// CORS configuration using the cors package
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        process.env.WEB_PORTAL_URL || "http://localhost:3000",
        `http://localhost:${process.env.CLI_CALLBACK_PORT || 3001}`,
      ];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Version",
      "X-CSRF-Token",
    ],
  }),
);

// Routes
app.use("/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.get("/health", healthCheck);
app.get("/", rootEndpoint);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database contains ${db.getProfileCount()} profiles`);
});
