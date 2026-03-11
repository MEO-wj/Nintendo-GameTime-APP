import type { CorrectionType } from "@nintendo-gametime/shared-types";

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface UserPreference {
  userId: string;
  marketMode: "GLOBAL" | "DOMESTIC";
  createdAt: string;
  updatedAt: string;
}

export interface AuthCode {
  id: string;
  email: string;
  code: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface NintendoAccount {
  id: string;
  userId: string;
  encryptedSession: string;
  region: "JP" | "GLOBAL" | "UNKNOWN";
  lastSyncAt: string | null;
  syncFailCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface GameRow {
  id: string;
  userId: string;
  externalId: string;
  title: string;
  coverUrl: string | null;
  region: "JP" | "GLOBAL" | "UNKNOWN";
  platform: "Switch";
  priceJpy: number | null;
  ownedAt: string | null;
  lastPlayedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CatalogTextLocalizationRow {
  title: string;
  description: string | null;
}

export interface CatalogLocalizationsRow {
  zhHans?: CatalogTextLocalizationRow;
}

export interface CatalogGameRow {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface OfficialSnapshotRow {
  id: string;
  userId: string;
  gameId: string;
  playedMinutes: number | null;
  rawPayload: Record<string, unknown>;
  capturedAt: string;
}

export interface CorrectionRow {
  id: string;
  userId: string;
  gameId: string;
  type: CorrectionType;
  minutes: number;
  reason: string;
  createdAt: string;
  revokedAt: string | null;
  deletedAt: string | null;
}

export interface SyncJobRow {
  id: string;
  userId: string;
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED";
  triggeredBy: "MANUAL" | "SCHEDULED" | "BIND";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorSummary: string | null;
  createdAt: string;
}

export interface AuditLogRow {
  id: string;
  userId: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface NintendoFetchedGame {
  externalId: string;
  title: string;
  coverUrl: string | null;
  region: "JP" | "GLOBAL" | "UNKNOWN";
  platform: "Switch";
  priceJpy: number | null;
  playedMinutes: number | null;
  ownedAt: string | null;
  lastPlayedAt: string | null;
}
