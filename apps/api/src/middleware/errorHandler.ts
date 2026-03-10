import type { Middleware } from "koa";

export const errorHandlerMiddleware: Middleware = async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message === "Unauthorized" ? 401 : 500;
    ctx.status = status;
    ctx.body = {
      message
    };
  }
};
