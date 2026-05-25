import { decryptText } from "../utils/crypto.js";
import type { Repository } from "../repositories/types.js";
import type { AppEnv } from "../config/env.js";
import type { NintendoClient } from "./nintendoClient.js";
import type { AlertService } from "./alertService.js";
import type { SyncJobRow } from "../types/domain.js";

export interface SyncService {
  runSyncForUser(userId: string, triggeredBy: SyncJobRow["triggeredBy"]): Promise<{
    syncJob: SyncJobRow;
    syncedGames: number;
  }>;
  runSyncForAllUsers(): Promise<{ attempted: number; succeeded: number; failed: number }>;
  getLatestStatus(userId: string): Promise<SyncJobRow | null>;
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 300);
  }
  return "Unknown sync error";
}

export function createSyncService(input: {
  env: AppEnv;
  repository: Repository;
  nintendoClient: NintendoClient;
  alertService: AlertService;
}): SyncService {
  const { env, repository, nintendoClient, alertService } = input;

  return {
    async runSyncForUser(userId: string, triggeredBy: SyncJobRow["triggeredBy"]) {
      const startedAt = new Date().toISOString();
      const syncJob = await repository.createSyncJob({
        userId,
        status: "RUNNING",
        triggeredBy,
        startedAt
      });

      let accountFailCount = 0;
      try {
        const account = await repository.getNintendoAccountByUserId(userId);
        if (!account) {
          throw new Error("Nintendo account not bound");
        }
        accountFailCount = account.syncFailCount;

        const sessionToken = decryptText(account.encryptedSession, env.ENCRYPTION_KEY);
        const fetchedGames = await nintendoClient.fetchUserGames(sessionToken);
        const capturedAt = new Date().toISOString();

        for (const fetched of fetchedGames) {
          const game = await repository.upsertGame({
            userId,
            externalId: fetched.externalId,
            title: fetched.title,
            coverUrl: fetched.coverUrl,
            region: fetched.region,
            platform: fetched.platform,
            priceJpy: fetched.priceJpy,
            ownedAt: fetched.ownedAt,
            lastPlayedAt: fetched.lastPlayedAt
          });

          await repository.insertOfficialSnapshot({
            userId,
            gameId: game.id,
            playedMinutes: fetched.playedMinutes,
            rawPayload: fetched as unknown as Record<string, unknown>,
            capturedAt
          });
        }

        await repository.updateNintendoSyncState(userId, {
          lastSyncAt: capturedAt,
          syncFailCount: 0
        });
        const finishedAt = new Date().toISOString();
        await repository.updateSyncJob(syncJob.id, {
          status: "SUCCESS",
          finishedAt,
          durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
          errorSummary: null
        });

        return {
          syncJob: {
            ...syncJob,
            status: "SUCCESS",
            finishedAt,
            durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
            errorSummary: null
          },
          syncedGames: fetchedGames.length
        };
      } catch (error) {
        const finishedAt = new Date().toISOString();
        const failCount = accountFailCount + 1;
        await repository.updateNintendoSyncState(userId, { syncFailCount: failCount });
        const summary = summarizeError(error);
        await repository.updateSyncJob(syncJob.id, {
          status: "FAILED",
          finishedAt,
          durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
          errorSummary: summary
        });
        if (failCount >= env.ALERT_FAIL_THRESHOLD) {
          await alertService.notifySyncFailures({
            userId,
            failCount,
            message: summary
          });
        }
        throw error;
      }
    },

    async runSyncForAllUsers() {
      const accounts = await repository.listActiveNintendoAccounts();
      let succeeded = 0;
      let failed = 0;

      for (const account of accounts) {
        try {
          await this.runSyncForUser(account.userId, "SCHEDULED");
          succeeded += 1;
        } catch {
          failed += 1;
        }
      }

      return {
        attempted: accounts.length,
        succeeded,
        failed
      };
    },

    async getLatestStatus(userId: string) {
      return repository.getLatestSyncJobByUserId(userId);
    }
  };
}
