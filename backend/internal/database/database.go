package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewPostgresPool(databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = 20
	cfg.MinConns = 2
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 30 * time.Minute
	cfg.HealthCheckPeriod = time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	log.Println("[DB] PostgreSQL connected")
	return pool, nil
}

func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		email TEXT UNIQUE NOT NULL,
		password_hash TEXT NULL,
		created_at TIMESTAMPTZ NOT NULL
	);
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
		price_amount NUMERIC(10,2) NULL,
		price_currency TEXT NOT NULL,
		platform TEXT NOT NULL,
		region TEXT NOT NULL,
		source TEXT NOT NULL,
		localizations JSONB NOT NULL DEFAULT '{}'::jsonb,
		last_synced_at TIMESTAMPTZ NOT NULL,
		created_at TIMESTAMPTZ NOT NULL,
		updated_at TIMESTAMPTZ NOT NULL
	);
	CREATE INDEX IF NOT EXISTS catalog_games_sort_order_idx ON catalog_games (sort_order);
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
	CREATE INDEX IF NOT EXISTS regional_prices_external_id_idx ON regional_prices (external_id);`

	_, err := pool.Exec(ctx, schema)
	if err != nil {
		return fmt.Errorf("ensure schema: %w", err)
	}
	log.Println("[DB] Schema ensured (13 tables)")
	return nil
}
