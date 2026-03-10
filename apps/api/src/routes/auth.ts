import { randomInt } from "node:crypto";
import Router from "@koa/router";
import { z } from "zod";
import type { AppDependencies } from "../container.js";
import { signAuthToken } from "../utils/jwt.js";

const loginSchema = z.object({
  email: z.string().email(),
  code: z.string().trim().optional()
});

export function createAuthRouter(deps: AppDependencies): Router {
  const router = new Router();

  router.post("/api/auth/login", async (ctx) => {
    const parsed = loginSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid payload", issues: parsed.error.flatten() };
      return;
    }
    const now = new Date();
    const email = parsed.data.email.trim().toLowerCase();
    const code = parsed.data.code?.trim();

    if (!code) {
      const generatedCode = String(randomInt(100000, 999999));
      const expiresAt = new Date(now.getTime() + deps.env.OTP_EXPIRES_MINUTES * 60 * 1000).toISOString();
      await deps.repository.saveAuthCode(email, generatedCode, expiresAt);
      ctx.body = {
        message: "OTP generated. Submit email + code to login.",
        expiresAt,
        ...(deps.env.NODE_ENV !== "production" ? { devCode: generatedCode } : {})
      };
      return;
    }

    const accepted =
      (deps.env.NODE_ENV !== "production" && code === deps.env.OTP_DEV_CODE) ||
      (await deps.repository.consumeAuthCode(email, code, now.toISOString()));

    if (!accepted) {
      ctx.status = 401;
      ctx.body = { message: "Invalid or expired OTP code" };
      return;
    }

    const user = await deps.repository.upsertUserByEmail(email);
    const token = signAuthToken({ userId: user.id, email: user.email }, deps.env);
    ctx.body = {
      token,
      user: {
        id: user.id,
        email: user.email
      }
    };
  });

  return router;
}
