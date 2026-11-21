import type { NextFunction, Request, Response } from "express";
import { ObjectId, type Document, type Filter } from "mongodb";
import { getDB } from "../config/db.js";
import type { AuthUser } from "../middleware/auth.js";

export const ALLOWED_CATEGORIES = [
  "Photography & Videography",
  "Wedding Venues",
  "Decoration & Florist",
  "Catering Services",
  "Makeup & Styling",
  "Wedding Fashion",
] as const;

const PREMIUM_PLAN = "premium";
const FREE_PLAN_ACTIVE_LIMIT = 3;
const MAX_PAGE_SIZE = 100;
const FREE_LIMIT_MESSAGE =
  "Free plan allows up to 3 active services. Upgrade to Premium to add more.";

type ServiceStatus = "pending" | "approved" | "rejected";

interface ServiceDoc {
  _id?: ObjectId;
  vendorId: ObjectId;
  serviceName: string;
  category: string;
  description: string;
  price: number;
  location: string;
  images: string[];
  status: ServiceStatus;
  isActive: boolean;
  createdAt: Date;
}

interface VendorInfo {
  name: string | null;
  image: string | null;
  businessName: string | null;
  subscriptionPlan: string | null;
}

type ServiceWithVendor = ServiceDoc & { vendor?: VendorInfo | null };

interface ServiceInput {
  serviceName: string;
  category: string;
  description: string;
  price: number;
  location: string;
  images: string[];
  isActive: boolean;
}

type ValidationResult =
  | { ok: true; data: Partial<ServiceInput> }
  | { ok: false; message: string };

const VENDOR_LOOKUP: Document[] = [
  {
    $lookup: {
      from: "user",
      localField: "vendorId",
      foreignField: "_id",
      as: "vendor",
    },
  },
  { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
  {
    $project: {
      vendorId: 1,
      serviceName: 1,
      category: 1,
      description: 1,
      price: 1,
      location: 1,
      images: 1,
      status: 1,
      isActive: 1,
      createdAt: 1,
      vendor: {
        name: "$vendor.name",
        image: "$vendor.image",
        businessName: "$vendor.businessName",
        subscriptionPlan: "$vendor.subscriptionPlan",
      },
    },
  },
];

function fail(res: Response, status: number, message: string) {
  return res.status(status).json({ message });
}

function isValidObjectId(id: string) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function queryString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requireUser(req: Request, res: Response): AuthUser | null {
  if (!req.user) {
    fail(res, 401, "Unauthorized");
    return null;
  }
  return req.user;
}

function requireVendorId(req: Request, res: Response): ObjectId | null {
  const user = requireUser(req, res);
  if (!user) return null;
  if (!isValidObjectId(user.id)) {
    fail(res, 401, "Unauthorized");
    return null;
  }
  return new ObjectId(user.id);
}

async function getVendorPlan(vendorId: ObjectId): Promise<string> {
  const vendor = await getDB()
    .collection("user")
    .findOne({ _id: vendorId }, { projection: { subscriptionPlan: 1 } });

  return typeof vendor?.subscriptionPlan === "string"
    ? vendor.subscriptionPlan
    : "free";
}

async function countActiveServices(
  vendorId: ObjectId,
  excludeId?: ObjectId
): Promise<number> {
  const filter: Filter<ServiceDoc> = {
    vendorId,
    isActive: true,
    status: { $ne: "rejected" },
  };
  if (excludeId) filter._id = { $ne: excludeId };

  return getDB().collection<ServiceDoc>("services").countDocuments(filter);
}

function validateServiceFields(
  body: Record<string, unknown>,
  { partial }: { partial: boolean }
): ValidationResult {
  const data: Partial<ServiceInput> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  const needed = (key: string) => !partial || has(key);

  if (needed("serviceName")) {
    const value = body.serviceName;
    if (typeof value !== "string" || !value.trim()) {
      return {
        ok: false,
        message: "serviceName is required and must be a non-empty string",
      };
    }
    data.serviceName = value.trim();
  }

  if (needed("category")) {
    const value = body.category;
    if (
      typeof value !== "string" ||
      !(ALLOWED_CATEGORIES as readonly string[]).includes(value)
    ) {
      return {
        ok: false,
        message: `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}`,
      };
    }
    data.category = value;
  }

  if (needed("description")) {
    const value = body.description;
    if (typeof value !== "string" || !value.trim()) {
      return {
        ok: false,
        message: "description is required and must be a non-empty string",
      };
    }
    data.description = value.trim();
  }

  if (needed("price")) {
    const value = body.price;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return {
        ok: false,
        message: "price is required and must be a non-negative number",
      };
    }
    data.price = value;
  }

  if (needed("location")) {
    const value = body.location;
    if (typeof value !== "string" || !value.trim()) {
      return {
        ok: false,
        message: "location is required and must be a non-empty string",
      };
    }
    data.location = value.trim();
  }

  if (needed("images")) {
    const value = body.images;
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string" || !item.trim())
    ) {
      return {
        ok: false,
        message: "images is required and must be an array of non-empty strings",
      };
    }
    data.images = value as string[];
  }

  if (partial && has("isActive")) {
    const value = body.isActive;
    if (typeof value !== "boolean") {
      return { ok: false, message: "isActive must be a boolean" };
    }
    data.isActive = value;
  }

  return { ok: true, data };
}

export async function listServices(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const filter: Filter<ServiceDoc> = {
      status: "approved",
      isActive: true,
    };

    const search = queryString(req.query.search);
    if (search) {
      filter.serviceName = { $regex: escapeRegex(search), $options: "i" };
    }

    const category = queryString(req.query.category);
    if (category) filter.category = category;

    const location = queryString(req.query.location);
    if (location) {
      filter.location = { $regex: escapeRegex(location), $options: "i" };
    }

    const page = Math.max(
      1,
      Number.parseInt(queryString(req.query.page) || "1", 10) || 1
    );
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        Number.parseInt(queryString(req.query.limit) || "10", 10) || 10
      )
    );

    const sort: Document =
      req.query.sort === "price_asc"
        ? { price: 1 }
        : req.query.sort === "price_desc"
          ? { price: -1 }
          : { createdAt: -1 };

    const collection = getDB().collection<ServiceDoc>("services");

    const [services, total] = await Promise.all([
      collection
        .aggregate<ServiceWithVendor>([
          { $match: filter },
          { $sort: sort },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          ...VENDOR_LOOKUP,
        ])
        .toArray(),
      collection.countDocuments(filter),
    ]);

    res.json({
      services,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
}

export async function getService(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const id = queryString(req.params.id);
    if (!isValidObjectId(id)) {
      fail(res, 400, "Invalid service id");
      return;
    }

    const service = await getDB()
      .collection<ServiceDoc>("services")
      .findOne({ _id: new ObjectId(id) });

    if (!service) {
      fail(res, 404, "Service not found");
      return;
    }

    const isOwner = String(service.vendorId) === user.id;
    const isAdmin = user.role === "admin";
    const isVisible = service.status === "approved" && service.isActive;
    if (!isVisible && !isOwner && !isAdmin) {
      fail(res, 404, "Service not found");
      return;
    }

    const vendor = await getDB()
      .collection("user")
      .findOne(
        { _id: service.vendorId },
        { projection: { name: 1, image: 1, businessName: 1, subscriptionPlan: 1 } }
      );

    res.json({
      service: {
        ...service,
        vendor: vendor
          ? {
              name: vendor.name ?? null,
              image: vendor.image ?? null,
              businessName: vendor.businessName ?? null,
              subscriptionPlan: vendor.subscriptionPlan ?? null,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createService(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const vendorId = requireVendorId(req, res);
    if (!vendorId) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const parsed = validateServiceFields(body, { partial: false });
    if (!parsed.ok) {
      fail(res, 400, parsed.message);
      return;
    }
    const fields = parsed.data as ServiceInput;

    const plan = await getVendorPlan(vendorId);
    if (plan !== PREMIUM_PLAN) {
      const activeCount = await countActiveServices(vendorId);
      if (activeCount >= FREE_PLAN_ACTIVE_LIMIT) {
        fail(res, 403, FREE_LIMIT_MESSAGE);
        return;
      }
    }

    const service: ServiceDoc = {
      vendorId,
      serviceName: fields.serviceName,
      category: fields.category,
      description: fields.description,
      price: fields.price,
      location: fields.location,
      images: fields.images,
      status: "pending",
      isActive: true,
      createdAt: new Date(),
    };

    const result = await getDB()
      .collection<ServiceDoc>("services")
      .insertOne(service);

    res.status(201).json({
      service: { ...service, _id: result.insertedId },
    });
  } catch (error) {
    next(error);
  }
}

export async function listMyServices(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const vendorId = requireVendorId(req, res);
    if (!vendorId) return;

    const services = await getDB()
      .collection<ServiceDoc>("services")
      .find({ vendorId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ services });
  } catch (error) {
    next(error);
  }
}

export async function updateService(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const id = queryString(req.params.id);
    if (!isValidObjectId(id)) {
      fail(res, 400, "Invalid service id");
      return;
    }
    const _id = new ObjectId(id);

    const collection = getDB().collection<ServiceDoc>("services");
    const service = await collection.findOne({ _id });
    if (!service) {
      fail(res, 404, "Service not found");
      return;
    }

    if (String(service.vendorId) !== user.id) {
      fail(res, 403, "You can only update your own services");
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const parsed = validateServiceFields(body, { partial: true });
    if (!parsed.ok) {
      fail(res, 400, parsed.message);
      return;
    }

    const data = parsed.data;
    const updatableKeys = [
      "serviceName",
      "category",
      "description",
      "price",
      "location",
      "images",
      "isActive",
    ] as const;
    const $set: Partial<ServiceInput> = {};
    for (const key of updatableKeys) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        $set[key] = data[key] as never;
      }
    }

    if (Object.keys($set).length === 0) {
      fail(res, 400, "No updatable fields provided");
      return;
    }

    if ($set.isActive === true && service.isActive !== true) {
      const vendorId = service.vendorId;
      const plan = await getVendorPlan(vendorId);
      if (plan !== PREMIUM_PLAN) {
        const activeCount = await countActiveServices(vendorId, _id);
        if (activeCount >= FREE_PLAN_ACTIVE_LIMIT) {
          fail(res, 403, FREE_LIMIT_MESSAGE);
          return;
        }
      }
    }

    await collection.updateOne({ _id }, { $set });

    const updated = await collection.findOne({ _id });
    res.json({ service: updated });
  } catch (error) {
    next(error);
  }
}

export async function adminListServices(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const filter: Filter<ServiceDoc> = {};

    const search = queryString(req.query.search);
    if (search) {
      filter.serviceName = { $regex: escapeRegex(search), $options: "i" };
    }

    const status = queryString(req.query.status);
    if (status && status !== "all") {
      if (!["pending", "approved", "rejected"].includes(status)) {
        fail(res, 400, "status must be pending, approved or rejected");
        return;
      }
      filter.status = status as ServiceStatus;
    }

    const category = queryString(req.query.category);
    if (category && category !== "all") filter.category = category;

    const services = await getDB()
      .collection<ServiceDoc>("services")
      .aggregate<ServiceWithVendor>([
        { $match: filter },
        { $sort: { createdAt: -1 } },
        ...VENDOR_LOOKUP,
      ])
      .toArray();

    res.json({ services });
  } catch (error) {
    next(error);
  }
}

export async function adminUpdateServiceStatus(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = queryString(req.params.id);
    if (!isValidObjectId(id)) {
      fail(res, 400, "Invalid service id");
      return;
    }

    const status = (req.body as { status?: unknown })?.status;
    if (status !== "approved" && status !== "rejected" && status !== "pending") {
      fail(res, 400, "status must be 'approved', 'rejected' or 'pending'");
      return;
    }

    const collection = getDB().collection<ServiceDoc>("services");
    const _id = new ObjectId(id);
    const service = await collection.findOne({ _id });
    if (!service) {
      fail(res, 404, "Service not found");
      return;
    }

    await collection.updateOne({ _id }, { $set: { status } });
    res.json({
      message: "Service status updated",
      service: await collection.findOne({ _id }),
    });
  } catch (error) {
    next(error);
  }
}

export async function adminDeleteService(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = queryString(req.params.id);
    if (!isValidObjectId(id)) {
      fail(res, 400, "Invalid service id");
      return;
    }

    const result = await getDB()
      .collection<ServiceDoc>("services")
      .deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      fail(res, 404, "Service not found");
      return;
    }

    res.json({ message: "Service deleted" });
  } catch (error) {
    next(error);
  }
}

export async function deleteService(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const id = queryString(req.params.id);
    if (!isValidObjectId(id)) {
      fail(res, 400, "Invalid service id");
      return;
    }
    const _id = new ObjectId(id);

    const collection = getDB().collection<ServiceDoc>("services");
    const service = await collection.findOne({ _id });
    if (!service) {
      fail(res, 404, "Service not found");
      return;
    }

    if (String(service.vendorId) !== user.id) {
      fail(res, 403, "You can only delete your own services");
      return;
    }

    await collection.deleteOne({ _id });

    res.json({ message: "Service deleted" });
  } catch (error) {
    next(error);
  }
}
