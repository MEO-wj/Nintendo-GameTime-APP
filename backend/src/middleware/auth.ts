import type { Middleware } from "koa";
import type { AppEnv } from "../config/env.js";
import { verifyAuthToken } from "../utils/jwt.js";
import type { AppState } from "../types/koa.js";
import type { Repository } from "../repositories/types.js";

export function createAuthMiddleware(env: AppEnv, repository?: Repository): Middleware<AppState> {
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
      if (repository) {
        const user = await repository.getUserById(payload.userId);
        if (!user) {
          ctx.status = 401;
          ctx.body = { message: "User not found, please login again" };
          return;
        }
      }
      ctx.state.authUser = payload;
    } catch {
      ctx.status = 401;
      ctx.body = { message: "Invalid token" };
      return;
    }
    await next();
  };
}

export function requireAuthUser(state: AppState): { userId: string; email: string } {
  if (!state.authUser) {
    throw new Error("Unauthorized");
  }
  return state.authUser;
}
