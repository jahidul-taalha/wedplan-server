import { Router } from "express";
import {
  getStats,
  listUsers,
  getUser,
  blockUser,
  listTransactions,
} from "../controllers/admin.js";
import { verifyJWT, verifyRole } from "../middleware/auth.js";

const router = Router();
const adminOnly = [verifyJWT, verifyRole("admin")];

router.get("/stats", ...adminOnly, getStats);
router.get("/users", ...adminOnly, listUsers);
router.get("/users/:id", ...adminOnly, getUser);
router.patch("/users/:id/block", ...adminOnly, blockUser);
router.get("/transactions", ...adminOnly, listTransactions);

export default router;
