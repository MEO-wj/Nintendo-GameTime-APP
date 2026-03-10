import Router from "@koa/router";
import { z } from "zod";
import type { AppDependencies } from "../container.js";
import { createAuthMiddleware, requireAuthUser } from "../middleware/auth.js";

const chartQuerySchema = z.object({
  range: z.enum(["30d"]).default("30d")
});

export function createDashboardRouter(deps: AppDependencies): Router {
  const router = new Router();
  const requireAuth = createAuthMiddleware(deps.env);

  router.get("/api/dashboard/summary", requireAuth, async (ctx) => {
    const authUser = requireAuthUser(ctx.state);
    const summary = await deps.playtimeService.getDashboardSummary(authUser.userId);
    ctx.body = summary;
  });

  router.get("/api/dashboard/charts", requireAuth, async (ctx) => {
    const parsed = chartQuerySchema.safeParse(ctx.query);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid query", issues: parsed.error.flatten() };
      return;
    }
    const authUser = requireAuthUser(ctx.state);
    const charts = await deps.playtimeService.getDashboardCharts(authUser.userId, parsed.data.range);
    ctx.body = charts;
  });

  return router;
}
