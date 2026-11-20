import type { NextFunction, Request, Response } from "express";
import { ObjectId, type Document } from "mongodb";
import { getDB } from "../config/db.js";
import type { AuthUser } from "../middleware/auth.js";

type BookingStatus = "pending" | "accepted" | "rejected" | "cancelled";

type BookingDoc = {
  _id?: ObjectId; serviceId: ObjectId; vendorId: ObjectId; customerId: ObjectId;
  eventDate: Date; eventLocation: string; message: string;
  status: BookingStatus; createdAt: Date;
};

const isValidId = (id: string) => /^[0-9a-fA-F]{24}$/.test(id);
const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });

function requireUser(req: Request, res: Response): AuthUser | null {
  if (!req.user) { fail(res, 401, "Unauthorized"); return null; }
  return req.user;
}

export async function createBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req, res); if (!user) return;
    if (user.role !== "customer") return fail(res, 403, "Only customers can create bookings");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { serviceId, eventDate: rawDate, eventLocation } = body;
    if (typeof serviceId !== "string" || !isValidId(serviceId)) return fail(res, 400, "Invalid serviceId");
    if (typeof rawDate !== "string" || !rawDate.trim()) return fail(res, 400, "eventDate is required");
    if (typeof eventLocation !== "string" || !eventLocation.trim()) return fail(res, 400, "eventLocation is required");
    const eventDate = new Date(rawDate);
    if (Number.isNaN(eventDate.getTime())) return fail(res, 400, "Invalid eventDate");
    if (eventDate.getTime() <= Date.now()) return fail(res, 400, "Event date must be in the future");
    const service = await getDB().collection<Document>("services").findOne({ _id: new ObjectId(serviceId) });
    if (!service) return fail(res, 404, "Service not found");
    if (service.status !== "approved" || !service.isActive) return fail(res, 404, "Service is not available");
    const vendorId = new ObjectId(String(service.vendorId));
    if (String(vendorId) === user.id) return fail(res, 403, "You cannot book your own service");
    const customerId = new ObjectId(user.id);
    const duplicate = await getDB().collection("bookings").findOne({ customerId, serviceId: new ObjectId(serviceId), eventDate, status: { $in: ["pending", "accepted"] } });
    if (duplicate) return fail(res, 409, "You already have a pending or accepted booking for this service and date");
    const booking: BookingDoc = { serviceId: new ObjectId(serviceId), vendorId, customerId, eventDate, eventLocation: eventLocation.trim(), message: typeof body.message === "string" ? body.message : "", status: "pending", createdAt: new Date() };
    const result = await getDB().collection<BookingDoc>("bookings").insertOne(booking);
    res.status(201).json({ booking: { ...booking, _id: result.insertedId } });
  } catch (error) { next(error); }
}

export async function getMyBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req, res); if (!user) return;
    if (user.role !== "customer") return fail(res, 403, "Only customers can view their bookings");
    const pipeline: Document[] = [
      { $match: { customerId: new ObjectId(user.id) } },
      { $lookup: { from: "services", localField: "serviceId", foreignField: "_id", as: "service" } },
      { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "user", localField: "vendorId", foreignField: "_id", as: "vendor" } },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
      { $project: { serviceId: 1, eventDate: 1, eventLocation: 1, message: 1, status: 1, createdAt: 1, serviceName: "$service.serviceName", images: "$service.images", price: "$service.price", vendor: { name: "$vendor.name", email: "$vendor.email", image: "$vendor.image", businessName: "$vendor.businessName" } } },
    ];
    const bookings = await getDB().collection("bookings").aggregate(pipeline).toArray();
    res.json({ bookings });
  } catch (error) { next(error); }
}

export async function cancelBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req, res); if (!user) return;
    if (user.role !== "customer") return fail(res, 403, "Only customers can cancel bookings");
    const id = req.params.id as string;
    if (!isValidId(id)) return fail(res, 400, "Invalid booking id");
    const collection = getDB().collection("bookings");
    const booking = await collection.findOne({ _id: new ObjectId(id) });
    if (!booking) return fail(res, 404, "Booking not found");
    if (String(booking.customerId) !== user.id) return fail(res, 403, "You can only cancel your own booking");
    if (booking.status !== "pending") return fail(res, 403, "Only pending bookings can be cancelled");
    await collection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "cancelled" } });
    res.json({ message: "Booking cancelled" });
  } catch (error) { next(error); }
}

export async function getVendorBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req, res); if (!user) return;
    const pipeline: Document[] = [
      { $match: { vendorId: new ObjectId(user.id) } },
      { $lookup: { from: "services", localField: "serviceId", foreignField: "_id", as: "service" } },
      { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "user", localField: "customerId", foreignField: "_id", as: "customer" } },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
      { $project: { serviceId: 1, eventDate: 1, eventLocation: 1, message: 1, status: 1, createdAt: 1, serviceName: "$service.serviceName", images: "$service.images", price: "$service.price", customer: { name: "$customer.name", email: "$customer.email", image: "$customer.image" } } },
    ];
    const bookings = await getDB().collection("bookings").aggregate(pipeline).toArray();
    res.json({ bookings });
  } catch (error) { next(error); }
}

export async function updateBookingStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req, res); if (!user) return;
    const id = req.params.id as string;
    if (!isValidId(id)) return fail(res, 400, "Invalid booking id");
    const collection = getDB().collection("bookings");
    const booking = await collection.findOne({ _id: new ObjectId(id) });
    if (!booking) return fail(res, 404, "Booking not found");
    if (String(booking.vendorId) !== user.id) return fail(res, 403, "Only the vendor who owns this booking can update its status");
    if (booking.status !== "pending") return fail(res, 403, "Only pending bookings can be updated");
    const status = (req.body as { status?: unknown })?.status;
    if (status !== "accepted" && status !== "rejected") return fail(res, 400, "status must be 'accepted' or 'rejected'");
    await collection.updateOne({ _id: new ObjectId(id) }, { $set: { status } });
    res.json({ booking: await collection.findOne({ _id: new ObjectId(id) }) });
  } catch (error) { next(error); }
}

export async function getBookingsStats(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req, res); if (!user) return;
    const filter: Document = {};
    if (user.role === "customer") filter.customerId = new ObjectId(user.id);
    else if (user.role === "vendor") filter.vendorId = new ObjectId(user.id);
    const bookings = await getDB().collection("bookings").find(filter).toArray();
    res.json({
      total: bookings.length,
      pending: bookings.filter((b) => b.status === "pending").length,
      accepted: bookings.filter((b) => b.status === "accepted").length,
      rejected: bookings.filter((b) => b.status === "rejected").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
    });
  } catch (error) { next(error); }
}
