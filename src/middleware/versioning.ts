// src/middleware/versioning.ts
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

export function requireApiVersion(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const apiVersion = req.headers["x-api-version"];

  if (!apiVersion) {
    return res.status(400).json({
      status: "error",
      message: "API version header required",
    });
  }

  if (apiVersion !== env.API_VERSION) {
    return res.status(400).json({
      status: "error",
      message: `Unsupported API version. Expected: ${env.API_VERSION}`,
    });
  }

  next();
}
