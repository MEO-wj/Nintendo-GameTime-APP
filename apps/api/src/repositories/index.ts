import { Pool } from "pg";
import type { AppEnv } from "../config/env.js";
import { MemoryRepository } from "./memoryRepository.js";
import { PostgresRepository } from "./postgresRepository.js";
import type { Repository } from "./types.js";

export interface RepositoryContext {
  repository: Repository;
  close: () => Promise<void>;
}

export async function createRepository(env: AppEnv): Promise<RepositoryContext> {
  if (env.STORAGE_MODE === "memory" || !env.DATABASE_URL) {
    return {
      repository: new MemoryRepository(),
      close: async () => {}
    };
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const repository = new PostgresRepository(pool);
  await repository.ensureSchema();

  return {
    repository,
    close: async () => {
      await pool.end();
    }
  };
}
