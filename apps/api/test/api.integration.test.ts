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

  beforeAll(async () => {
    const env = loadEnv({
      STORAGE_MODE: "memory",
      NODE_ENV: "test",
      JWT_SECRET: "test_secret_1234567890",
      ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      NINTENDO_MOCK: true
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

    const gamesRes = await request(appCallback)
      .get("/api/games")
      .query({ tab: "owned" })
      .set("Authorization", `Bearer ${token}`);
    expect(gamesRes.status).toBe(200);
    expect(gamesRes.body.items.length).toBeGreaterThan(0);
    firstGameId = gamesRes.body.items[0].id;

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
  });
});
