import servicesRouter from "./routes/services.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";
import { connectDB } from "./config/db.js";
import { getAuth } from "./lib/auth.js";
import { verifyJWT, verifyRole } from "./middleware/auth.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Better Auth handler for every route under /api/auth/*.
app.use("/api/auth", (req, res, next) => {
  toNodeHandler(getAuth())(req, res).catch(next);
});
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());

// Services routes
app.use("/api/services", servicesRouter);

// Test Route
app.get("/", (req, res) => {
  res.send("WedPlan Server is Running!");
});

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", db: "connected" });
});

// Current user
app.get("/api/me", verifyJWT, (req, res) => {
  res.json(req.user);
});

// Admin only
app.get(
  "/api/admin-test",
  verifyJWT,
  verifyRole("admin"),
  (req, res) => {
    res.json({ message: "Admin access granted", user: req.user });
  }
);

async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`WedPlan Server running on port ${PORT}`);
  });
}

start();
