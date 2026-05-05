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

  async getUserByEmail(email: string): Promise<User | null> {
    return db.getUserByEmail(email);
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return db.getUserByUsername(username);
  }

  async createUser(
    userData: Partial<User> & { password_hash: string },
  ): Promise<User> {
    // Ensure required fields are present
    if (
      !userData.id ||
      !userData.email ||
      !userData.username ||
      !userData.password_hash
    ) {
      throw new Error(
        "Missing required user data: id, email, username, or password_hash",
      );
    }

    // Create the complete user object
    const newUser: User = {
      id: userData.id,
      github_id: userData.github_id || null,
      username: userData.username,
      email: userData.email,
      full_name: userData.full_name || null,
      password_hash: userData.password_hash,
      avatar_url: userData.avatar_url || null,
      role: userData.role || "analyst",
      is_active: userData.is_active ?? true,
      last_login_at: userData.last_login_at || null,
      created_at: userData.created_at || new Date().toISOString(),
      updated_at: userData.updated_at || new Date().toISOString(),
    };

    // Save to database
    await db.createUserWithPassword(newUser);
    return newUser;
  }

  async updateLastLogin(userId: string): Promise<void> {
    await db.updateUserLastLogin(userId);
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
    const user = await db.getUserById(userId);
    return user ? user.is_active : false;
  }

  async getAllUsers(): Promise<User[]> {
    return db.getAllUsers();
  }
}
