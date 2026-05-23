import Koa, { type Middleware } from "koa";
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
import { createCatalogRouter } from "./routes/catalog.js";

function registerMiddleware(app: Koa<AppState>, middleware: unknown) {
  if (typeof middleware !== "function") {
    throw new TypeError("middleware must be a function");
  }

  // Koa's generator detection trips on this Node/runtime combination.
  app.middleware.push(middleware as Middleware<AppState>);
  return app;
}

export async function createApp(input?: {
  deps?: AppDependencies;
}): Promise<{ app: Koa<AppState>; deps: AppDependencies }> {
  const deps = input?.deps ?? (await createAppDependencies());
  const app = new Koa<AppState>();
  const root = new Router();

  registerMiddleware(app, errorHandlerMiddleware);
  registerMiddleware(
    app,
    cors({
      origin: "*"
    })
  );
  registerMiddleware(app, bodyParser());

  const responseTimeMiddleware: Middleware<AppState> = async (ctx, next) => {
    const start = Date.now();
    await next();
    ctx.set("X-Response-Time", `${Date.now() - start}ms`);
  };
  registerMiddleware(app, responseTimeMiddleware);

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
  const catalogRouter = createCatalogRouter(deps);

  registerMiddleware(app, root.routes());
  registerMiddleware(app, root.allowedMethods());
  registerMiddleware(app, authRouter.routes());
  registerMiddleware(app, authRouter.allowedMethods());
  registerMiddleware(app, accountsRouter.routes());
  registerMiddleware(app, accountsRouter.allowedMethods());
  registerMiddleware(app, syncRouter.routes());
  registerMiddleware(app, syncRouter.allowedMethods());
  registerMiddleware(app, dashboardRouter.routes());
  registerMiddleware(app, dashboardRouter.allowedMethods());
  registerMiddleware(app, gamesRouter.routes());
  registerMiddleware(app, gamesRouter.allowedMethods());
  registerMiddleware(app, correctionsRouter.routes());
  registerMiddleware(app, correctionsRouter.allowedMethods());
  registerMiddleware(app, catalogRouter.routes());
  registerMiddleware(app, catalogRouter.allowedMethods());

  return { app, deps };
}
