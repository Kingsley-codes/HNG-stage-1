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
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cookieParser());
app.use(express.json());

// CORS configuration for web portal
app.use((req, res, next) => {
  const allowedOrigins = [
    process.env.WEB_PORTAL_URL || "http://localhost:3000",
  ];
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Version, X-CSRF-Token",
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Routes
app.use("/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.get("/health", healthCheck);
app.get("/", rootEndpoint);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database contains ${db.getProfileCount()} profiles`);
});
