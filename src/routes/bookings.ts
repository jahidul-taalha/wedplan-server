import express from "express";
import {
  createBooking,
  getMyBookings,
  cancelBooking,
  getVendorBookings,
  updateBookingStatus,
  getBookingsStats,
} from "../controllers/bookings.js";
import { verifyJWT, verifyRole } from "../middleware/auth.js";

const router = express.Router();

// 1. POST /api/bookings (customer only)
router.post("/", verifyJWT, createBooking);

// 2. GET /api/bookings/my (customer)
router.get("/my", verifyJWT, getMyBookings);

// 3. GET /api/bookings/vendor (vendor)
router.get("/vendor", verifyJWT, verifyRole("vendor"), getVendorBookings);

// 4. GET /api/bookings/stats (customer or vendor)
router.get("/stats", verifyJWT, getBookingsStats);

// 5. PATCH /api/bookings/:id/cancel (customer)
router.patch("/:id/cancel", verifyJWT, cancelBooking);

// 6. PATCH /api/bookings/:id/status (vendor)
router.patch("/:id/status", verifyJWT, verifyRole("vendor"), updateBookingStatus);

export default router;