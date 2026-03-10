import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";
import cors from "@koa/cors";
import type { AppDependencies } from "./container.js";
import { createAppDependencies } from "./container.js";
import { errorHandlerMiddleware } from "./middleware/errorHandler.js";
import type { AppState } from "./types/koa.js";
import { createAuthRouter } from "./routes/auth.js";
import { createAccountsRouter } from "./routes/accounts.js";
import { createSyncRouter } from "./routes/sync.js";
import { createDashboardRouter } from "./routes/dashboard.js";
import { createGamesRouter } from "./routes/games.js";
import { createCorrectionsRouter } from "./routes/corrections.js";

export async function createApp(input?: {
  deps?: AppDependencies;
}): Promise<{ app: Koa<AppState>; deps: AppDependencies }> {
  const deps = input?.deps ?? (await createAppDependencies());
  const app = new Koa<AppState>();
  const root = new Router();

  app.use(errorHandlerMiddleware);
  app.use(
    cors({
      origin: "*"
    })
  );
  app.use(bodyParser());

  app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    ctx.set("X-Response-Time", `${Date.now() - start}ms`);
  });

  root.get("/healthz", (ctx) => {
    ctx.body = {
      status: "ok",
      time: new Date().toISOString()
    };
  });

  const authRouter = createAuthRouter(deps);
  const accountsRouter = createAccountsRouter(deps);
  const syncRouter = createSyncRouter(deps);
  const dashboardRouter = createDashboardRouter(deps);
  const gamesRouter = createGamesRouter(deps);
  const correctionsRouter = createCorrectionsRouter(deps);

  app.use(root.routes()).use(root.allowedMethods());
  app.use(authRouter.routes()).use(authRouter.allowedMethods());
  app.use(accountsRouter.routes()).use(accountsRouter.allowedMethods());
  app.use(syncRouter.routes()).use(syncRouter.allowedMethods());
  app.use(dashboardRouter.routes()).use(dashboardRouter.allowedMethods());
  app.use(gamesRouter.routes()).use(gamesRouter.allowedMethods());
  app.use(correctionsRouter.routes()).use(correctionsRouter.allowedMethods());

  return { app, deps };
}
