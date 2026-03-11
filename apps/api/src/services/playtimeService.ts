import {
  calculateEffectivePlaytimeMap,
  type EffectivePlaytime,
  type PlaytimeCorrection
} from "@nintendo-gametime/shared-types";
import type { Repository } from "../repositories/types.js";
import type { CatalogGame, CatalogLocalizations, CatalogService } from "./catalogService.js";
import { decodeCursor, encodeCursor } from "../utils/pagination.js";

export type GamesTab = "owned" | "recent" | "top";

export interface DashboardSummary {
  totalGames: number;
  totalMinutes: number;
  totalPriceAmount: number;
  priceCurrency: string;
  lastSyncAt: string | null;
  recent30Minutes: number;
  dataSource: { official: number; corrected: number; "manual-only": number };
}

export interface DashboardCharts {
  donut: Array<{ name: string; value: number; gameId: string }>;
  ranking: Array<{ gameId: string; name: string; minutes: number }>;
}

export interface ListedGame {
  id: string;
  externalId: string;
  title: string;
  coverUrl: string | null;
  ownedAt: string | null;
  lastPlayedAt: string | null;
  priceAmount: number | null;
  priceCurrency: string;
  effectivePlaytime: EffectivePlaytime;
  localizations: CatalogLocalizations;
}

export interface GameDetail extends ListedGame {
  description: string | null;
  publisher: string | null;
  releaseDate: string | null;
  storeUrl: string | null;
  platform: "Switch";
  region: "JP" | "GLOBAL" | "UNKNOWN";
  corrections: PlaytimeCorrection[];
}

export interface PlaytimeService {
  getDashboardSummary(userId: string): Promise<DashboardSummary>;
  getDashboardCharts(userId: string, range: "30d"): Promise<DashboardCharts>;
  listGames(input: {
    userId: string;
    tab: GamesTab;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: ListedGame[]; nextCursor: string | null }>;
  getGameDetail(userId: string, gameId: string): Promise<GameDetail | null>;
  addGameToLibrary(input: { userId: string; externalId: string }): Promise<GameDetail>;
  removeGameFromLibrary(input: { userId: string; gameId: string }): Promise<boolean>;
  listCorrections(userId: string, gameId?: string): Promise<PlaytimeCorrection[]>;
  createCorrection(input: {
    userId: string;
    gameId: string;
    type: "SET_TOTAL" | "ADD_DELTA";
    minutes: number;
    reason: string;
  }): Promise<PlaytimeCorrection>;
  revokeCorrection(input: {
    userId: string;
    correctionId: string;
  }): Promise<PlaytimeCorrection | null>;
  getEffectiveByGameId(userId: string, gameId: string): Promise<EffectivePlaytime | null>;
}

function withinLastDays(timestamp: string | null, days: number): boolean {
  if (!timestamp) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return Date.parse(timestamp) >= cutoff;
}

export function createPlaytimeService(repository: Repository, catalogService: CatalogService): PlaytimeService {
  async function buildEffectiveMap(userId: string): Promise<{
    games: Awaited<ReturnType<Repository["listGamesByUserId"]>>;
    effectiveMap: Record<string, EffectivePlaytime>;
  }> {
    const [games, latestSnapshots, corrections] = await Promise.all([
      repository.listGamesByUserId(userId),
      repository.getLatestOfficialSnapshotsByUserId(userId),
      repository.listCorrectionsByUserId(userId)
    ]);

    const officialMinutesByGame: Record<string, number | null> = {};
    for (const game of games) {
      officialMinutesByGame[game.id] = null;
    }
    for (const snapshot of latestSnapshots) {
      officialMinutesByGame[snapshot.gameId] = snapshot.playedMinutes;
    }

    const correctionsByGame: Record<string, PlaytimeCorrection[]> = {};
    for (const correction of corrections) {
      if (!correctionsByGame[correction.gameId]) {
        correctionsByGame[correction.gameId] = [];
      }
      correctionsByGame[correction.gameId].push({
        id: correction.id,
        userId: correction.userId,
        gameId: correction.gameId,
        type: correction.type,
        minutes: correction.minutes,
        reason: correction.reason,
        createdAt: correction.createdAt,
        revokedAt: correction.revokedAt
      });
    }

    return {
      games,
      effectiveMap: calculateEffectivePlaytimeMap({
        officialMinutesByGame,
        correctionsByGame
      })
    };
  }

  function mapListedGame(
    game: Awaited<ReturnType<Repository["listGamesByUserId"]>>[number],
    effectiveMap: Record<string, EffectivePlaytime>,
    catalogGame?: CatalogGame | null
  ): ListedGame {
    return {
      id: game.id,
      externalId: game.externalId,
      title: game.title,
      coverUrl: game.coverUrl,
      ownedAt: game.ownedAt,
      lastPlayedAt: game.lastPlayedAt,
      priceAmount: game.priceJpy,
      priceCurrency: "USD",
      effectivePlaytime: effectiveMap[game.id],
      localizations: catalogGame?.localizations ?? {}
    };
  }

  async function buildCatalogMap(externalIds: string[]): Promise<Map<string, CatalogGame | null>> {
    const uniqueExternalIds = [...new Set(externalIds)];
    const entries = await Promise.all(
      uniqueExternalIds.map(async (externalId) => [externalId, await catalogService.getCatalogGame(externalId)] as const)
    );
    return new Map(entries);
  }

  return {
    async getDashboardSummary(userId: string) {
      const [state, account] = await Promise.all([
        buildEffectiveMap(userId),
        repository.getNintendoAccountByUserId(userId)
      ]);
      const totalGames = state.games.length;
      const totalMinutes = state.games.reduce(
        (acc, game) => acc + (state.effectiveMap[game.id]?.totalMinutes ?? 0),
        0
      );
      const totalPriceAmount = state.games.reduce((acc, game) => acc + (game.priceJpy ?? 0), 0);
      const recent30Minutes = state.games
        .filter((game) => withinLastDays(game.lastPlayedAt, 30))
        .reduce((acc, game) => acc + (state.effectiveMap[game.id]?.totalMinutes ?? 0), 0);
      const mutableSource = {
        official: 0,
        corrected: 0,
        "manual-only": 0
      };
      for (const game of state.games) {
        const source = (state.effectiveMap[game.id]?.source ?? "official") as
          | "official"
          | "corrected"
          | "manual-only";
        mutableSource[source] += 1;
      }

      return {
        totalGames,
        totalMinutes,
        totalPriceAmount,
        priceCurrency: "USD",
        lastSyncAt: account?.lastSyncAt ?? null,
        recent30Minutes,
        dataSource: mutableSource
      };
    },

    async getDashboardCharts(userId: string, _range: "30d") {
      const state = await buildEffectiveMap(userId);
      const sorted = [...state.games].sort(
        (a, b) => (state.effectiveMap[b.id]?.totalMinutes ?? 0) - (state.effectiveMap[a.id]?.totalMinutes ?? 0)
      );
      const ranking = sorted.slice(0, 10).map((game) => ({
        gameId: game.id,
        name: game.title,
        minutes: state.effectiveMap[game.id]?.totalMinutes ?? 0
      }));
      const donut = ranking.slice(0, 5).map((entry) => ({
        name: entry.name,
        value: entry.minutes,
        gameId: entry.gameId
      }));
      return { donut, ranking };
    },

    async listGames(input: {
      userId: string;
      tab: GamesTab;
      cursor?: string;
      limit?: number;
    }) {
      const state = await buildEffectiveMap(input.userId);
      const offset = decodeCursor(input.cursor);
      const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

      const sorted = [...state.games];
      if (input.tab === "owned") {
        sorted.sort(
          (a, b) => Date.parse(b.ownedAt ?? "1970-01-01T00:00:00.000Z") - Date.parse(a.ownedAt ?? "1970-01-01T00:00:00.000Z")
        );
      } else if (input.tab === "recent") {
        sorted.sort(
          (a, b) =>
            Date.parse(b.lastPlayedAt ?? "1970-01-01T00:00:00.000Z") -
            Date.parse(a.lastPlayedAt ?? "1970-01-01T00:00:00.000Z")
        );
      } else {
        sorted.sort(
          (a, b) => (state.effectiveMap[b.id]?.totalMinutes ?? 0) - (state.effectiveMap[a.id]?.totalMinutes ?? 0)
        );
      }

      const page = sorted.slice(offset, offset + limit);
      const nextOffset = offset + limit < sorted.length ? offset + limit : null;
      const catalogMap = await buildCatalogMap(page.map((game) => game.externalId));
      const items = page.map((game) => mapListedGame(game, state.effectiveMap, catalogMap.get(game.externalId)));
      return {
        items,
        nextCursor: nextOffset === null ? null : encodeCursor(nextOffset)
      };
    },

    async getGameDetail(userId: string, gameId: string) {
      const [state, game] = await Promise.all([
        buildEffectiveMap(userId),
        repository.getGameById(userId, gameId)
      ]);
      if (!game) return null;

      const [catalogGame, corrections] = await Promise.all([
        catalogService.getCatalogGame(game.externalId),
        repository.listCorrectionsByUserId(userId, game.id)
      ]);

      return {
        ...mapListedGame(game, state.effectiveMap, catalogGame),
        description: catalogGame?.description ?? null,
        publisher: catalogGame?.publisher ?? null,
        releaseDate: catalogGame?.releaseDate ?? null,
        storeUrl: catalogGame?.storeUrl ?? null,
        platform: game.platform,
        region: game.region,
        corrections: corrections.map((row) => ({
          id: row.id,
          userId: row.userId,
          gameId: row.gameId,
          type: row.type,
          minutes: row.minutes,
          reason: row.reason,
          createdAt: row.createdAt,
          revokedAt: row.revokedAt
        }))
      };
    },

    async addGameToLibrary(input: { userId: string; externalId: string }) {
      const catalogGame = await catalogService.getCatalogGame(input.externalId);
      if (!catalogGame) {
        throw new Error("Catalog game not found");
      }

      const now = new Date().toISOString();
      const game = await repository.upsertGame({
        userId: input.userId,
        externalId: catalogGame.externalId,
        title: catalogGame.title,
        coverUrl: catalogGame.coverUrl,
        region: "GLOBAL",
        platform: "Switch",
        priceJpy: catalogGame.priceAmount,
        ownedAt: now,
        lastPlayedAt: null
      });

      await repository.insertAuditLog({
        userId: input.userId,
        action: "game_added_to_library",
        details: {
          gameId: game.id,
          externalId: catalogGame.externalId
        },
        createdAt: now
      });

      const detail = await this.getGameDetail(input.userId, game.id);
      if (!detail) {
        throw new Error("Game detail unavailable");
      }
      return detail;
    },

    async removeGameFromLibrary(input: { userId: string; gameId: string }) {
      const deletedAt = new Date().toISOString();
      const removed = await repository.removeGame(input.userId, input.gameId, deletedAt);
      if (!removed) return false;

      await repository.insertAuditLog({
        userId: input.userId,
        action: "game_removed_from_library",
        details: {
          gameId: removed.id,
          externalId: removed.externalId
        },
        createdAt: deletedAt
      });

      return true;
    },

    async listCorrections(userId: string, gameId?: string) {
      const rows = await repository.listCorrectionsByUserId(userId, gameId);
      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        gameId: row.gameId,
        type: row.type,
        minutes: row.minutes,
        reason: row.reason,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt
      }));
    },

    async createCorrection(input: {
      userId: string;
      gameId: string;
      type: "SET_TOTAL" | "ADD_DELTA";
      minutes: number;
      reason: string;
    }) {
      const game = await repository.getGameById(input.userId, input.gameId);
      if (!game) {
        throw new Error("Game not found");
      }
      const createdAt = new Date().toISOString();
      const row = await repository.createCorrection({
        userId: input.userId,
        gameId: input.gameId,
        type: input.type,
        minutes: input.minutes,
        reason: input.reason,
        createdAt
      });
      await repository.insertAuditLog({
        userId: input.userId,
        action: "playtime_correction_created",
        details: {
          correctionId: row.id,
          gameId: row.gameId,
          type: row.type,
          minutes: row.minutes
        },
        createdAt
      });
      return {
        id: row.id,
        userId: row.userId,
        gameId: row.gameId,
        type: row.type,
        minutes: row.minutes,
        reason: row.reason,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt
      };
    },

    async revokeCorrection(input: { userId: string; correctionId: string }) {
      const revokedAt = new Date().toISOString();
      const row = await repository.revokeCorrection(input.userId, input.correctionId, revokedAt);
      if (!row) return null;
      await repository.insertAuditLog({
        userId: input.userId,
        action: "playtime_correction_revoked",
        details: {
          correctionId: row.id,
          gameId: row.gameId
        },
        createdAt: revokedAt
      });
      return {
        id: row.id,
        userId: row.userId,
        gameId: row.gameId,
        type: row.type,
        minutes: row.minutes,
        reason: row.reason,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt
      };
    },

    async getEffectiveByGameId(userId: string, gameId: string) {
      const state = await buildEffectiveMap(userId);
      return state.effectiveMap[gameId] ?? null;
    }
  };
}
