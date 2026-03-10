import Router from "@koa/router";
import type { AppDependencies } from "../container.js";
import { createAuthMiddleware, requireAuthUser } from "../middleware/auth.js";

function isInternalRequest(ctx: Router.RouterContext, internalToken: string): boolean {
  const token = ctx.headers["x-internal-token"];
  return typeof token === "string" && token === internalToken;
}

export function createSyncRouter(deps: AppDependencies): Router {
  const router = new Router();
  const requireAuth = createAuthMiddleware(deps.env);

  router.post("/api/sync/run", requireAuth, async (ctx) => {
    const authUser = requireAuthUser(ctx.state);
    const result = await deps.syncService.runSyncForUser(authUser.userId, "MANUAL");
    ctx.body = {
      syncJob: result.syncJob,
      syncedGames: result.syncedGames
    };
  });

  router.get("/api/sync/status", requireAuth, async (ctx) => {
    const authUser = requireAuthUser(ctx.state);
    const status = await deps.syncService.getLatestStatus(authUser.userId);
    ctx.body = { status };
  });

  router.post("/api/internal/sync/all", async (ctx) => {
    if (!isInternalRequest(ctx, deps.env.INTERNAL_SYNC_TOKEN)) {
      ctx.status = 401;
      ctx.body = { message: "Unauthorized internal call" };
      return;
    }
    const result = await deps.syncService.runSyncForAllUsers();
    ctx.body = result;
  });

  return router;
}
