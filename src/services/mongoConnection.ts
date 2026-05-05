import { Db, MongoClient } from "mongodb";
import { env } from "../config/env.js";

class MongoConnection {
  private client: MongoClient | null = null;
  private database: Db | null = null;
  private connectPromise: Promise<Db> | null = null;

  async connect(): Promise<Db> {
    if (this.database) {
      return this.database;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.initialize().finally(() => {
        this.connectPromise = null;
      });
    }

    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.close();
    this.client = null;
    this.database = null;
  }

  getDb(): Db {
    if (!this.database) {
      throw new Error("MongoDB connection has not been initialized");
    }

    return this.database;
  }

  private async initialize(): Promise<Db> {
    this.client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 50,
      minPoolSize: 5,
      maxIdleTimeMS: 30_000,
      serverSelectionTimeoutMS: 10_000,
    });

    await this.client.connect();
    this.database = this.client.db(env.MONGODB_DB_NAME);
    return this.database;
  }
}

export const mongoConnection = new MongoConnection();
