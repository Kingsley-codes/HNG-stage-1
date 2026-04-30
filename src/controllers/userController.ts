import { Response } from "express";
import { AuthRequest } from "../middleware/auth.js";
import { UserService } from "../services/userService.js";

const userService = new UserService();

export const getCurrentUserProfile = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required",
      });
    }

    const user = await userService.getUserById(req.user.user_id);

    if (!user || !user.is_active) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    return res.status(200).json({
      status: "success",
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name || null,
        role: user.role,
        avatar_url: user.avatar_url,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Failed to get user info",
    });
  }
};
