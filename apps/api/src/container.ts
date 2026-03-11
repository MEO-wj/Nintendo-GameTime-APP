import type { AppEnv } from "./config/env.js";
import { loadEnv } from "./config/env.js";
import { createRepository, type RepositoryContext } from "./repositories/index.js";
import type { Repository } from "./repositories/types.js";
import { ConsoleAlertService } from "./services/alertService.js";
import { createCatalogService, type CatalogService } from "./services/catalogService.js";
import { createNintendoClient, type NintendoClient } from "./services/nintendoClient.js";
import { createPlaytimeService, type PlaytimeService } from "./services/playtimeService.js";
import { createSyncService, type SyncService } from "./services/syncService.js";

export interface AppDependencies {
  env: AppEnv;
  repository: Repository;
  catalogService: CatalogService;
  nintendoClient: NintendoClient;
  playtimeService: PlaytimeService;
  syncService: SyncService;
  close: () => Promise<void>;
}

export async function createAppDependencies(
  options?: {
    env?: AppEnv;
    repository?: Repository;
  }
): Promise<AppDependencies> {
  const env = options?.env ?? loadEnv();
  let repositoryContext: RepositoryContext | null = null;
  const repository = options?.repository
    ? options.repository
    : (repositoryContext = await createRepository(env)).repository;

  const catalogService = createCatalogService();
  const nintendoClient = createNintendoClient(env);
  const alertService = new ConsoleAlertService();
  const syncService = createSyncService({
    env,
    repository,
    nintendoClient,
    alertService
  });
  const playtimeService = createPlaytimeService(repository, catalogService);

  return {
    env,
    repository,
    catalogService,
    nintendoClient,
    playtimeService,
    syncService,
    close: async () => {
      if (repositoryContext) {
        await repositoryContext.close();
      }
    }
  };
}
