
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

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

// Start Server
app.listen(PORT, () => {
  console.log(`WedPlan Server running on port ${PORT}`);
});
