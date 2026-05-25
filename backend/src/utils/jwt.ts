import jwt from "jsonwebtoken";
import type { AppEnv } from "../config/env.js";

export interface AuthTokenPayload {
  userId: string;
  email: string;
}

export function signAuthToken(payload: AuthTokenPayload, env: AppEnv): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyAuthToken(token: string, env: AppEnv): AuthTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid JWT payload");
  }
  return {
    userId: String(decoded.userId),
    email: String(decoded.email)
  };
}
