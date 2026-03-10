import Router from "@koa/router";
import { z } from "zod";
import type { AppDependencies } from "../container.js";
import { createAuthMiddleware, requireAuthUser } from "../middleware/auth.js";

const createSchema = z.object({
  gameId: z.string().min(1),
  type: z.enum(["SET_TOTAL", "ADD_DELTA"]),
  minutes: z.number().int(),
  reason: z.string().min(2).max(240)
});

const listQuerySchema = z.object({
  gameId: z.string().optional()
});

const revokeSchema = z.object({
  id: z.string()
});

export function createCorrectionsRouter(deps: AppDependencies): Router {
  const router = new Router();
  const requireAuth = createAuthMiddleware(deps.env);

  router.post("/api/playtime/corrections", requireAuth, async (ctx) => {
    const parsed = createSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid payload", issues: parsed.error.flatten() };
      return;
    }
    const authUser = requireAuthUser(ctx.state);
    const correction = await deps.playtimeService.createCorrection({
      userId: authUser.userId,
      gameId: parsed.data.gameId,
      type: parsed.data.type,
      minutes: parsed.data.minutes,
      reason: parsed.data.reason
    });
    const effective = await deps.playtimeService.getEffectiveByGameId(authUser.userId, parsed.data.gameId);
    ctx.status = 201;
    ctx.body = {
      correction,
      effectivePlaytime: effective
    };
  });

  router.get("/api/playtime/corrections", requireAuth, async (ctx) => {
    const parsed = listQuerySchema.safeParse(ctx.query);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid query", issues: parsed.error.flatten() };
      return;
    }
    const authUser = requireAuthUser(ctx.state);
    const items = await deps.playtimeService.listCorrections(authUser.userId, parsed.data.gameId);
    ctx.body = { items };
  });

  router.post("/api/playtime/corrections/:id/revoke", requireAuth, async (ctx) => {
    const parsed = revokeSchema.safeParse(ctx.params);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid params", issues: parsed.error.flatten() };
      return;
    }
    const authUser = requireAuthUser(ctx.state);
    const revoked = await deps.playtimeService.revokeCorrection({
      userId: authUser.userId,
      correctionId: parsed.data.id
    });
    if (!revoked) {
      ctx.status = 404;
      ctx.body = { message: "Correction not found" };
      return;
    }
    const effective = await deps.playtimeService.getEffectiveByGameId(authUser.userId, revoked.gameId);
    ctx.body = {
      correction: revoked,
      effectivePlaytime: effective
    };
  });

  return router;
}
