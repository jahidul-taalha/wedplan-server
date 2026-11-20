import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface StoredUser {
  _id: ObjectId | string;
  email: string;
  role: string;
  isBlocked?: boolean;
  [key: string]: unknown;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`)
    );
  }
  return jwks;
}

function isUnauthorized(res: Response) {
  res.status(401).json({ message: "Unauthorized" });
}

export async function verifyJWT(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authorization = req.headers.authorization;
  const token =
    typeof authorization === "string" &&
    authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : null;

  if (!token) return isUnauthorized(res);

  let sub: string | undefined;
  try {
    const { payload } = await jwtVerify(token, getJwks());
    sub = payload.sub;
  } catch {
    return isUnauthorized(res);
  }

  if (!sub) return isUnauthorized(res);

  try {
    const _id = ObjectId.isValid(sub) ? new ObjectId(sub) : sub;
    const user = await getDB()
      .collection<StoredUser>("user")
      .findOne({ _id });

    if (!user) return isUnauthorized(res);
    if (user.isBlocked === true) {
      return res.status(403).json({ message: "Account is blocked" });
    }

    req.user = {
      id: String(user._id),
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function verifyRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return isUnauthorized(res);

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}
