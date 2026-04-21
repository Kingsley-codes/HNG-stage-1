// src/seed.ts
import { db } from "./database.js";
import { v7 as uuidv7 } from "uuid";
import fs from "fs";

function getAgeGroup(age: number): string {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

interface SeedProfile {
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name: string;
  country_probability: number;
}

async function seedDatabase() {
  console.log("🌱 Starting database seed...");
  console.log("=====================================\n");

  // Check if already seeded
  const existingCount = db.getProfileCount();
  if (existingCount > 0) {
    console.log(`📊 Database already has ${existingCount} profiles.`);
    console.log("💡 To re-seed, run: npm run seed:force");
    return;
  }

  try {
    // Read the seed data file - NOTE: Make sure filename matches!
    const seedData = JSON.parse(
      fs.readFileSync("./seed_profiles.json", "utf8"),
    );
    const profiles: SeedProfile[] = seedData.profiles || [];

    console.log(`📋 Found ${profiles.length} profiles to seed...`);
    console.log("⏳ Seeding in progress...\n");

    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      const name = profile.name;

      // Check if already exists
      const existing = db.getProfileByName(name);
      if (existing) {
        skipCount++;
        continue;
      }

      try {
        // Use the data from the JSON file directly - NO API CALLS NEEDED!
        const newProfile = {
          id: uuidv7(),
          name: profile.name,
          gender: profile.gender,
          gender_probability: profile.gender_probability,
          sample_size: 1000, // Default sample size for seeded data
          age: profile.age,
          age_group: profile.age_group,
          country_id: profile.country_id,
          country_name: db.getCountryName(profile.country_id),
          country_probability: profile.country_probability,
          created_at: new Date().toISOString(),
        };

        db.saveProfile(newProfile);
        successCount++;

        // Show progress every 100 records
        if (successCount % 100 === 0) {
          console.log(
            `📊 Progress: ${successCount}/${profiles.length} profiles seeded`,
          );
        }
      } catch (error) {
        console.error(`❌ Failed to seed ${profile.name}:`, error);
      }
    }

    console.log("\n✅ Seeding Complete!");
    console.log(`📈 Successfully seeded: ${successCount}`);
    console.log(`⏭️  Skipped (already exist): ${skipCount}`);
    console.log(`💾 Total profiles in DB: ${db.getProfileCount()}`);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    console.log("\n💡 Troubleshooting tips:");
    console.log(
      "   1. Make sure 'seed_profiles.json' exists in the project root",
    );
    console.log("   2. Check that the JSON file has a 'profiles' array");
    console.log("   3. Verify the JSON file is valid (no syntax errors)");
  }
}

// Run seed if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase();
}

export { seedDatabase };
