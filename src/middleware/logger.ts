// src/middleware/logger.ts
import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const accessLogStream = fs.createWriteStream(
  path.join(logsDir, `access-${new Date().toISOString().split("T")[0]}.log`),
  { flags: "a" },
);

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  // Log request
  const requestLog = {
    id: requestId,
    type: "request",
    method: req.method,
    endpoint: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    userId: (req as any).user?.user_id || "anonymous",
    timestamp: new Date().toISOString(),
  };

  console.log(`📥 ${JSON.stringify(requestLog)}`);
  accessLogStream.write(JSON.stringify(requestLog) + "\n");

  // Log response after it's sent
  res.on("finish", () => {
    const duration = Date.now() - start;
    const responseLog = {
      id: requestId,
      type: "response",
      method: req.method,
      endpoint: req.path,
      statusCode: res.statusCode,
      responseTime: `${duration}ms`,
      timestamp: new Date().toISOString(),
    };

    const logSymbol = res.statusCode >= 400 ? "❌" : "✅";
    console.log(`${logSymbol} ${JSON.stringify(responseLog)}`);
    accessLogStream.write(JSON.stringify(responseLog) + "\n");
  });

  next();
}

// Error logger
export function logError(error: Error, context?: string) {
  const errorLog = {
    type: "error",
    context: context || "unknown",
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  };

  console.error(`🔥 ${JSON.stringify(errorLog)}`);

  const errorLogStream = fs.createWriteStream(
    path.join(logsDir, `error-${new Date().toISOString().split("T")[0]}.log`),
    { flags: "a" },
  );
  errorLogStream.write(JSON.stringify(errorLog) + "\n");
  errorLogStream.end();
}
