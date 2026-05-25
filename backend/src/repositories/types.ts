import type { CorrectionType } from "@nintendo-gametime/shared-types";
import type {
  AuditLogRow,
  AuthCode,
  CatalogGameRow,
  CatalogLocalizationsRow,
  CorrectionRow,
  GameRow,
  GameRatingRow,
  GameRatingSummaryRow,
  NintendoAccount,
  OfficialSnapshotRow,
  RegionalPrice,
  RegionalPriceRow,
  SyncJobRow,
  User,
  UserPreference
} from "../types/domain.js";

export interface PaginationResult<T> {
  items: T[];
  nextOffset: number | null;
}

export interface Repository {
  upsertUserByEmail(email: string): Promise<User>;
  createUserWithPassword(email: string, passwordHash: string): Promise<User>;
  getUserById(userId: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  saveAuthCode(email: string, code: string, expiresAt: string): Promise<void>;
  consumeAuthCode(email: string, code: string, now: string): Promise<boolean>;
  getUserPreference(userId: string): Promise<UserPreference | null>;
  upsertUserPreference(input: {
    userId: string;
    marketMode: "GLOBAL" | "DOMESTIC";
  }): Promise<UserPreference>;

  upsertNintendoAccount(input: {
    userId: string;
    encryptedSession: string;
    region: "JP" | "GLOBAL" | "UNKNOWN";
  }): Promise<NintendoAccount>;
  getNintendoAccountByUserId(userId: string): Promise<NintendoAccount | null>;
  listActiveNintendoAccounts(): Promise<NintendoAccount[]>;
  updateNintendoSyncState(userId: string, input: { lastSyncAt?: string; syncFailCount?: number }): Promise<void>;

  upsertGame(input: {
    userId: string;
    externalId: string;
    title: string;
    coverUrl: string | null;
    region: "JP" | "GLOBAL" | "UNKNOWN";
    platform: "Switch";
    priceJpy: number | null;
    ownedAt: string | null;
    lastPlayedAt: string | null;
  }): Promise<GameRow>;
  getGameById(userId: string, gameId: string): Promise<GameRow | null>;
  listGamesByUserId(userId: string): Promise<GameRow[]>;
  listGamesPaginatedByUserId(userId: string, input: { offset: number; limit: number }): Promise<PaginationResult<GameRow>>;
  removeGame(userId: string, gameId: string, deletedAt: string): Promise<GameRow | null>;

  upsertCatalogGame(input: {
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
  }): Promise<CatalogGameRow>;
  getCatalogGameByExternalId(externalId: string): Promise<CatalogGameRow | null>;
  listCatalogGames(): Promise<CatalogGameRow[]>;
  countCatalogGames(): Promise<number>;

  insertOfficialSnapshot(input: {
    userId: string;
    gameId: string;
    playedMinutes: number | null;
    rawPayload: Record<string, unknown>;
    capturedAt: string;
  }): Promise<OfficialSnapshotRow>;
  listOfficialSnapshotsByUserId(userId: string): Promise<OfficialSnapshotRow[]>;
  getLatestOfficialSnapshotsByUserId(userId: string): Promise<OfficialSnapshotRow[]>;

  createCorrection(input: {
    userId: string;
    gameId: string;
    type: CorrectionType;
    minutes: number;
    reason: string;
    createdAt: string;
  }): Promise<CorrectionRow>;
  listCorrectionsByUserId(userId: string, gameId?: string): Promise<CorrectionRow[]>;
  revokeCorrection(userId: string, correctionId: string, revokedAt: string): Promise<CorrectionRow | null>;
  getGameRatingSnapshot(
    userId: string,
    externalId: string
  ): Promise<{ userRating: GameRatingRow | null; summary: GameRatingSummaryRow | null }>;
  upsertGameRating(input: {
    userId: string;
    externalId: string;
    score: number;
    now: string;
  }): Promise<{ userRating: GameRatingRow; summary: GameRatingSummaryRow }>;

  createSyncJob(input: {
    userId: string;
    status: SyncJobRow["status"];
    triggeredBy: SyncJobRow["triggeredBy"];
    startedAt: string;
  }): Promise<SyncJobRow>;
  updateSyncJob(
    syncJobId: string,
    input: {
      status: SyncJobRow["status"];
      finishedAt?: string | null;
      durationMs?: number | null;
      errorSummary?: string | null;
    }
  ): Promise<void>;
  getLatestSyncJobByUserId(userId: string): Promise<SyncJobRow | null>;

  insertAuditLog(input: {
    userId: string;
    action: string;
    details: Record<string, unknown>;
    createdAt: string;
  }): Promise<AuditLogRow>;

  upsertRegionalPrices(input: {
    externalId: string;
    prices: RegionalPrice[];
    fetchedAt: string;
  }): Promise<RegionalPriceRow>;
  getRegionalPrices(externalId: string): Promise<RegionalPriceRow | null>;
  listRegionalPricesByStaleness(staleThreshold: string, limit: number): Promise<RegionalPriceRow[]>;
  listCatalogGamesBySource(source: string, limit: number): Promise<CatalogGameRow[]>;
  listCatalogGamesWithoutPrices(source: string, limit: number): Promise<CatalogGameRow[]>;
}
