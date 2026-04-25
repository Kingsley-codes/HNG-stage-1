// src/services/userService.ts
import { db } from "./database.js";
import { User } from "../types/index.js";

export class UserService {
  async findOrCreateUser(githubUser: any): Promise<User> {
    return db.findOrCreateUser(githubUser);
  }

  async getUserById(id: string): Promise<User | undefined> {
    return db.getUserById(id);
  }

  async getUserByGithubId(githubId: number): Promise<User | undefined> {
    return db.getUserByGithubId(githubId);
  }

  async updateUserRole(
    userId: string,
    role: "admin" | "analyst",
  ): Promise<User | undefined> {
    return db.updateUserRole(userId, role);
  }

  async deactivateUser(userId: string): Promise<boolean> {
    return db.deactivateUser(userId);
  }

  async checkUserActive(userId: string): Promise<boolean> {
    const user = db.getUserById(userId);
    return user ? user.is_active : false;
  }

  async getAllUsers(): Promise<User[]> {
    return db.getAllUsers();
  }
}
