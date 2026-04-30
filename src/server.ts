// src/server.ts
import express from "express";
import cors from "cors";
import profileRoutes from "./routes/profileRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { healthCheck, rootEndpoint } from "./controllers/healthController.js";
import { db } from "./services/database.js";
import helmet from "helmet";
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT;

app.set("trust proxy", 1);
app.use(helmet());
app.use(cookieParser());
app.use(express.json());

// CORS configuration using the cors package
const allowedOrigins = new Set(
  [
    process.env.WEB_PORTAL_URL,
    `http://localhost:${process.env.CLI_CALLBACK_PORT}`,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:5173",
  ].filter(Boolean),
);

app.use(
  cors({
    origin: (origin, callback) => {
      const isPreviewOrigin =
        typeof origin === "string" &&
        /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

      if (!origin || allowedOrigins.has(origin) || isPreviewOrigin) {
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
app.use("/api/users", userRoutes);
app.get("/health", healthCheck);
app.get("/", rootEndpoint);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Database contains ${db.getProfileCount()} profiles`);
});
