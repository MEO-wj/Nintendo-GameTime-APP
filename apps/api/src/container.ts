import type { AppEnv } from "./config/env.js";
import { loadEnv } from "./config/env.js";
import { createRepository, type RepositoryContext } from "./repositories/index.js";
import type { Repository } from "./repositories/types.js";
import { ConsoleAlertService } from "./services/alertService.js";
import { createCatalogService, type CatalogService } from "./services/catalogService.js";
import { createMarketService, type MarketService } from "./services/marketService.js";
import { createNintendoClient, type NintendoClient } from "./services/nintendoClient.js";
import { createPlaytimeService, type PlaytimeService } from "./services/playtimeService.js";
import { createSyncService, type SyncService } from "./services/syncService.js";
import { createVisualizationService, type VisualizationService } from "./services/visualizationService.js";

export interface AppDependencies {
  env: AppEnv;
  repository: Repository;
  catalogService: CatalogService;
  marketService: MarketService;
  nintendoClient: NintendoClient;
  visualizationService: VisualizationService;
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

  const useStaticCatalogService = env.STORAGE_MODE === "memory";
  const catalogService = useStaticCatalogService ? createCatalogService() : createCatalogService(repository);
  if (!useStaticCatalogService) {
    await catalogService.ensureCatalogSeeded();
  }
  const marketService = createMarketService();
  const nintendoClient = createNintendoClient(env);
  const visualizationService = createVisualizationService(env);
  const alertService = new ConsoleAlertService();
  const syncService = createSyncService({
    env,
    repository,
    nintendoClient,
    alertService
  });
  const playtimeService = createPlaytimeService(repository, catalogService, visualizationService);
  const catalogRefreshTimer =
    env.CATALOG_REFRESH_INTERVAL_MS > 0
      ? setInterval(() => {
          void catalogService.refreshCatalog().catch((error) => {
            console.error("catalog refresh failed", error);
          });
        }, env.CATALOG_REFRESH_INTERVAL_MS)
      : null;

  catalogRefreshTimer?.unref?.();

  return {
    env,
    repository,
    catalogService,
    marketService,
    nintendoClient,
    visualizationService,
    playtimeService,
    syncService,
    close: async () => {
      if (catalogRefreshTimer) {
        clearInterval(catalogRefreshTimer);
      }
      if (repositoryContext) {
        await repositoryContext.close();
      }
    }
  };
}
