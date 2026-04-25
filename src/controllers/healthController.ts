// src/controllers/healthController.ts
import { Request, Response } from "express";
import { db } from "../services/database.js";

export const healthCheck = (req: Request, res: Response) => {
  res.status(200).json({ status: "ok", profiles: db.getProfileCount() });
};

export const rootEndpoint = (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "Intelligence Query Engine API is running",
    endpoints: [
      "POST /api/profiles",
      "GET /api/profiles/search?q=<natural language query>",
      "GET /api/profiles/:id",
      "GET /api/profiles",
      "DELETE /api/profiles/:id",
    ],
    examples: {
      filters:
        "/api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10",
      naturalLanguage: "/api/profiles/search?q=young males from nigeria",
    },
  });
};
