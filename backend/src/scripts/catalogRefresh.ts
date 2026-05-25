import { loadEnv } from "../config/env.js";
import { createRepository } from "../repositories/index.js";
import { createCatalogService } from "../services/catalogService.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const repositoryContext = await createRepository(env);
  const catalogService = createCatalogService(repositoryContext.repository);

  try {
    const result = await catalogService.refreshCatalog();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await repositoryContext.close();
  }
}

void main();
