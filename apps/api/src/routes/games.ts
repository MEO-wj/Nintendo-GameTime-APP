import Router from "@koa/router";
import { z } from "zod";
import type { AppDependencies } from "../container.js";
import { createAuthMiddleware, requireAuthUser } from "../middleware/auth.js";

const querySchema = z.object({
  tab: z.enum(["owned", "recent", "top"]).default("owned"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export function createGamesRouter(deps: AppDependencies): Router {
  const router = new Router();
  const requireAuth = createAuthMiddleware(deps.env);

  router.get("/api/games", requireAuth, async (ctx) => {
    const parsed = querySchema.safeParse(ctx.query);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid query", issues: parsed.error.flatten() };
      return;
    }
    const authUser = requireAuthUser(ctx.state);
    const result = await deps.playtimeService.listGames({
      userId: authUser.userId,
      tab: parsed.data.tab,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit
    });
    ctx.body = result;
  });

  return router;
}
