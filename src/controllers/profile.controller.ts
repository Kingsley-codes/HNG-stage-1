import { Request, Response, NextFunction } from "express";
import { ProfileService } from "../services/profile.service";
import { validateName } from "../utils/validators";
import { ProfileFilter } from "../types";

export class ProfileController {
  private profileService: ProfileService;

  constructor(profileService: ProfileService) {
    this.profileService = profileService;
  }

  createProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { name } = req.body;

      // Validate name
      const validation = validateName(name);
      if (!validation.valid) {
        res.status(400).json({
          status: "error",
          message: validation.error,
        });
        return;
      }

      // Check if profile already exists
      const existingProfile = await this.profileService.findByName(name.trim());
      if (existingProfile) {
        res.status(201).json({
          status: "success",
          message: "Profile already exists",
          data: existingProfile,
        });
        return;
      }

      // Create new profile
      const profile = await this.profileService.createProfile(name.trim());

      res.status(201).json({
        status: "success",
        data: profile,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("returned an invalid response")) {
          res.status(502).json({
            status: "502",
            message: error.message,
          });
          return;
        }
      }
      next(error);
    }
  };

  getProfileById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id || typeof id !== "string") {
        res.status(400).json({
          status: "error",
          message: "Invalid profile ID",
        });
        return;
      }

      const profile = await this.profileService.findById(id);

      if (!profile) {
        res.status(404).json({
          status: "error",
          message: "Profile not found",
        });
        return;
      }

      res.status(200).json({
        status: "success",
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  };

  getProfiles = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters: ProfileFilter = {
        gender: req.query.gender as string | undefined,
        country_id: req.query.country_id as string | undefined,
        age_group: req.query.age_group as string | undefined,
      };

      // Validate filter values
      if (
        filters.age_group &&
        !["child", "teenager", "adult", "senior"].includes(filters.age_group)
      ) {
        res.status(400).json({
          status: "error",
          message: "Invalid age_group value",
        });
        return;
      }

      const profiles = await this.profileService.findAll(filters);

      // Format response with selected fields
      const formattedProfiles = profiles.map((p) => ({
        id: p.id,
        name: p.name,
        gender: p.gender,
        age: p.age,
        age_group: p.age_group,
        country_id: p.country_id,
      }));

      res.status(200).json({
        status: "success",
        count: formattedProfiles.length,
        data: formattedProfiles,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id || typeof id !== "string") {
        res.status(400).json({
          status: "error",
          message: "Invalid profile ID",
        });
        return;
      }

      const deleted = await this.profileService.delete(id);

      if (!deleted) {
        res.status(404).json({
          status: "error",
          message: "Profile not found",
        });
        return;
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
