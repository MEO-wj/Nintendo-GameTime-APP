import type { CorrectionType } from "@nintendo-gametime/shared-types";
import type {
  AuditLogRow,
  AuthCode,
  CorrectionRow,
  GameRow,
  NintendoAccount,
  OfficialSnapshotRow,
  SyncJobRow,
  User
} from "../types/domain.js";

export interface PaginationResult<T> {
  items: T[];
  nextOffset: number | null;
}

export interface Repository {
  upsertUserByEmail(email: string): Promise<User>;
  getUserById(userId: string): Promise<User | null>;
  saveAuthCode(email: string, code: string, expiresAt: string): Promise<void>;
  consumeAuthCode(email: string, code: string, now: string): Promise<boolean>;

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
}
