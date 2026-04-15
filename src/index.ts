import express from "express";
import dotenv from "dotenv";
import profileRoutes from "./routes/profile.routes";
import { corsMiddleware } from "./middleware/cors.middleware";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { initializeDatabase, closeDatabase } from "./db/database";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Profile Intelligence Service is running",
  });
});

// API Routes
app.use("/api", profileRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();
    console.log("✅ Database initialized successfully");

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 API available at http://localhost:${PORT}/api`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log("\n🛑 Shutting down server...");
      server.close(async () => {
        await closeDatabase();
        console.log("✅ Database connection closed");
        process.exit(0);
      });
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

export default app;
