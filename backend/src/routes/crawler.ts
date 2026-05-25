import Router from "@koa/router";
import type { AppDependencies } from "../container.js";

function isInternalRequest(ctx: Router.RouterContext, internalToken: string): boolean {
  const token = ctx.headers["x-internal-token"];
  return typeof token === "string" && token === internalToken;
}

export function createCrawlerRouter(deps: AppDependencies): Router {
  const router = new Router();

  router.post("/api/internal/crawler/discover", async (ctx) => {
    if (!isInternalRequest(ctx, deps.env.INTERNAL_SYNC_TOKEN)) {
      ctx.status = 401;
      ctx.body = { message: "Unauthorized internal call" };
      return;
    }

    const result = await deps.eshopCrawlerService.discoverNewGames();
    ctx.body = { result };
  });

  router.post("/api/internal/crawler/prices", async (ctx) => {
    if (!isInternalRequest(ctx, deps.env.INTERNAL_SYNC_TOKEN)) {
      ctx.status = 401;
      ctx.body = { message: "Unauthorized internal call" };
      return;
    }

    const result = await deps.eshopCrawlerService.refreshStalePrices();
    ctx.body = { result };
  });

  router.get("/api/internal/crawler/status", async (ctx) => {
    if (!isInternalRequest(ctx, deps.env.INTERNAL_SYNC_TOKEN)) {
      ctx.status = 401;
      ctx.body = { message: "Unauthorized internal call" };
      return;
    }

    const status = await deps.eshopCrawlerService.getCrawlerStatus();
    ctx.body = { status };
  });

  return router;
}
