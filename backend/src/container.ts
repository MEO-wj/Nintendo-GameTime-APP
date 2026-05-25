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
import { createEshopPriceService, type EshopPriceService } from "./services/eshopPriceService.js";
import { createEshopCrawlerService, type EshopCrawlerService } from "./services/eshopCrawlerService.js";
import { createEmailService, type EmailService } from "./services/emailService.js";

export interface AppDependencies {
  env: AppEnv;
  repository: Repository;
  catalogService: CatalogService;
  marketService: MarketService;
  nintendoClient: NintendoClient;
  visualizationService: VisualizationService;
  playtimeService: PlaytimeService;
  syncService: SyncService;
  eshopPriceService: EshopPriceService;
  eshopCrawlerService: EshopCrawlerService;
  emailService: EmailService;
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
  if (!useStaticCatalogService && env.NINTENDO_MOCK) {
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
  const eshopPriceService = createEshopPriceService(env, repository, marketService);
  const eshopCrawlerService = createEshopCrawlerService(env, repository, eshopPriceService);
  const emailService = createEmailService(env);
  const catalogRefreshTimer =
    env.CATALOG_REFRESH_INTERVAL_MS > 0
      ? setInterval(() => {
          void catalogService.refreshCatalog().catch((error) => {
            console.error("catalog refresh failed", error);
          });
        }, env.CATALOG_REFRESH_INTERVAL_MS)
      : null;

  catalogRefreshTimer?.unref?.();

  const crawlerDiscoverTimer =
    env.CRAWLER_DISCOVER_INTERVAL_MS > 0
      ? setInterval(() => {
          void eshopCrawlerService.discoverNewGames().catch((error) => {
            console.error("crawler discover failed", error);
          });
        }, env.CRAWLER_DISCOVER_INTERVAL_MS)
      : null;

  const crawlerPriceRefreshTimer =
    env.CRAWLER_PRICE_REFRESH_INTERVAL_MS > 0
      ? setInterval(() => {
          void eshopCrawlerService.refreshStalePrices().catch((error) => {
            console.error("crawler price refresh failed", error);
          });
        }, env.CRAWLER_PRICE_REFRESH_INTERVAL_MS)
      : null;

  crawlerDiscoverTimer?.unref?.();
  crawlerPriceRefreshTimer?.unref?.();

  // Trigger initial crawl on startup (non-blocking)
  if (!env.NINTENDO_MOCK || env.STORAGE_MODE === "postgres") {
    void eshopCrawlerService.discoverNewGames().then((result) => {
      console.log(`Initial crawl: discovered=${result.discovered}, skipped=${result.skipped}, errors=${result.errors}`);
    }).catch((error) => {
      console.error("Initial crawl failed", error);
    });
  }

  return {
    env,
    repository,
    catalogService,
    marketService,
    nintendoClient,
    visualizationService,
    playtimeService,
    syncService,
    eshopPriceService,
    eshopCrawlerService,
    emailService,
    close: async () => {
      if (catalogRefreshTimer) {
        clearInterval(catalogRefreshTimer);
      }
      if (crawlerDiscoverTimer) {
        clearInterval(crawlerDiscoverTimer);
      }
      if (crawlerPriceRefreshTimer) {
        clearInterval(crawlerPriceRefreshTimer);
      }
      if (repositoryContext) {
        await repositoryContext.close();
      }
    }
  };
}
