import { createAppDependencies } from "./container.js";
import { createApp } from "./app.js";

async function bootstrap() {
  const deps = await createAppDependencies();
  const { app } = await createApp({ deps });
  const server = app.listen(deps.env.PORT, () => {
    console.log(`API listening on http://localhost:${deps.env.PORT}`);
  });

  const cleanup = async () => {
    server.close();
    await deps.close();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
