import dotenv from "dotenv";
import { MongoClient, type Db } from "mongodb";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDB(): Promise<Db> {
  if (db) return db;

  if (!MONGODB_URI) {
    console.error(
      "MongoDB connection failed: MONGODB_URI is not defined in process.env."
    );
    process.exit(1);
  }

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db();
    console.log("MongoDB connected successfully");
    return db;
  } catch (error) {
    console.error(
      "MongoDB connection failed:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

export function getDB(): Db {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB() first.");
  }
  return db;
}
