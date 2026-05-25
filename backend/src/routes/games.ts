import Router from "@koa/router";
import { z } from "zod";
import type { AppDependencies } from "../container.js";
import { createAuthMiddleware, requireAuthUser } from "../middleware/auth.js";

const querySchema = z.object({
  tab: z.enum(["owned", "recent", "top"]).default("owned"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const gameParamsSchema = z.object({
  id: z.string().min(1)
});

const addToLibrarySchema = z.object({
  externalId: z.string().min(1)
});

const gameRatingSchema = z.object({
  score: z.coerce.number().min(0.1).max(10).refine((value) => Number.isInteger(value * 10), {
    message: "Score must use 0.1 increments"
  })
});

export function createGamesRouter(deps: AppDependencies): Router {
  const router = new Router();
  const requireAuth = createAuthMiddleware(deps.env, deps.repository);

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

  router.get("/api/games/:id", requireAuth, async (ctx) => {
    const parsed = gameParamsSchema.safeParse(ctx.params);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid params", issues: parsed.error.flatten() };
      return;
    }

    const authUser = requireAuthUser(ctx.state);
    const detail = await deps.playtimeService.getGameDetail(authUser.userId, parsed.data.id);
    if (!detail) {
      ctx.status = 404;
      ctx.body = { message: "Game not found" };
      return;
    }

    ctx.body = detail;
  });

  router.put("/api/games/:id/rating", requireAuth, async (ctx) => {
    const parsedParams = gameParamsSchema.safeParse(ctx.params);
    const parsedBody = gameRatingSchema.safeParse(ctx.request.body);
    if (!parsedParams.success || !parsedBody.success) {
      ctx.status = 400;
      ctx.body = {
        message: "Invalid payload",
        issues: {
          params: parsedParams.success ? undefined : parsedParams.error.flatten(),
          body: parsedBody.success ? undefined : parsedBody.error.flatten()
        }
      };
      return;
    }

    const authUser = requireAuthUser(ctx.state);
    try {
      const rating = await deps.playtimeService.rateGame({
        userId: authUser.userId,
        gameId: parsedParams.data.id,
        score: parsedBody.data.score
      });
      ctx.body = { rating };
    } catch (error) {
      if (error instanceof Error && error.message === "Game not found") {
        ctx.status = 404;
        ctx.body = { message: error.message };
        return;
      }
      throw error;
    }
  });

  router.post("/api/games/library", requireAuth, async (ctx) => {
    const parsed = addToLibrarySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid payload", issues: parsed.error.flatten() };
      return;
    }

    const authUser = requireAuthUser(ctx.state);
    const detail = await deps.playtimeService.addGameToLibrary({
      userId: authUser.userId,
      externalId: parsed.data.externalId
    });

    ctx.status = 201;
    ctx.body = detail;
  });

  router.delete("/api/games/:id", requireAuth, async (ctx) => {
    const parsed = gameParamsSchema.safeParse(ctx.params);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid params", issues: parsed.error.flatten() };
      return;
    }

    const authUser = requireAuthUser(ctx.state);
    const removed = await deps.playtimeService.removeGameFromLibrary({
      userId: authUser.userId,
      gameId: parsed.data.id
    });

    if (!removed) {
      ctx.status = 404;
      ctx.body = { message: "Game not found" };
      return;
    }

    ctx.status = 204;
  });

  return router;
}
