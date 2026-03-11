import Router from "@koa/router";
import { z } from "zod";
import type { AppDependencies } from "../container.js";
import { createAuthMiddleware, requireAuthUser } from "../middleware/auth.js";

const listQuerySchema = z.object({
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(24).default(12)
});

const detailParamsSchema = z.object({
  externalId: z.string().min(1)
});

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
      nextCursor: catalog.nextCursor
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
    const [catalogGame, ownedGames] = await Promise.all([
      deps.catalogService.getCatalogGame(parsed.data.externalId),
      deps.repository.listGamesByUserId(authUser.userId)
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
            effectivePlaytime
          }
        : null,
      corrections
    };
  });

  return router;
}
