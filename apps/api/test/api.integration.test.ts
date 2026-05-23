import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createAppDependencies } from "../src/container.js";
import { loadEnv } from "../src/config/env.js";
import { MemoryRepository } from "../src/repositories/memoryRepository.js";

describe("API integration", () => {
  let appCallback: ReturnType<Awaited<ReturnType<typeof createApp>>["app"]["callback"]>;
  let token = "";
  let firstGameId = "";
  let firstExternalId = "";

  beforeAll(async () => {
    const env = loadEnv({
      STORAGE_MODE: "memory",
      NODE_ENV: "test",
      JWT_SECRET: "test_secret_1234567890",
      ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      NINTENDO_MOCK: true,
      R_VISUALIZATION_ENABLED: false
    });
    const deps = await createAppDependencies({
      env,
      repository: new MemoryRepository()
    });
    const { app } = await createApp({ deps });
    appCallback = app.callback();
  });

  it("blocks protected routes without auth", async () => {
    const res = await request(appCallback).get("/api/dashboard/summary");
    expect(res.status).toBe(401);
  });

  it("supports login -> bind -> dashboard -> correction -> revoke flow", async () => {
    const otpRes = await request(appCallback)
      .post("/api/auth/login")
      .send({ email: "test@example.com" });
    expect(otpRes.status).toBe(200);
    const code = otpRes.body.devCode;
    expect(code).toBeTruthy();

    const loginRes = await request(appCallback)
      .post("/api/auth/login")
      .send({ email: "test@example.com", code });
    expect(loginRes.status).toBe(200);
    token = loginRes.body.token;
    expect(token).toBeTruthy();

    const bindRes = await request(appCallback)
      .post("/api/accounts/nintendo/bind")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessionToken: "mock_session_token_abcdefg", region: "JP" });
    expect(bindRes.status).toBe(200);

    const summaryRes = await request(appCallback)
      .get("/api/dashboard/summary")
      .set("Authorization", `Bearer ${token}`);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.totalGames).toBeGreaterThan(0);

    const chartsRes = await request(appCallback)
      .get("/api/dashboard/charts")
      .query({ range: "30d" })
      .set("Authorization", `Bearer ${token}`);
    expect(chartsRes.status).toBe(200);
    expect(chartsRes.body.ranking.length).toBeGreaterThan(0);
    expect(chartsRes.body.visualizations.engine).toBe("typescript-fallback");
    expect(chartsRes.body.visualizations.options.playtimeDonut.option.series[0].type).toBe("pie");
    expect(chartsRes.body.visualizations.options.playtimeRanking.option.series[0].type).toBe("bar");
    expect(chartsRes.body.visualizations.options.playtimeTreemap.option.series[0].type).toBe("treemap");

    const gamesRes = await request(appCallback)
      .get("/api/games")
      .query({ tab: "owned" })
      .set("Authorization", `Bearer ${token}`);
    expect(gamesRes.status).toBe(200);
    expect(gamesRes.body.items.length).toBeGreaterThan(0);
    firstGameId = gamesRes.body.items[0].id;
    firstExternalId = gamesRes.body.items[0].externalId;

    const ratingRes = await request(appCallback)
      .put(`/api/games/${firstGameId}/rating`)
      .set("Authorization", `Bearer ${token}`)
      .send({ score: 8.4 });
    expect(ratingRes.status).toBe(200);
    expect(ratingRes.body.rating.userScore).toBe(8.4);
    expect(ratingRes.body.rating.averageScore).toBe(8.4);
    expect(ratingRes.body.rating.ratingCount).toBe(1);

    const detailRes = await request(appCallback)
      .get(`/api/games/${firstGameId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.playerRating.userScore).toBe(8.4);
    expect(detailRes.body.playerRating.ratingCount).toBe(1);

    const catalogDetailRes = await request(appCallback)
      .get(`/api/catalog/games/${firstExternalId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(catalogDetailRes.status).toBe(200);
    expect(catalogDetailRes.body.criticScore).not.toBeUndefined();
    expect(catalogDetailRes.body.playerRating.userScore).toBe(8.4);

    const catalogRatingRes = await request(appCallback)
      .put(`/api/catalog/games/${firstExternalId}/rating`)
      .set("Authorization", `Bearer ${token}`)
      .send({ score: 9.1 });
    expect(catalogRatingRes.status).toBe(200);
    expect(catalogRatingRes.body.rating.userScore).toBe(9.1);
    expect(catalogRatingRes.body.rating.averageScore).toBe(9.1);

    const correctionRes = await request(appCallback)
      .post("/api/playtime/corrections")
      .set("Authorization", `Bearer ${token}`)
      .send({
        gameId: firstGameId,
        type: "ADD_DELTA",
        minutes: 30,
        reason: "manual adjustment"
      });
    expect(correctionRes.status).toBe(201);
    const correctionId = correctionRes.body.correction.id;

    const revokeRes = await request(appCallback)
      .post(`/api/playtime/corrections/${correctionId}/revoke`)
      .set("Authorization", `Bearer ${token}`);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.correction.revokedAt).toBeTruthy();
  }, 30000);
});
