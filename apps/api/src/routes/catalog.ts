import Router from "@koa/router";
import { z } from "zod";
import type { AppDependencies } from "../container.js";
import { createAuthMiddleware, requireAuthUser } from "../middleware/auth.js";
import { getCriticScore } from "../services/criticScoreData.js";

const listQuerySchema = z.object({
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(12)
});

const detailParamsSchema = z.object({
  externalId: z.string().min(1)
});

const gameRatingSchema = z.object({
  score: z.coerce.number().min(0.1).max(10).refine((value) => Number.isInteger(value * 10), {
    message: "Score must use 0.1 increments"
  })
});

function isInternalRequest(ctx: Router.RouterContext, internalToken: string): boolean {
  const token = ctx.headers["x-internal-token"];
  return typeof token === "string" && token === internalToken;
}

export function createCatalogRouter(deps: AppDependencies): Router {
  const router = new Router();
  const requireAuth = createAuthMiddleware(deps.env);

  router.get("/api/catalog/games", requireAuth, async (ctx) => {
    const parsed = listQuerySchema.safeParse(ctx.query);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid query", issues: parsed.error.flatten() };
      return;
    }

    const authUser = requireAuthUser(ctx.state);
    const [catalog, ownedGames] = await Promise.all([
      deps.catalogService.listCatalog({
        query: parsed.data.q,
        cursor: parsed.data.cursor,
        limit: parsed.data.limit
      }),
      deps.repository.listGamesByUserId(authUser.userId)
    ]);

    const ownedByExternalId = new Map(
      ownedGames.map((game) => [game.externalId, { gameId: game.id, ownedAt: game.ownedAt }])
    );

    ctx.body = {
      items: catalog.items.map((item) => {
        const owned = ownedByExternalId.get(item.externalId);
        return {
          ...item,
          isOwned: Boolean(owned),
          ownedGameId: owned?.gameId ?? null,
          ownedAt: owned?.ownedAt ?? null
        };
      }),
      nextCursor: catalog.nextCursor,
      totalCount: catalog.totalCount
    };
  });

  router.get("/api/catalog/games/:externalId", requireAuth, async (ctx) => {
    const parsed = detailParamsSchema.safeParse(ctx.params);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid params", issues: parsed.error.flatten() };
      return;
    }

    const authUser = requireAuthUser(ctx.state);
    const [catalogGame, ownedGames, playerRating] = await Promise.all([
      deps.catalogService.getCatalogGame(parsed.data.externalId),
      deps.repository.listGamesByUserId(authUser.userId),
      deps.playtimeService.getPlayerRatingByExternalId(authUser.userId, parsed.data.externalId)
    ]);

    if (!catalogGame) {
      ctx.status = 404;
      ctx.body = { message: "Catalog game not found" };
      return;
    }

    const ownedGame = ownedGames.find((entry) => entry.externalId === parsed.data.externalId) ?? null;
    const [effectivePlaytime, corrections] = ownedGame
      ? await Promise.all([
          deps.playtimeService.getEffectiveByGameId(authUser.userId, ownedGame.id),
          deps.playtimeService.listCorrections(authUser.userId, ownedGame.id)
        ])
      : [null, []];

    ctx.body = {
      ...catalogGame,
      criticScore: getCriticScore(parsed.data.externalId),
      playerRating,
      ownedGame: ownedGame
        ? {
            id: ownedGame.id,
            externalId: ownedGame.externalId,
            title: ownedGame.title,
            coverUrl: ownedGame.coverUrl,
            ownedAt: ownedGame.ownedAt,
            lastPlayedAt: ownedGame.lastPlayedAt,
            priceAmount: ownedGame.priceJpy,
            priceCurrency: "USD",
            effectivePlaytime,
            localizations: catalogGame.localizations
          }
        : null,
      corrections
    };
  });

  router.put("/api/catalog/games/:externalId/rating", requireAuth, async (ctx) => {
    const parsedParams = detailParamsSchema.safeParse(ctx.params);
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
    const catalogGame = await deps.catalogService.getCatalogGame(parsedParams.data.externalId);
    if (!catalogGame) {
      ctx.status = 404;
      ctx.body = { message: "Catalog game not found" };
      return;
    }

    const rating = await deps.playtimeService.rateGameByExternalId({
      userId: authUser.userId,
      externalId: parsedParams.data.externalId,
      score: parsedBody.data.score
    });
    ctx.body = { rating };
  });

  router.get("/api/catalog/status", requireAuth, async (ctx) => {
    const status = await deps.catalogService.getCatalogStatus();
    ctx.body = { status };
  });

  router.post("/api/internal/catalog/refresh", async (ctx) => {
    if (!isInternalRequest(ctx, deps.env.INTERNAL_SYNC_TOKEN)) {
      ctx.status = 401;
      ctx.body = { message: "Unauthorized internal call" };
      return;
    }

    const result = await deps.catalogService.refreshCatalog();
    ctx.body = { result };
  });

  return router;
}
