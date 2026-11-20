import { Router } from "express";
import {
  createCheckoutSession,
  getSessionStatus,
} from "../controllers/payments.js";
import { verifyJWT, verifyRole } from "../middleware/auth.js";

const router = Router();

router.post(
  "/create-checkout-session",
  verifyJWT,
  verifyRole("vendor"),
  createCheckoutSession
);

router.get(
  "/session/:sessionId",
  verifyJWT,
  verifyRole("vendor"),
  getSessionStatus
);

export default router;
