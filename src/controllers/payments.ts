import type { NextFunction, Request, Response } from "express";
import Stripe from "stripe";
import { ObjectId, type Document } from "mongodb";
import { getDB } from "../config/db.js";
import type { AuthUser } from "../middleware/auth.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

const PREMIUM_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

const fail = (res: Response, status: number, message: string) =>
  res.status(status).json({ message });

function requireUser(req: Request, res: Response): AuthUser | null {
  if (!req.user) {
    fail(res, 401, "Unauthorized");
    return null;
  }
  return req.user;
}

async function isPremium(userId: string): Promise<boolean> {
  const vendor = await getDB()
    .collection<Document>("user")
    .findOne(
      { _id: new ObjectId(userId) },
      { projection: { subscriptionPlan: 1, subscriptionExpiresAt: 1 } }
    );

  if (vendor?.subscriptionPlan !== "premium") return false;

  const expiresAt = vendor.subscriptionExpiresAt;
  if (!expiresAt) return false;

  const expiryTime =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : new Date(expiresAt as string).getTime();

  return Number.isFinite(expiryTime) && expiryTime > Date.now();
}

export async function createCheckoutSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    if (await isPremium(user.id)) {
      return fail(res, 400, "Vendor is already on the premium plan");
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) return fail(res, 500, "Stripe price is not configured");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { vendorId: user.id },
      customer_email: user.email,
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
    });

    return res.json({ url: session.url });
  } catch (error) {
    next(error);
  }
}

export async function stripeWebhook(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const signature = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return fail(res, 400, "Missing Stripe signature");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, secret);
  } catch {
    return fail(res, 400, "Invalid Stripe signature");
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status === "paid") {
        const vendorId = session.metadata?.vendorId;

        if (vendorId) {
          const transactions = getDB().collection("transactions");
          const existing = await transactions.findOne({
            stripeSessionId: session.id,
          });

          if (!existing) {
            await transactions.insertOne({
              vendorId: new ObjectId(vendorId),
              plan: "premium",
              amount: (session.amount_total ?? 0) / 100,
              currency: session.currency ?? "usd",
              stripeSessionId: session.id,
              stripeSubscriptionId: null,
              status: "paid",
              createdAt: new Date(),
            });
          }

          await getDB()
            .collection("user")
            .updateOne(
              { _id: new ObjectId(vendorId) },
              {
                $set: {
                  subscriptionPlan: "premium",
                  subscriptionExpiresAt: new Date(Date.now() + PREMIUM_DURATION_MS),
                },
              }
            );
        }
      }
    }

    return res.json({ received: true });
  } catch (error) {
    next(error);
  }
}

export async function getSessionStatus(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const sessionId = req.params.sessionId as string;
    if (!sessionId) return fail(res, 400, "sessionId is required");

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.metadata?.vendorId !== user.id) {
      return fail(res, 403, "Forbidden");
    }

    return res.json({ paymentStatus: session.payment_status });
  } catch (error) {
    next(error);
  }
}
