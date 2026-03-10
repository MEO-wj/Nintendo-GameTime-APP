import type { Middleware } from "koa";
import type { AppEnv } from "../config/env.js";
import { verifyAuthToken } from "../utils/jwt.js";
import type { AppState } from "../types/koa.js";

export function createAuthMiddleware(env: AppEnv): Middleware<AppState> {
  return async (ctx, next) => {
    const header = ctx.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      ctx.status = 401;
      ctx.body = { message: "Unauthorized" };
      return;
    }
    const token = header.slice("Bearer ".length);
    try {
      const payload = verifyAuthToken(token, env);
      ctx.state.authUser = payload;
      await next();
    } catch {
      ctx.status = 401;
      ctx.body = { message: "Invalid token" };
    }
  };
}

export function requireAuthUser(state: AppState): { userId: string; email: string } {
  if (!state.authUser) {
    throw new Error("Unauthorized");
  }
  return state.authUser;
}
