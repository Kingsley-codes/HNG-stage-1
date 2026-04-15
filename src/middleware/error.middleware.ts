import { Request, Response, NextFunction } from "express";

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  console.error("Error:", error.message);
  console.error("Stack:", error.stack);

  // Handle specific error types
  if (error.name === "SyntaxError" && "body" in error) {
    res.status(400).json({
      status: "error",
      message: "Invalid JSON in request body",
    });
    return;
  }

  if (error.name === "ValidationError") {
    res.status(422).json({
      status: "error",
      message: error.message,
    });
    return;
  }

  // Default error response
  res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    status: "error",
    message: "Endpoint not found",
  });
};
