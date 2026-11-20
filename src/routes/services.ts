import { Router } from "express";
import {
  createService,
  deleteService,
  getService,
  listMyServices,
  listServices,
  updateService,
} from "../controllers/services.js";
import { verifyJWT, verifyRole } from "../middleware/auth.js";

const router = Router();

// Public listing (approved + active only)
router.get("/", listServices);

// Vendor's own services (must be registered before /:id)
router.get("/mine/list", verifyJWT, verifyRole("vendor"), listMyServices);

// Single service
router.get("/:id", verifyJWT, getService);

// Create
router.post("/", verifyJWT, verifyRole("vendor"), createService);

// Update (owner only)
router.patch("/:id", verifyJWT, verifyRole("vendor"), updateService);

// Delete (owner only)
router.delete("/:id", verifyJWT, verifyRole("vendor"), deleteService);

export default router;
