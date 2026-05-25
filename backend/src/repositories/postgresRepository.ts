import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { CorrectionType } from "@nintendo-gametime/shared-types";
import type { Repository } from "./types.js";
import type {
  AuditLogRow,
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

function asIso(value: string | Date): string {
  return new Date(value).toISOString();
}

function asCatalogLocalizations(value: unknown): CatalogLocalizationsRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as CatalogLocalizationsRow;
}

function mapCatalogGameRow(row: Record<string, unknown>): CatalogGameRow {
  return {
    id: String(row.id),
    externalId: String(row.external_id),
    sortOrder: Number(row.sort_order),
    title: String(row.title),
    coverUrl: row.cover_url === null ? null : String(row.cover_url),
    storeUrl: String(row.store_url),
    description: row.description === null ? null : String(row.description),
    publisher: row.publisher === null ? null : String(row.publisher),
    releaseDate: row.release_date === null ? null : String(row.release_date),
    priceAmount:
      row.price_amount === null || typeof row.price_amount === "undefined"
        ? null
        : Number.parseFloat(String(row.price_amount)),
    priceCurrency: String(row.price_currency),
    platform: String(row.platform) as "Switch",
    region: String(row.region) as "GLOBAL",
    source: String(row.source),
    localizations: asCatalogLocalizations(row.localizations),
    lastSyncedAt: asIso(String(row.last_synced_at)),
    createdAt: asIso(String(row.created_at)),
    updatedAt: asIso(String(row.updated_at))
  };
}

function mapGameRatingRow(row: Record<string, unknown>): GameRatingRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    externalId: String(row.external_id),
    score: Number(row.score),
    createdAt: asIso(String(row.created_at)),
    updatedAt: asIso(String(row.updated_at))
  };
}

function mapRegionalPriceRow(row: Record<string, unknown>): RegionalPriceRow {
  return {
    id: String(row.id),
    externalId: String(row.external_id),
    prices: (Array.isArray(row.prices) ? row.prices : []) as RegionalPrice[],
    fetchedAt: asIso(String(row.fetched_at)),
    createdAt: asIso(String(row.created_at)),
    updatedAt: asIso(String(row.updated_at))
  };
}

function mapGameRatingSummaryRow(row: Record<string, unknown>): GameRatingSummaryRow {
  return {
    externalId: String(row.external_id),
    ratingCount: Number(row.rating_count),
    ratingTotal: Number(row.rating_total),
    updatedAt: asIso(String(row.updated_at))
  };
}

export class PostgresRepository implements Repository {
  constructor(private readonly pool: Pool) {}

  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;
      CREATE TABLE IF NOT EXISTS auth_codes (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id),
        market_mode TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS nintendo_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
        encrypted_session TEXT NOT NULL,
        region TEXT NOT NULL,
        last_sync_at TIMESTAMPTZ NULL,
        sync_fail_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        deleted_at TIMESTAMPTZ NULL
      );
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        cover_url TEXT NULL,
        region TEXT NOT NULL,
        platform TEXT NOT NULL,
        price_jpy INT NULL,
        owned_at TIMESTAMPTZ NULL,
        last_played_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        deleted_at TIMESTAMPTZ NULL,
        UNIQUE(user_id, external_id)
      );
      CREATE TABLE IF NOT EXISTS catalog_games (
        id TEXT PRIMARY KEY,
        external_id TEXT UNIQUE NOT NULL,
        sort_order INT NOT NULL,
        title TEXT NOT NULL,
        cover_url TEXT NULL,
        store_url TEXT NOT NULL,
        description TEXT NULL,
        publisher TEXT NULL,
        release_date TEXT NULL,
        price_amount NUMERIC(10, 2) NULL,
        price_currency TEXT NOT NULL,
        platform TEXT NOT NULL,
        region TEXT NOT NULL,
        source TEXT NOT NULL,
        localizations JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_synced_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS catalog_games_sort_order_idx
        ON catalog_games (sort_order);
      CREATE TABLE IF NOT EXISTS official_snapshots (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        game_id TEXT NOT NULL REFERENCES games(id),
        played_minutes INT NULL,
        raw_payload JSONB NOT NULL,
        captured_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS playtime_corrections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        game_id TEXT NOT NULL REFERENCES games(id),
        type TEXT NOT NULL,
        minutes INT NOT NULL,
        reason TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ NULL,
        deleted_at TIMESTAMPTZ NULL
      );
      CREATE TABLE IF NOT EXISTS game_ratings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        external_id TEXT NOT NULL,
        score NUMERIC(4,1) NOT NULL CHECK (score BETWEEN 0.1 AND 10.0),
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE(user_id, external_id)
      );
      CREATE TABLE IF NOT EXISTS game_rating_summaries (
        external_id TEXT PRIMARY KEY,
        rating_count INT NOT NULL DEFAULT 0,
        rating_total NUMERIC(10,1) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        status TEXT NOT NULL,
        triggered_by TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        finished_at TIMESTAMPTZ NULL,
        duration_ms INT NULL,
        error_summary TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        details JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS regional_prices (
        id TEXT PRIMARY KEY,
        external_id TEXT UNIQUE NOT NULL,
        prices JSONB NOT NULL,
        fetched_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS regional_prices_external_id_idx
        ON regional_prices (external_id);
    `);

    const scoreColumn = await this.pool.query<{ data_type: string }>(
      `SELECT data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'game_ratings' AND column_name = 'score'`
    );
    if (scoreColumn.rows[0]?.data_type === "integer") {
      await this.pool.query(`
        ALTER TABLE game_ratings
        ALTER COLUMN score DROP DEFAULT,
        ALTER COLUMN score TYPE NUMERIC(4,1) USING ROUND((score::numeric * 2), 1)
      `);
      await this.pool.query(`
        ALTER TABLE game_ratings
        DROP CONSTRAINT IF EXISTS game_ratings_score_check
      `);
      await this.pool.query(`
        ALTER TABLE game_ratings
        ADD CONSTRAINT game_ratings_score_check CHECK (score BETWEEN 0.1 AND 10.0)
      `);
    }

    const totalColumn = await this.pool.query<{ data_type: string }>(
      `SELECT data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'game_rating_summaries' AND column_name = 'rating_total'`
    );
    if (totalColumn.rows[0]?.data_type === "integer") {
      await this.pool.query(`
        ALTER TABLE game_rating_summaries
        ALTER COLUMN rating_total DROP DEFAULT,
        ALTER COLUMN rating_total TYPE NUMERIC(10,1) USING ROUND((rating_total::numeric * 2), 1),
        ALTER COLUMN rating_total SET DEFAULT 0
      `);
    }
  }

  async upsertUserByEmail(email: string): Promise<User> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.pool.query(
      "SELECT id, email, password_hash, created_at FROM users WHERE email = $1",
      [normalized]
    );
    if (existing.rows[0]) {
      return {
        id: existing.rows[0].id,
        email: existing.rows[0].email,
        passwordHash: existing.rows[0].password_hash ?? null,
        createdAt: asIso(existing.rows[0].created_at)
      };
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    await this.pool.query(
      "INSERT INTO users (id, email, created_at) VALUES ($1, $2, $3)",
      [id, normalized, now]
    );
    return { id, email: normalized, passwordHash: null, createdAt: now };
  }

  async createUserWithPassword(email: string, passwordHash: string): Promise<User> {
    const normalized = email.trim().toLowerCase();
    const now = new Date().toISOString();
    const id = randomUUID();
    await this.pool.query(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)",
      [id, normalized, passwordHash, now]
    );
    return { id, email: normalized, passwordHash, createdAt: now };
  }

  async getUserById(userId: string): Promise<User | null> {
    const result = await this.pool.query(
      "SELECT id, email, password_hash, created_at FROM users WHERE id = $1",
      [userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, email: row.email, passwordHash: row.password_hash ?? null, createdAt: asIso(row.created_at) };
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    const result = await this.pool.query(
      "SELECT id, email, password_hash, created_at FROM users WHERE email = $1",
      [normalized]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, email: row.email, passwordHash: row.password_hash ?? null, createdAt: asIso(row.created_at) };
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [passwordHash, userId]
    );
  }

  async getUserPreference(userId: string): Promise<UserPreference | null> {
    const result = await this.pool.query(
      `SELECT user_id, market_mode, created_at, updated_at
       FROM user_preferences
       WHERE user_id = $1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      marketMode: row.market_mode,
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at)
    };
  }

  async upsertUserPreference(input: {
    userId: string;
    marketMode: "GLOBAL" | "DOMESTIC";
  }): Promise<UserPreference> {
    const existing = await this.pool.query(
      "SELECT user_id, created_at FROM user_preferences WHERE user_id = $1",
      [input.userId]
    );
    const now = new Date().toISOString();

    if (existing.rows[0]) {
      await this.pool.query(
        `UPDATE user_preferences
         SET market_mode = $1, updated_at = $2
         WHERE user_id = $3`,
        [input.marketMode, now, input.userId]
      );
    } else {
      await this.pool.query(
        `INSERT INTO user_preferences (user_id, market_mode, created_at, updated_at)
         VALUES ($1, $2, $3, $3)`,
        [input.userId, input.marketMode, now]
      );
    }

    return {
      userId: input.userId,
      marketMode: input.marketMode,
      createdAt: existing.rows[0] ? asIso(existing.rows[0].created_at) : now,
      updatedAt: now
    };
  }

  async saveAuthCode(email: string, code: string, expiresAt: string): Promise<void> {
    await this.pool.query(
      "INSERT INTO auth_codes (id, email, code, expires_at, consumed_at, created_at) VALUES ($1, $2, $3, $4, NULL, $5)",
      [randomUUID(), email.trim().toLowerCase(), code, expiresAt, new Date().toISOString()]
    );
  }

  async consumeAuthCode(email: string, code: string, now: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT id, expires_at FROM auth_codes
       WHERE email = $1 AND code = $2 AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [email.trim().toLowerCase(), code]
    );
    const row = result.rows[0];
    if (!row) return false;
    if (Date.parse(row.expires_at) < Date.parse(now)) return false;
    await this.pool.query("UPDATE auth_codes SET consumed_at = $1 WHERE id = $2", [now, row.id]);
    return true;
  }

  async upsertNintendoAccount(input: {
    userId: string;
    encryptedSession: string;
    region: "JP" | "GLOBAL" | "UNKNOWN";
  }): Promise<NintendoAccount> {
    const now = new Date().toISOString();
    const existing = await this.pool.query(
      "SELECT id FROM nintendo_accounts WHERE user_id = $1",
      [input.userId]
    );

    if (existing.rows[0]) {
      await this.pool.query(
        `UPDATE nintendo_accounts
         SET encrypted_session = $1, region = $2, updated_at = $3, deleted_at = NULL
         WHERE user_id = $4`,
        [input.encryptedSession, input.region, now, input.userId]
      );
    } else {
      await this.pool.query(
        `INSERT INTO nintendo_accounts
          (id, user_id, encrypted_session, region, last_sync_at, sync_fail_count, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, NULL, 0, $5, $5, NULL)`,
        [randomUUID(), input.userId, input.encryptedSession, input.region, now]
      );
    }

    const result = await this.pool.query(
      `SELECT id, user_id, encrypted_session, region, last_sync_at, sync_fail_count, created_at, updated_at, deleted_at
       FROM nintendo_accounts WHERE user_id = $1`,
      [input.userId]
    );
    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      encryptedSession: row.encrypted_session,
      region: row.region,
      lastSyncAt: row.last_sync_at ? asIso(row.last_sync_at) : null,
      syncFailCount: Number(row.sync_fail_count),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      deletedAt: row.deleted_at ? asIso(row.deleted_at) : null
    };
  }

  async getNintendoAccountByUserId(userId: string): Promise<NintendoAccount | null> {
    const result = await this.pool.query(
      `SELECT id, user_id, encrypted_session, region, last_sync_at, sync_fail_count, created_at, updated_at, deleted_at
       FROM nintendo_accounts
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      encryptedSession: row.encrypted_session,
      region: row.region,
      lastSyncAt: row.last_sync_at ? asIso(row.last_sync_at) : null,
      syncFailCount: Number(row.sync_fail_count),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      deletedAt: row.deleted_at ? asIso(row.deleted_at) : null
    };
  }

  async listActiveNintendoAccounts(): Promise<NintendoAccount[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, encrypted_session, region, last_sync_at, sync_fail_count, created_at, updated_at, deleted_at
       FROM nintendo_accounts WHERE deleted_at IS NULL`
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      encryptedSession: row.encrypted_session,
      region: row.region,
      lastSyncAt: row.last_sync_at ? asIso(row.last_sync_at) : null,
      syncFailCount: Number(row.sync_fail_count),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      deletedAt: row.deleted_at ? asIso(row.deleted_at) : null
    }));
  }

  async updateNintendoSyncState(userId: string, input: { lastSyncAt?: string; syncFailCount?: number }): Promise<void> {
    await this.pool.query(
      `UPDATE nintendo_accounts
       SET
         last_sync_at = COALESCE($1, last_sync_at),
         sync_fail_count = COALESCE($2, sync_fail_count),
         updated_at = $3
       WHERE user_id = $4`,
      [input.lastSyncAt ?? null, input.syncFailCount ?? null, new Date().toISOString(), userId]
    );
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
    const existing = await this.pool.query(
      `SELECT id FROM games WHERE user_id = $1 AND external_id = $2`,
      [input.userId, input.externalId]
    );
    if (existing.rows[0]) {
      await this.pool.query(
        `UPDATE games SET
          title = $1,
          cover_url = $2,
          region = $3,
          platform = $4,
          price_jpy = $5,
          owned_at = $6,
          last_played_at = $7,
          updated_at = $8,
          deleted_at = NULL
         WHERE id = $9`,
        [
          input.title,
          input.coverUrl,
          input.region,
          input.platform,
          input.priceJpy,
          input.ownedAt,
          input.lastPlayedAt,
          now,
          existing.rows[0].id
        ]
      );
    } else {
      await this.pool.query(
        `INSERT INTO games
        (id, user_id, external_id, title, cover_url, region, platform, price_jpy, owned_at, last_played_at, created_at, updated_at, deleted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, NULL)`,
        [
          randomUUID(),
          input.userId,
          input.externalId,
          input.title,
          input.coverUrl,
          input.region,
          input.platform,
          input.priceJpy,
          input.ownedAt,
          input.lastPlayedAt,
          now
        ]
      );
    }

    const result = await this.pool.query(
      `SELECT id, user_id, external_id, title, cover_url, region, platform, price_jpy, owned_at, last_played_at, created_at, updated_at, deleted_at
       FROM games WHERE user_id = $1 AND external_id = $2`,
      [input.userId, input.externalId]
    );
    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      externalId: row.external_id,
      title: row.title,
      coverUrl: row.cover_url,
      region: row.region,
      platform: row.platform,
      priceJpy: row.price_jpy === null ? null : Number(row.price_jpy),
      ownedAt: row.owned_at ? asIso(row.owned_at) : null,
      lastPlayedAt: row.last_played_at ? asIso(row.last_played_at) : null,
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      deletedAt: row.deleted_at ? asIso(row.deleted_at) : null
    };
  }

  async getGameById(userId: string, gameId: string): Promise<GameRow | null> {
    const result = await this.pool.query(
      `SELECT id, user_id, external_id, title, cover_url, region, platform, price_jpy, owned_at, last_played_at, created_at, updated_at, deleted_at
       FROM games WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [gameId, userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      externalId: row.external_id,
      title: row.title,
      coverUrl: row.cover_url,
      region: row.region,
      platform: row.platform,
      priceJpy: row.price_jpy === null ? null : Number(row.price_jpy),
      ownedAt: row.owned_at ? asIso(row.owned_at) : null,
      lastPlayedAt: row.last_played_at ? asIso(row.last_played_at) : null,
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      deletedAt: row.deleted_at ? asIso(row.deleted_at) : null
    };
  }

  async listGamesByUserId(userId: string): Promise<GameRow[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, external_id, title, cover_url, region, platform, price_jpy, owned_at, last_played_at, created_at, updated_at, deleted_at
       FROM games WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      externalId: row.external_id,
      title: row.title,
      coverUrl: row.cover_url,
      region: row.region,
      platform: row.platform,
      priceJpy: row.price_jpy === null ? null : Number(row.price_jpy),
      ownedAt: row.owned_at ? asIso(row.owned_at) : null,
      lastPlayedAt: row.last_played_at ? asIso(row.last_played_at) : null,
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      deletedAt: row.deleted_at ? asIso(row.deleted_at) : null
    }));
  }

  async listGamesPaginatedByUserId(userId: string, input: { offset: number; limit: number }) {
    const countResult = await this.pool.query(
      "SELECT COUNT(*)::int AS c FROM games WHERE user_id = $1 AND deleted_at IS NULL",
      [userId]
    );
    const total = Number(countResult.rows[0]?.c ?? 0);
    const result = await this.pool.query(
      `SELECT id, user_id, external_id, title, cover_url, region, platform, price_jpy, owned_at, last_played_at, created_at, updated_at, deleted_at
       FROM games
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       OFFSET $2 LIMIT $3`,
      [userId, input.offset, input.limit]
    );
    const items = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      externalId: row.external_id,
      title: row.title,
      coverUrl: row.cover_url,
      region: row.region,
      platform: row.platform,
      priceJpy: row.price_jpy === null ? null : Number(row.price_jpy),
      ownedAt: row.owned_at ? asIso(row.owned_at) : null,
      lastPlayedAt: row.last_played_at ? asIso(row.last_played_at) : null,
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      deletedAt: row.deleted_at ? asIso(row.deleted_at) : null
    }));
    const nextOffset = input.offset + input.limit < total ? input.offset + input.limit : null;
    return { items, nextOffset };
  }

  async removeGame(userId: string, gameId: string, deletedAt: string): Promise<GameRow | null> {
    const result = await this.pool.query(
      `UPDATE games
       SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING id, user_id, external_id, title, cover_url, region, platform, price_jpy, owned_at, last_played_at, created_at, updated_at, deleted_at`,
      [deletedAt, gameId, userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      externalId: row.external_id,
      title: row.title,
      coverUrl: row.cover_url,
      region: row.region,
      platform: row.platform,
      priceJpy: row.price_jpy === null ? null : Number(row.price_jpy),
      ownedAt: row.owned_at ? asIso(row.owned_at) : null,
      lastPlayedAt: row.last_played_at ? asIso(row.last_played_at) : null,
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      deletedAt: row.deleted_at ? asIso(row.deleted_at) : null
    };
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
    const now = new Date().toISOString();
    const existing = await this.pool.query(
      "SELECT id, created_at FROM catalog_games WHERE external_id = $1",
      [input.externalId]
    );

    if (existing.rows[0]) {
      await this.pool.query(
        `UPDATE catalog_games
         SET sort_order = $1,
             title = $2,
             cover_url = $3,
             store_url = $4,
             description = $5,
             publisher = $6,
             release_date = $7,
             price_amount = $8,
             price_currency = $9,
             platform = $10,
             region = $11,
             source = $12,
             localizations = $13::jsonb,
             last_synced_at = $14,
             updated_at = $15
         WHERE external_id = $16`,
        [
          input.sortOrder,
          input.title,
          input.coverUrl,
          input.storeUrl,
          input.description,
          input.publisher,
          input.releaseDate,
          input.priceAmount,
          input.priceCurrency,
          input.platform,
          input.region,
          input.source,
          JSON.stringify(input.localizations),
          input.lastSyncedAt,
          now,
          input.externalId
        ]
      );
    } else {
      await this.pool.query(
        `INSERT INTO catalog_games
         (id, external_id, sort_order, title, cover_url, store_url, description, publisher, release_date, price_amount,
          price_currency, platform, region, source, localizations, last_synced_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $17)`,
        [
          randomUUID(),
          input.externalId,
          input.sortOrder,
          input.title,
          input.coverUrl,
          input.storeUrl,
          input.description,
          input.publisher,
          input.releaseDate,
          input.priceAmount,
          input.priceCurrency,
          input.platform,
          input.region,
          input.source,
          JSON.stringify(input.localizations),
          input.lastSyncedAt,
          now
        ]
      );
    }

    const result = await this.pool.query(
      `SELECT id, external_id, sort_order, title, cover_url, store_url, description, publisher, release_date,
              price_amount, price_currency, platform, region, source, localizations, last_synced_at, created_at, updated_at
       FROM catalog_games
       WHERE external_id = $1`,
      [input.externalId]
    );
    return mapCatalogGameRow(result.rows[0]);
  }

  async getCatalogGameByExternalId(externalId: string): Promise<CatalogGameRow | null> {
    const result = await this.pool.query(
      `SELECT id, external_id, sort_order, title, cover_url, store_url, description, publisher, release_date,
              price_amount, price_currency, platform, region, source, localizations, last_synced_at, created_at, updated_at
       FROM catalog_games
       WHERE external_id = $1`,
      [externalId]
    );
    const row = result.rows[0];
    return row ? mapCatalogGameRow(row) : null;
  }

  async listCatalogGames(): Promise<CatalogGameRow[]> {
    const result = await this.pool.query(
      `SELECT id, external_id, sort_order, title, cover_url, store_url, description, publisher, release_date,
              price_amount, price_currency, platform, region, source, localizations, last_synced_at, created_at, updated_at
       FROM catalog_games
       ORDER BY sort_order ASC, title ASC`
    );
    return result.rows.map((row) => mapCatalogGameRow(row));
  }

  async countCatalogGames(): Promise<number> {
    const result = await this.pool.query("SELECT COUNT(*)::int AS c FROM catalog_games");
    return Number(result.rows[0]?.c ?? 0);
  }

  async insertOfficialSnapshot(input: {
    userId: string;
    gameId: string;
    playedMinutes: number | null;
    rawPayload: Record<string, unknown>;
    capturedAt: string;
  }): Promise<OfficialSnapshotRow> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO official_snapshots (id, user_id, game_id, played_minutes, raw_payload, captured_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [id, input.userId, input.gameId, input.playedMinutes, JSON.stringify(input.rawPayload), input.capturedAt]
    );
    return {
      id,
      userId: input.userId,
      gameId: input.gameId,
      playedMinutes: input.playedMinutes,
      rawPayload: input.rawPayload,
      capturedAt: input.capturedAt
    };
  }

  async listOfficialSnapshotsByUserId(userId: string): Promise<OfficialSnapshotRow[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, game_id, played_minutes, raw_payload, captured_at
       FROM official_snapshots WHERE user_id = $1`,
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      gameId: row.game_id,
      playedMinutes: row.played_minutes === null ? null : Number(row.played_minutes),
      rawPayload: row.raw_payload,
      capturedAt: asIso(row.captured_at)
    }));
  }

  async getLatestOfficialSnapshotsByUserId(userId: string): Promise<OfficialSnapshotRow[]> {
    const result = await this.pool.query(
      `SELECT DISTINCT ON (game_id)
         id, user_id, game_id, played_minutes, raw_payload, captured_at
       FROM official_snapshots
       WHERE user_id = $1
       ORDER BY game_id, captured_at DESC`,
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      gameId: row.game_id,
      playedMinutes: row.played_minutes === null ? null : Number(row.played_minutes),
      rawPayload: row.raw_payload,
      capturedAt: asIso(row.captured_at)
    }));
  }

  async createCorrection(input: {
    userId: string;
    gameId: string;
    type: CorrectionType;
    minutes: number;
    reason: string;
    createdAt: string;
  }): Promise<CorrectionRow> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO playtime_corrections
       (id, user_id, game_id, type, minutes, reason, created_at, revoked_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL)`,
      [id, input.userId, input.gameId, input.type, input.minutes, input.reason, input.createdAt]
    );
    return {
      id,
      userId: input.userId,
      gameId: input.gameId,
      type: input.type,
      minutes: input.minutes,
      reason: input.reason,
      createdAt: input.createdAt,
      revokedAt: null,
      deletedAt: null
    };
  }

  async listCorrectionsByUserId(userId: string, gameId?: string): Promise<CorrectionRow[]> {
    const params: unknown[] = [userId];
    let sql = `SELECT id, user_id, game_id, type, minutes, reason, created_at, revoked_at, deleted_at
               FROM playtime_corrections
               WHERE user_id = $1 AND deleted_at IS NULL`;
    if (gameId) {
      params.push(gameId);
      sql += ` AND game_id = $${params.length}`;
    }
    sql += " ORDER BY created_at DESC";
    const result = await this.pool.query(sql, params);
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      gameId: row.game_id,
      type: row.type,
      minutes: Number(row.minutes),
      reason: row.reason,
      createdAt: asIso(row.created_at),
      revokedAt: row.revoked_at ? asIso(row.revoked_at) : null,
      deletedAt: row.deleted_at ? asIso(row.deleted_at) : null
    }));
  }

  async revokeCorrection(userId: string, correctionId: string, revokedAt: string): Promise<CorrectionRow | null> {
    const result = await this.pool.query(
      `UPDATE playtime_corrections
       SET revoked_at = $1
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL AND revoked_at IS NULL
       RETURNING id, user_id, game_id, type, minutes, reason, created_at, revoked_at, deleted_at`,
      [revokedAt, correctionId, userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      gameId: row.game_id,
      type: row.type,
      minutes: Number(row.minutes),
      reason: row.reason,
      createdAt: asIso(row.created_at),
      revokedAt: row.revoked_at ? asIso(row.revoked_at) : null,
      deletedAt: row.deleted_at ? asIso(row.deleted_at) : null
    };
  }

  async getGameRatingSnapshot(userId: string, externalId: string) {
    const [userResult, summaryResult] = await Promise.all([
      this.pool.query(
        `SELECT id, user_id, external_id, score, created_at, updated_at
         FROM game_ratings
         WHERE user_id = $1 AND external_id = $2`,
        [userId, externalId]
      ),
      this.pool.query(
        `SELECT external_id, rating_count, rating_total, updated_at
         FROM game_rating_summaries
         WHERE external_id = $1`,
        [externalId]
      )
    ]);

    return {
      userRating: userResult.rows[0] ? mapGameRatingRow(userResult.rows[0]) : null,
      summary: summaryResult.rows[0] ? mapGameRatingSummaryRow(summaryResult.rows[0]) : null
    };
  }

  async upsertGameRating(input: { userId: string; externalId: string; score: number; now: string }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const existingResult = await client.query(
        `SELECT id, user_id, external_id, score, created_at, updated_at
         FROM game_ratings
         WHERE user_id = $1 AND external_id = $2
         FOR UPDATE`,
        [input.userId, input.externalId]
      );
      const existing = existingResult.rows[0] ? mapGameRatingRow(existingResult.rows[0]) : null;

      let userRating: GameRatingRow;
      if (existing) {
        await client.query(
          `UPDATE game_ratings
           SET score = $1, updated_at = $2
           WHERE id = $3`,
          [input.score, input.now, existing.id]
        );
        await client.query(
          `UPDATE game_rating_summaries
           SET rating_total = rating_total + $1, updated_at = $2
           WHERE external_id = $3`,
          [input.score - existing.score, input.now, input.externalId]
        );
        userRating = {
          ...existing,
          score: input.score,
          updatedAt: input.now
        };
      } else {
        const id = randomUUID();
        await client.query(
          `INSERT INTO game_ratings (id, user_id, external_id, score, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)`,
          [id, input.userId, input.externalId, input.score, input.now]
        );
        await client.query(
          `INSERT INTO game_rating_summaries (external_id, rating_count, rating_total, updated_at)
           VALUES ($1, 1, $2, $3)
           ON CONFLICT (external_id) DO UPDATE
           SET rating_count = game_rating_summaries.rating_count + 1,
               rating_total = game_rating_summaries.rating_total + EXCLUDED.rating_total,
               updated_at = EXCLUDED.updated_at`,
          [input.externalId, input.score, input.now]
        );
        userRating = {
          id,
          userId: input.userId,
          externalId: input.externalId,
          score: input.score,
          createdAt: input.now,
          updatedAt: input.now
        };
      }

      const summaryResult = await client.query(
        `SELECT external_id, rating_count, rating_total, updated_at
         FROM game_rating_summaries
         WHERE external_id = $1`,
        [input.externalId]
      );
      const summary = mapGameRatingSummaryRow(summaryResult.rows[0]);

      await client.query("COMMIT");
      return { userRating, summary };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createSyncJob(input: {
    userId: string;
    status: SyncJobRow["status"];
    triggeredBy: SyncJobRow["triggeredBy"];
    startedAt: string;
  }): Promise<SyncJobRow> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO sync_jobs
       (id, user_id, status, triggered_by, started_at, finished_at, duration_ms, error_summary, created_at)
       VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL, $5)`,
      [id, input.userId, input.status, input.triggeredBy, input.startedAt]
    );
    return {
      id,
      userId: input.userId,
      status: input.status,
      triggeredBy: input.triggeredBy,
      startedAt: input.startedAt,
      finishedAt: null,
      durationMs: null,
      errorSummary: null,
      createdAt: input.startedAt
    };
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
    await this.pool.query(
      `UPDATE sync_jobs
       SET status = $1,
           finished_at = COALESCE($2, finished_at),
           duration_ms = COALESCE($3, duration_ms),
           error_summary = $4
       WHERE id = $5`,
      [input.status, input.finishedAt ?? null, input.durationMs ?? null, input.errorSummary ?? null, syncJobId]
    );
  }

  async getLatestSyncJobByUserId(userId: string): Promise<SyncJobRow | null> {
    const result = await this.pool.query(
      `SELECT id, user_id, status, triggered_by, started_at, finished_at, duration_ms, error_summary, created_at
       FROM sync_jobs
       WHERE user_id = $1
       ORDER BY started_at DESC
       LIMIT 1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      triggeredBy: row.triggered_by,
      startedAt: asIso(row.started_at),
      finishedAt: row.finished_at ? asIso(row.finished_at) : null,
      durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
      errorSummary: row.error_summary,
      createdAt: asIso(row.created_at)
    };
  }

  async insertAuditLog(input: {
    userId: string;
    action: string;
    details: Record<string, unknown>;
    createdAt: string;
  }): Promise<AuditLogRow> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO audit_logs (id, user_id, action, details, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [id, input.userId, input.action, JSON.stringify(input.details), input.createdAt]
    );
    return {
      id,
      userId: input.userId,
      action: input.action,
      details: input.details,
      createdAt: input.createdAt
    };
  }

  async upsertRegionalPrices(input: {
    externalId: string;
    prices: RegionalPrice[];
    fetchedAt: string;
  }): Promise<RegionalPriceRow> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const result = await this.pool.query(
      `INSERT INTO regional_prices (id, external_id, prices, fetched_at, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $5)
       ON CONFLICT (external_id) DO UPDATE
       SET prices = $3::jsonb, fetched_at = $4, updated_at = $5
       RETURNING id, external_id, prices, fetched_at, created_at, updated_at`,
      [id, input.externalId, JSON.stringify(input.prices), input.fetchedAt, now]
    );
    return mapRegionalPriceRow(result.rows[0]);
  }

  async getRegionalPrices(externalId: string): Promise<RegionalPriceRow | null> {
    const result = await this.pool.query(
      `SELECT id, external_id, prices, fetched_at, created_at, updated_at
       FROM regional_prices
       WHERE external_id = $1`,
      [externalId]
    );
    if (!result.rows[0]) return null;
    return mapRegionalPriceRow(result.rows[0]);
  }

  async listRegionalPricesByStaleness(staleThreshold: string, limit: number): Promise<RegionalPriceRow[]> {
    const result = await this.pool.query(
      `SELECT id, external_id, prices, fetched_at, created_at, updated_at
       FROM regional_prices
       WHERE fetched_at < $1
       ORDER BY fetched_at ASC
       LIMIT $2`,
      [staleThreshold, limit]
    );
    return result.rows.map(mapRegionalPriceRow);
  }

  async listCatalogGamesBySource(source: string, limit: number): Promise<CatalogGameRow[]> {
    const result = await this.pool.query(
      `SELECT id, external_id, sort_order, title, cover_url, store_url, description, publisher, release_date,
              price_amount, price_currency, platform, region, source, localizations, last_synced_at, created_at, updated_at
       FROM catalog_games
       WHERE source = $1
       LIMIT $2`,
      [source, limit]
    );
    return result.rows.map(mapCatalogGameRow);
  }

  async listCatalogGamesWithoutPrices(source: string, limit: number): Promise<CatalogGameRow[]> {
    const result = await this.pool.query(
      `SELECT g.id, g.external_id, g.sort_order, g.title, g.cover_url, g.store_url, g.description, g.publisher, g.release_date,
              g.price_amount, g.price_currency, g.platform, g.region, g.source, g.localizations, g.last_synced_at, g.created_at, g.updated_at
       FROM catalog_games g
       LEFT JOIN regional_prices rp ON rp.external_id = g.external_id
       WHERE g.source = $1 AND rp.id IS NULL
       LIMIT $2`,
      [source, limit]
    );
    return result.rows.map(mapCatalogGameRow);
  }
}
