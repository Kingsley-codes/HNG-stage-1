// src/force-seed.ts
import { db } from "./database.js";
import { seedDatabase } from "./seed.js";

async function forceSeed() {
  console.log("Forcing database reseed...");
  db.clearDatabase();
  await seedDatabase();
}

forceSeed();
