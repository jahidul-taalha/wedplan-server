
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Test Route
app.get("/", (req, res) => {
  res.send("WedPlan Server is Running!");
});

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", db: "connected" });
});

async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`WedPlan Server running on port ${PORT}`);
  });
}

start();
