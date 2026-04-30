// src/middleware/versioning.ts
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

export function requireApiVersion(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const apiVersion = req.headers["x-api-version"];
  const supportedVersions = new Set([
    env.API_VERSION,
    env.API_VERSION.replace(/\.0$/, ""),
    `${env.API_VERSION}.0`,
  ]);

  if (!apiVersion) {
    return res.status(400).json({
      status: "error",
      message: "API version header required",
    });
  }

  if (typeof apiVersion !== "string" || !supportedVersions.has(apiVersion)) {
    return res.status(400).json({
      status: "error",
      message: `Unsupported API version. Expected one of: ${Array.from(supportedVersions).join(", ")}`,
    });
  }

  next();
}
