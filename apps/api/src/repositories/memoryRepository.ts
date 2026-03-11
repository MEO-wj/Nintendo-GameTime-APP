import { randomUUID } from "node:crypto";
import type { CorrectionType } from "@nintendo-gametime/shared-types";
import type { Repository } from "./types.js";
import type {
  AuditLogRow,
  AuthCode,
  CatalogGameRow,
  CatalogLocalizationsRow,
  CorrectionRow,
  GameRow,
  NintendoAccount,
  OfficialSnapshotRow,
  SyncJobRow,
  User,
  UserPreference
} from "../types/domain.js";

export class MemoryRepository implements Repository {
  private users = new Map<string, User>();
  private usersByEmail = new Map<string, User>();
  private userPreferences = new Map<string, UserPreference>();
  private authCodes = new Map<string, AuthCode>();
  private nintendoAccounts = new Map<string, NintendoAccount>();
  private games = new Map<string, GameRow>();
  private catalogGames = new Map<string, CatalogGameRow>();
  private snapshots = new Map<string, OfficialSnapshotRow>();
  private corrections = new Map<string, CorrectionRow>();
  private syncJobs = new Map<string, SyncJobRow>();
  private auditLogs = new Map<string, AuditLogRow>();

  async upsertUserByEmail(email: string): Promise<User> {
    const normalized = email.trim().toLowerCase();
    const existing = this.usersByEmail.get(normalized);
    if (existing) return existing;
    const user: User = {
      id: randomUUID(),
      email: normalized,
      createdAt: new Date().toISOString()
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(normalized, user);
    return user;
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.users.get(userId) ?? null;
  }

  async getUserPreference(userId: string): Promise<UserPreference | null> {
    return this.userPreferences.get(userId) ?? null;
  }

  async upsertUserPreference(input: {
    userId: string;
    marketMode: "GLOBAL" | "DOMESTIC";
  }): Promise<UserPreference> {
    const now = new Date().toISOString();
    const existing = this.userPreferences.get(input.userId);
    if (existing) {
      existing.marketMode = input.marketMode;
      existing.updatedAt = now;
      this.userPreferences.set(input.userId, existing);
      return existing;
    }

    const row: UserPreference = {
      userId: input.userId,
      marketMode: input.marketMode,
      createdAt: now,
      updatedAt: now
    };
    this.userPreferences.set(input.userId, row);
    return row;
  }

  async saveAuthCode(email: string, code: string, expiresAt: string): Promise<void> {
    const id = randomUUID();
    const row: AuthCode = {
      id,
      email: email.trim().toLowerCase(),
      code,
      expiresAt,
      consumedAt: null,
      createdAt: new Date().toISOString()
    };
    this.authCodes.set(id, row);
  }

  async consumeAuthCode(email: string, code: string, now: string): Promise<boolean> {
    const normalized = email.trim().toLowerCase();
    const matched = [...this.authCodes.values()]
      .filter((entry) => entry.email === normalized && entry.code === code && !entry.consumedAt)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    if (!matched) return false;
    if (Date.parse(matched.expiresAt) < Date.parse(now)) return false;
    matched.consumedAt = now;
    this.authCodes.set(matched.id, matched);
    return true;
  }

  async upsertNintendoAccount(input: {
    userId: string;
    encryptedSession: string;
    region: "JP" | "GLOBAL" | "UNKNOWN";
  }): Promise<NintendoAccount> {
    const now = new Date().toISOString();
    const existing = this.nintendoAccounts.get(input.userId);
    if (existing) {
      existing.encryptedSession = input.encryptedSession;
      existing.region = input.region;
      existing.updatedAt = now;
      existing.deletedAt = null;
      this.nintendoAccounts.set(existing.userId, existing);
      return existing;
    }
    const account: NintendoAccount = {
      id: randomUUID(),
      userId: input.userId,
      encryptedSession: input.encryptedSession,
      region: input.region,
      lastSyncAt: null,
      syncFailCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    this.nintendoAccounts.set(input.userId, account);
    return account;
  }

  async getNintendoAccountByUserId(userId: string): Promise<NintendoAccount | null> {
    const account = this.nintendoAccounts.get(userId);
    if (!account || account.deletedAt) return null;
    return account;
  }

  async listActiveNintendoAccounts(): Promise<NintendoAccount[]> {
    return [...this.nintendoAccounts.values()].filter((entry) => !entry.deletedAt);
  }

  async updateNintendoSyncState(userId: string, input: { lastSyncAt?: string; syncFailCount?: number }): Promise<void> {
    const account = this.nintendoAccounts.get(userId);
    if (!account) return;
    if (typeof input.lastSyncAt !== "undefined") {
      account.lastSyncAt = input.lastSyncAt;
    }
    if (typeof input.syncFailCount !== "undefined") {
      account.syncFailCount = input.syncFailCount;
    }
    account.updatedAt = new Date().toISOString();
    this.nintendoAccounts.set(userId, account);
  }

  async upsertGame(input: {
    userId: string;
    externalId: string;
    title: string;
    coverUrl: string | null;
    region: "JP" | "GLOBAL" | "UNKNOWN";
    platform: "Switch";
    priceJpy: number | null;
    ownedAt: string | null;
    lastPlayedAt: string | null;
  }): Promise<GameRow> {
    const now = new Date().toISOString();
    const existing = [...this.games.values()].find(
      (entry) => entry.userId === input.userId && entry.externalId === input.externalId
    );
    if (existing) {
      existing.title = input.title;
      existing.coverUrl = input.coverUrl;
      existing.region = input.region;
      existing.platform = input.platform;
      existing.priceJpy = input.priceJpy;
      existing.ownedAt = input.ownedAt;
      existing.lastPlayedAt = input.lastPlayedAt;
      existing.updatedAt = now;
      existing.deletedAt = null;
      this.games.set(existing.id, existing);
      return existing;
    }
    const row: GameRow = {
      id: randomUUID(),
      userId: input.userId,
      externalId: input.externalId,
      title: input.title,
      coverUrl: input.coverUrl,
      region: input.region,
      platform: input.platform,
      priceJpy: input.priceJpy,
      ownedAt: input.ownedAt,
      lastPlayedAt: input.lastPlayedAt,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    this.games.set(row.id, row);
    return row;
  }

  async getGameById(userId: string, gameId: string): Promise<GameRow | null> {
    const row = this.games.get(gameId);
    if (!row || row.userId !== userId || row.deletedAt) return null;
    return row;
  }

  async listGamesByUserId(userId: string): Promise<GameRow[]> {
    return [...this.games.values()].filter((entry) => entry.userId === userId && !entry.deletedAt);
  }

  async listGamesPaginatedByUserId(userId: string, input: { offset: number; limit: number }) {
    const sorted = [...this.games.values()]
      .filter((entry) => entry.userId === userId && !entry.deletedAt)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const items = sorted.slice(input.offset, input.offset + input.limit);
    const nextOffset = input.offset + input.limit < sorted.length ? input.offset + input.limit : null;
    return { items, nextOffset };
  }

  async removeGame(userId: string, gameId: string, deletedAt: string): Promise<GameRow | null> {
    const row = this.games.get(gameId);
    if (!row || row.userId !== userId || row.deletedAt) return null;
    row.deletedAt = deletedAt;
    row.updatedAt = deletedAt;
    this.games.set(row.id, row);
    return row;
  }

  async upsertCatalogGame(input: {
    externalId: string;
    sortOrder: number;
    title: string;
    coverUrl: string | null;
    storeUrl: string;
    description: string | null;
    publisher: string | null;
    releaseDate: string | null;
    priceAmount: number | null;
    priceCurrency: string;
    platform: "Switch";
    region: "GLOBAL";
    source: string;
    localizations: CatalogLocalizationsRow;
    lastSyncedAt: string;
  }): Promise<CatalogGameRow> {
    const existing = this.catalogGames.get(input.externalId);
    const now = new Date().toISOString();

    if (existing) {
      existing.sortOrder = input.sortOrder;
      existing.title = input.title;
      existing.coverUrl = input.coverUrl;
      existing.storeUrl = input.storeUrl;
      existing.description = input.description;
      existing.publisher = input.publisher;
      existing.releaseDate = input.releaseDate;
      existing.priceAmount = input.priceAmount;
      existing.priceCurrency = input.priceCurrency;
      existing.platform = input.platform;
      existing.region = input.region;
      existing.source = input.source;
      existing.localizations = input.localizations;
      existing.lastSyncedAt = input.lastSyncedAt;
      existing.updatedAt = now;
      this.catalogGames.set(input.externalId, existing);
      return existing;
    }

    const row: CatalogGameRow = {
      id: randomUUID(),
      externalId: input.externalId,
      sortOrder: input.sortOrder,
      title: input.title,
      coverUrl: input.coverUrl,
      storeUrl: input.storeUrl,
      description: input.description,
      publisher: input.publisher,
      releaseDate: input.releaseDate,
      priceAmount: input.priceAmount,
      priceCurrency: input.priceCurrency,
      platform: input.platform,
      region: input.region,
      source: input.source,
      localizations: input.localizations,
      lastSyncedAt: input.lastSyncedAt,
      createdAt: now,
      updatedAt: now
    };
    this.catalogGames.set(input.externalId, row);
    return row;
  }

  async getCatalogGameByExternalId(externalId: string): Promise<CatalogGameRow | null> {
    return this.catalogGames.get(externalId) ?? null;
  }

  async listCatalogGames(): Promise<CatalogGameRow[]> {
    return [...this.catalogGames.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async countCatalogGames(): Promise<number> {
    return this.catalogGames.size;
  }

  async insertOfficialSnapshot(input: {
    userId: string;
    gameId: string;
    playedMinutes: number | null;
    rawPayload: Record<string, unknown>;
    capturedAt: string;
  }): Promise<OfficialSnapshotRow> {
    const row: OfficialSnapshotRow = {
      id: randomUUID(),
      userId: input.userId,
      gameId: input.gameId,
      playedMinutes: input.playedMinutes,
      rawPayload: input.rawPayload,
      capturedAt: input.capturedAt
    };
    this.snapshots.set(row.id, row);
    return row;
  }

  async listOfficialSnapshotsByUserId(userId: string): Promise<OfficialSnapshotRow[]> {
    return [...this.snapshots.values()].filter((entry) => entry.userId === userId);
  }

  async getLatestOfficialSnapshotsByUserId(userId: string): Promise<OfficialSnapshotRow[]> {
    const latestByGame = new Map<string, OfficialSnapshotRow>();
    for (const row of this.snapshots.values()) {
      if (row.userId !== userId) continue;
      const prev = latestByGame.get(row.gameId);
      if (!prev || Date.parse(row.capturedAt) > Date.parse(prev.capturedAt)) {
        latestByGame.set(row.gameId, row);
      }
    }
    return [...latestByGame.values()];
  }

  async createCorrection(input: {
    userId: string;
    gameId: string;
    type: CorrectionType;
    minutes: number;
    reason: string;
    createdAt: string;
  }): Promise<CorrectionRow> {
    const row: CorrectionRow = {
      id: randomUUID(),
      userId: input.userId,
      gameId: input.gameId,
      type: input.type,
      minutes: input.minutes,
      reason: input.reason,
      createdAt: input.createdAt,
      revokedAt: null,
      deletedAt: null
    };
    this.corrections.set(row.id, row);
    return row;
  }

  async listCorrectionsByUserId(userId: string, gameId?: string): Promise<CorrectionRow[]> {
    return [...this.corrections.values()]
      .filter((entry) => entry.userId === userId && !entry.deletedAt && (!gameId || entry.gameId === gameId))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async revokeCorrection(userId: string, correctionId: string, revokedAt: string): Promise<CorrectionRow | null> {
    const row = this.corrections.get(correctionId);
    if (!row || row.userId !== userId || row.deletedAt || row.revokedAt) {
      return null;
    }
    row.revokedAt = revokedAt;
    this.corrections.set(row.id, row);
    return row;
  }

  async createSyncJob(input: {
    userId: string;
    status: SyncJobRow["status"];
    triggeredBy: SyncJobRow["triggeredBy"];
    startedAt: string;
  }): Promise<SyncJobRow> {
    const row: SyncJobRow = {
      id: randomUUID(),
      userId: input.userId,
      status: input.status,
      triggeredBy: input.triggeredBy,
      startedAt: input.startedAt,
      finishedAt: null,
      durationMs: null,
      errorSummary: null,
      createdAt: input.startedAt
    };
    this.syncJobs.set(row.id, row);
    return row;
  }

  async updateSyncJob(
    syncJobId: string,
    input: {
      status: SyncJobRow["status"];
      finishedAt?: string | null;
      durationMs?: number | null;
      errorSummary?: string | null;
    }
  ): Promise<void> {
    const existing = this.syncJobs.get(syncJobId);
    if (!existing) return;
    existing.status = input.status;
    if (typeof input.finishedAt !== "undefined") existing.finishedAt = input.finishedAt;
    if (typeof input.durationMs !== "undefined") existing.durationMs = input.durationMs;
    if (typeof input.errorSummary !== "undefined") existing.errorSummary = input.errorSummary;
    this.syncJobs.set(existing.id, existing);
  }

  async getLatestSyncJobByUserId(userId: string): Promise<SyncJobRow | null> {
    return (
      [...this.syncJobs.values()]
        .filter((entry) => entry.userId === userId)
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0] ?? null
    );
  }

  async insertAuditLog(input: {
    userId: string;
    action: string;
    details: Record<string, unknown>;
    createdAt: string;
  }): Promise<AuditLogRow> {
    const row: AuditLogRow = {
      id: randomUUID(),
      userId: input.userId,
      action: input.action,
      details: input.details,
      createdAt: input.createdAt
    };
    this.auditLogs.set(row.id, row);
    return row;
  }
}
