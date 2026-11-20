import dotenv from "dotenv";
import { connectDB, getDB } from "../config/db.js";
import { getAuth } from "../lib/auth.js";

dotenv.config();

function requireEnv(name: string, value: string | undefined): string {
  if (!value || !value.trim()) {
    console.error(`Admin seed failed: ${name} is missing from the environment.`);
    process.exit(1);
  }
  return value.trim();
}

const ADMIN_NAME = requireEnv("ADMIN_NAME", process.env.ADMIN_NAME);
const ADMIN_EMAIL = requireEnv("ADMIN_EMAIL", process.env.ADMIN_EMAIL).toLowerCase();
const ADMIN_PASSWORD = requireEnv("ADMIN_PASSWORD", process.env.ADMIN_PASSWORD);

async function main() {
  await connectDB();
  const db = getDB();

  const existing = await db.collection("user").findOne({ email: ADMIN_EMAIL });

  if (existing) {
    const result = await db
      .collection("user")
      .updateOne({ _id: existing._id }, { $set: { role: "admin", isBlocked: false } });

    if (result.matchedCount === 0) {
      throw new Error(`Could not update user ${ADMIN_EMAIL}`);
    }

    console.log(
      `Admin seed: existing user ${ADMIN_EMAIL} is now an admin (isBlocked: false).`
    );
  } else {
    const auth = getAuth();
    const created = await auth.api.signUpEmail({
      body: {
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });

    const result = await db
      .collection("user")
      .updateOne(
        { email: ADMIN_EMAIL },
        { $set: { role: "admin", isBlocked: false } }
      );

    if (result.matchedCount === 0) {
      throw new Error(`Created user ${ADMIN_EMAIL} but could not promote it`);
    }

    console.log(
      `Admin seed: created user ${ADMIN_EMAIL} (id ${created.user.id}) and set role to admin.`
    );
  }

  console.log("Admin seed completed successfully.");
  process.exit(0);
}

main().catch((error) => {
  console.error(
    "Admin seed failed:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
