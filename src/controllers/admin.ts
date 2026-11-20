import type { NextFunction, Request, Response } from "express";
import { ObjectId, type Document } from "mongodb";
import { getDB } from "../config/db.js";
import type { AuthUser } from "../middleware/auth.js";

const MAX_PAGE_SIZE = 100;
const ROLES = ["vendor", "customer", "admin"];
const isValidId = (id: string) => /^[0-9a-fA-F]{24}$/.test(id);
const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const queryString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function requireUser(req: Request, res: Response): AuthUser | null {
  if (!req.user) { fail(res, 401, "Unauthorized"); return null; }
  return req.user;
}

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const db = getDB();
    const [totalUsers, totalVendors, totalCustomers, totalServices, pendingServices, totalTransactions] = await Promise.all([
      db.collection("user").countDocuments({}),
      db.collection("user").countDocuments({ role: "vendor" }),
      db.collection("user").countDocuments({ role: "customer" }),
      db.collection("services").countDocuments({}),
      db.collection("services").countDocuments({ status: "pending" }),
      db.collection("transactions").countDocuments({}),
    ]);
    res.json({ totalUsers, totalVendors, totalCustomers, totalServices, pendingServices, totalTransactions });
  } catch (error) { next(error); }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const filter: Document = {};
    const search = queryString(req.query.search);
    if (search) { const regex = { $regex: escapeRegex(search), $options: "i" }; filter.$or = [{ name: regex }, { email: regex }]; }
    const role = queryString(req.query.role);
    if (role) { if (!ROLES.includes(role)) return fail(res, 400, "role must be vendor, customer or admin"); filter.role = role; }
    const page = Math.max(1, Number.parseInt(queryString(req.query.page) || "1", 10) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(queryString(req.query.limit) || "10", 10) || 10));
    const collection = getDB().collection("user");
    const [users, total] = await Promise.all([
      collection.find(filter, { projection: { password: 0 } }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      collection.countDocuments(filter),
    ]);
    res.json({ users, total });
  } catch (error) { next(error); }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    if (!isValidId(id)) return fail(res, 400, "Invalid user id");
    const user = await getDB().collection("user").findOne({ _id: new ObjectId(id) }, { projection: { password: 0 } });
    if (!user) return fail(res, 404, "User not found");
    res.json({ user });
  } catch (error) { next(error); }
}

export async function blockUser(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = requireUser(req, res); if (!admin) return;
    const id = req.params.id as string;
    if (!isValidId(id)) return fail(res, 400, "Invalid user id");
    if (id === admin.id) return fail(res, 400, "You cannot block yourself");
    const isBlocked = (req.body as { isBlocked?: unknown })?.isBlocked;
    if (typeof isBlocked !== "boolean") return fail(res, 400, "isBlocked must be a boolean");
    const collection = getDB().collection("user");
    const user = await collection.findOne({ _id: new ObjectId(id) });
    if (!user) return fail(res, 404, "User not found");
    if (user.role === "admin") return fail(res, 403, "You cannot block another admin");
    await collection.updateOne({ _id: new ObjectId(id) }, { $set: { isBlocked } });
    res.json({ message: "User updated", isBlocked });
  } catch (error) { next(error); }
}

export async function listTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const pipeline: Document[] = [
      { $sort: { createdAt: -1 } },
      { $lookup: { from: "user", localField: "vendorId", foreignField: "_id", as: "vendor" } },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      { $project: { vendorId: 1, plan: 1, amount: 1, currency: 1, stripeSessionId: 1, stripeSubscriptionId: 1, status: 1, createdAt: 1, vendor: { name: "$vendor.name", email: "$vendor.email", businessName: "$vendor.businessName" } } },
    ];
    const transactions = await getDB().collection("transactions").aggregate(pipeline).toArray();
    res.json({ transactions });
  } catch (error) { next(error); }
}
