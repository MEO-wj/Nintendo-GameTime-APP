import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(16).default("dev_jwt_secret_please_change"),
  ENCRYPTION_KEY: z
    .string()
    .default("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
  STORAGE_MODE: z.enum(["memory", "postgres"]).default("postgres"),
  DATABASE_URL: z.string().optional(),
  OTP_EXPIRES_MINUTES: z.coerce.number().default(10),
  OTP_DEV_CODE: z.string().default("000000"),
  INTERNAL_SYNC_TOKEN: z.string().default("internal_sync_token_change_me"),
  NINTENDO_MOCK: z.enum(["true", "false"]).transform((v) => v === "true").default("true"),
  API_BASE_URL: z.string().default("http://localhost:4000"),
  SYNC_INTERVAL_MS: z.coerce.number().default(300000),
  CATALOG_REFRESH_INTERVAL_MS: z.coerce.number().default(21600000),
  ALERT_FAIL_THRESHOLD: z.coerce.number().default(3),
  R_VISUALIZATION_ENABLED: z.enum(["true", "false"]).transform((v) => v === "true").default("true"),
  R_VISUALIZATION_BIN: z.string().default("Rscript"),
  R_VISUALIZATION_TIMEOUT_MS: z.coerce.number().default(3000),
  ESHOP_CACHE_TTL_MS: z.coerce.number().default(21600000),
  ESHOP_RATE_LIMIT_MS: z.coerce.number().default(1200),
  CRAWLER_DISCOVER_INTERVAL_MS: z.coerce.number().default(43200000),
  CRAWLER_PRICE_REFRESH_INTERVAL_MS: z.coerce.number().default(7200000),
  CRAWLER_STALE_PRICE_MS: z.coerce.number().default(21600000),
  CRAWLER_BATCH_LIMIT: z.coerce.number().default(50),
  SMTP_HOST: z.string().transform((v) => v || undefined).optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().transform((v) => v || undefined).optional(),
  SMTP_PASS: z.string().transform((v) => v || undefined).optional(),
  SMTP_FROM: z.string().transform((v) => v || undefined).optional()
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(overrides?: Partial<Record<keyof AppEnv, string | number | boolean>>): AppEnv {
  const merged = { ...process.env, ...overrides };
  const parsed = envSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}
