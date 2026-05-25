import { randomInt } from "node:crypto";
import bcrypt from "bcrypt";
import Router from "@koa/router";
import { z } from "zod";
import type { AppDependencies } from "../container.js";
import { signAuthToken } from "../utils/jwt.js";

const SALT_ROUNDS = 10;

const sendCodeSchema = z.object({
  email: z.string().email()
});

const registerSchema = z.object({
  email: z.string().email(),
  code: z.string().trim().min(1, "验证码不能为空"),
  password: z.string().min(6, "密码至少6位")
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "密码不能为空")
});

export function createAuthRouter(deps: AppDependencies): Router {
  const router = new Router();

  // POST /api/auth/send-code — 发送注册验证码
  router.post("/api/auth/send-code", async (ctx) => {
    const parsed = sendCodeSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid payload", issues: parsed.error.flatten() };
      return;
    }
    const now = new Date();
    const email = parsed.data.email.trim().toLowerCase();
    const generatedCode = String(randomInt(100000, 999999));
    const expiresAt = new Date(now.getTime() + deps.env.OTP_EXPIRES_MINUTES * 60 * 1000).toISOString();
    await deps.repository.saveAuthCode(email, generatedCode, expiresAt);

    let emailSent = false;
    if (deps.env.SMTP_HOST && deps.env.SMTP_USER && deps.env.SMTP_PASS) {
      try {
        await deps.emailService.sendOtpCode(email, generatedCode, deps.env.OTP_EXPIRES_MINUTES);
        emailSent = true;
      } catch (err) {
        console.error(`[AUTH] Failed to send OTP email to ${email}:`, err);
      }
    }

    ctx.body = {
      message: emailSent ? "验证码已发送到邮箱，请查收。" : "OTP generated.",
      expiresAt,
      emailSent,
      ...(deps.env.NODE_ENV !== "production" ? { devCode: generatedCode } : {})
    };
  });

  // POST /api/auth/register — 注册（邮箱验证码 + 设置密码）
  router.post("/api/auth/register", async (ctx) => {
    const parsed = registerSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid payload", issues: parsed.error.flatten() };
      return;
    }
    const now = new Date();
    const email = parsed.data.email.trim().toLowerCase();
    const code = parsed.data.code.trim();
    const password = parsed.data.password;

    // 验证 OTP
    const codeAccepted =
      (deps.env.NODE_ENV !== "production" && code === deps.env.OTP_DEV_CODE) ||
      (await deps.repository.consumeAuthCode(email, code, now.toISOString()));

    if (!codeAccepted) {
      ctx.status = 401;
      ctx.body = { message: "Invalid or expired verification code" };
      return;
    }

    // 检查邮箱是否已注册
    const existingUser = await deps.repository.getUserByEmail(email);
    if (existingUser) {
      ctx.status = 409;
      ctx.body = { message: "Email already registered" };
      return;
    }

    // 哈希密码并创建用户
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await deps.repository.createUserWithPassword(email, passwordHash);
    const token = signAuthToken({ userId: user.id, email: user.email }, deps.env);
    ctx.body = {
      token,
      user: {
        id: user.id,
        email: user.email
      }
    };
  });

  // POST /api/auth/login — 登录（邮箱 + 密码）
  router.post("/api/auth/login", async (ctx) => {
    const parsed = loginSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid payload", issues: parsed.error.flatten() };
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    const user = await deps.repository.getUserByEmail(email);
    if (!user || !user.passwordHash) {
      ctx.status = 401;
      ctx.body = { message: "Invalid email or password" };
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      ctx.status = 401;
      ctx.body = { message: "Invalid email or password" };
      return;
    }

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
