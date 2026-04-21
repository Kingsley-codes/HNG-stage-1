// src/seed.ts
import { db } from "./database.js";
import { fetchGender, fetchAge, fetchNationality } from "./apiClients.js";
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
}

async function seedDatabase() {
  console.log("Starting database seed...");

  // Check if already seeded
  if (db.getProfileCount() > 0) {
    console.log(
      `Database already has ${db.getProfileCount()} profiles. Skipping seed.`,
    );
    return;
  }

  try {
    // Read the seed data file
    const seedData = JSON.parse(fs.readFileSync("./seed-data.json", "utf8"));
    const profiles: SeedProfile[] = seedData.profiles || [];

    console.log(`Found ${profiles.length} profiles to seed...`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      const name = profile.name;

      // Check if already exists
      const existing = db.getProfileByName(name);
      if (existing) {
        console.log(`Profile ${name} already exists, skipping...`);
        continue;
      }

      try {
        // Fetch data from APIs
        const [genderData, ageData, nationalityData] = await Promise.all([
          fetchGender(name),
          fetchAge(name),
          fetchNationality(name),
        ]);

        // Get top country
        const topCountry = nationalityData.country.reduce((prev, current) =>
          prev.probability > current.probability ? prev : current,
        );

        // Create profile
        const newProfile = {
          id: uuidv7(),
          name: name,
          gender: genderData.gender!,
          gender_probability: genderData.probability,
          sample_size: genderData.count,
          age: ageData.age!,
          age_group: getAgeGroup(ageData.age!),
          country_id: topCountry.country_id,
          country_name: db.getCountryName(topCountry.country_id),
          country_probability: topCountry.probability,
          created_at: new Date().toISOString(),
        };

        db.saveProfile(newProfile);
        successCount++;

        if ((i + 1) % 100 === 0) {
          console.log(`Seeded ${i + 1}/${profiles.length} profiles...`);
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to seed ${name}:`, error);
        failCount++;
      }
    }

    console.log(`\nSeeding complete!`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📊 Total profiles in DB: ${db.getProfileCount()}`);
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}

// Run seed if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase();
}

export { seedDatabase };
