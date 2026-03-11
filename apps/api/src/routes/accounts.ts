import Router from "@koa/router";
import { z } from "zod";
import type { AppDependencies } from "../container.js";
import { createAuthMiddleware, requireAuthUser } from "../middleware/auth.js";
import { encryptText } from "../utils/crypto.js";

const bindSchema = z.object({
  sessionToken: z.string().min(8),
  region: z.enum(["JP", "GLOBAL", "UNKNOWN"]).default("JP")
});

const preferenceSchema = z.object({
  marketMode: z.enum(["GLOBAL", "DOMESTIC"])
});

export function createAccountsRouter(deps: AppDependencies): Router {
  const router = new Router();
  const requireAuth = createAuthMiddleware(deps.env);

  router.get("/api/accounts/nintendo", requireAuth, async (ctx) => {
    const authUser = requireAuthUser(ctx.state);
    const account = await deps.repository.getNintendoAccountByUserId(authUser.userId);
    if (!account) {
      ctx.body = { account: null };
      return;
    }

    ctx.body = {
      account: {
        id: account.id,
        userId: account.userId,
        region: account.region,
        lastSyncAt: account.lastSyncAt,
        syncFailCount: account.syncFailCount
      }
    };
  });

  router.get("/api/accounts/preferences", requireAuth, async (ctx) => {
    const authUser = requireAuthUser(ctx.state);
    const [preference, fx] = await Promise.all([
      deps.repository.getUserPreference(authUser.userId),
      deps.marketService.getFxContext()
    ]);

    ctx.body = {
      preference: {
        marketMode: preference?.marketMode ?? "DOMESTIC"
      },
      fx
    };
  });

  router.put("/api/accounts/preferences", requireAuth, async (ctx) => {
    const parsed = preferenceSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid payload", issues: parsed.error.flatten() };
      return;
    }

    const authUser = requireAuthUser(ctx.state);
    const preference = await deps.repository.upsertUserPreference({
      userId: authUser.userId,
      marketMode: parsed.data.marketMode
    });

    await deps.repository.insertAuditLog({
      userId: authUser.userId,
      action: "user_preference_updated",
      details: {
        marketMode: parsed.data.marketMode
      },
      createdAt: new Date().toISOString()
    });

    const fx = await deps.marketService.getFxContext();
    ctx.body = {
      preference: {
        marketMode: preference.marketMode
      },
      fx
    };
  });

  router.post("/api/accounts/nintendo/bind", requireAuth, async (ctx) => {
    const authUser = requireAuthUser(ctx.state);
    const parsed = bindSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { message: "Invalid payload", issues: parsed.error.flatten() };
      return;
    }
    const encryptedSession = encryptText(parsed.data.sessionToken, deps.env.ENCRYPTION_KEY);
    const account = await deps.repository.upsertNintendoAccount({
      userId: authUser.userId,
      encryptedSession,
      region: parsed.data.region
    });
    await deps.repository.insertAuditLog({
      userId: authUser.userId,
      action: "nintendo_account_bound",
      details: {
        region: parsed.data.region
      },
      createdAt: new Date().toISOString()
    });

    try {
      const syncResult = await deps.syncService.runSyncForUser(authUser.userId, "BIND");
      ctx.body = {
        account: {
          id: account.id,
          userId: account.userId,
          region: account.region,
          lastSyncAt: syncResult.syncJob.finishedAt
        },
        sync: {
          status: syncResult.syncJob.status,
          syncedGames: syncResult.syncedGames
        }
      };
      return;
    } catch (error) {
      ctx.status = 202;
      ctx.body = {
        account: {
          id: account.id,
          userId: account.userId,
          region: account.region
        },
        sync: {
          status: "FAILED",
          message: error instanceof Error ? error.message : "Failed to sync on bind"
        }
      };
    }
  });

  return router;
}
