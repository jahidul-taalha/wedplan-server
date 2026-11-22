// ============================================================
// WedPlan Server: main entry file
// ============================================================

// ---------- Imports: packages ----------
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";

// ---------- Imports: our own files ----------
import { connectDB } from "./config/db.js";
import { getAuth } from "./lib/auth.js";
import { verifyJWT, verifyRole } from "./middleware/auth.js";
import { stripeWebhook } from "./controllers/payments.js";
import servicesRouter from "./routes/services.js";
import bookingsRouter from "./routes/bookings.js";
import paymentsRouter from "./routes/payments.js";
import adminRouter from "./routes/admin.js";

// Load values from the .env file (MongoDB URI, secrets, etc.)
dotenv.config();

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 5000;

// ============================================================
// MIDDLEWARE: ORDER MATTERS, don't change the order below
// ============================================================

// 1) CORS must come FIRST.
//    It allows our Next.js client (CLIENT_URL) to call this server
//    and to send cookies. If it comes after Better Auth, the
//    /api/auth routes won't get CORS headers and the browser blocks them.
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

// 2) Better Auth handles everything under /api/auth/*
//    (sign-up, sign-in, Google login, session, JWT keys).
//    It must come BEFORE express.json().
app.use("/api/auth", (req, res, next) => {
  toNodeHandler(getAuth())(req, res).catch(next);
});

// 3) Stripe webhook needs the RAW request body (not JSON),
//    so it must also come BEFORE express.json().
//    Stripe uses the raw body to verify the payment is genuine.
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

// 4) From here on, every request body is parsed as JSON.
app.use(express.json());

// ============================================================
// API ROUTES
// ============================================================
app.use("/api/services", servicesRouter); // services (public, vendor, admin)
app.use("/api/bookings", bookingsRouter); // booking requests
app.use("/api/payments", paymentsRouter); // Stripe checkout
app.use("/api/admin", adminRouter);       // admin: users, stats, transactions

// ============================================================
// SIMPLE TEST ROUTES
// ============================================================

// Check that the server is running
app.get("/", (req, res) => {
  res.send("WedPlan Server is Running!");
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", db: "connected" });
});

// Returns the logged-in user (needs a valid JWT token)
app.get("/api/me", verifyJWT, (req, res) => {
  res.json(req.user);
});

// Only admins can open this (used to test role checking)
app.get("/api/admin-test", verifyJWT, verifyRole("admin"), (req, res) => {
  res.json({ message: "Admin access granted", user: req.user });
});

// ============================================================
// START THE SERVER
// ============================================================
async function start() {
  // Connect to MongoDB first, then start listening for requests
  await connectDB();

  app.listen(PORT, () => {
    console.log(`WedPlan Server running on port ${PORT}`);
  });
}

start();