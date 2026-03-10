import { describe, expect, it } from "vitest";
import { calculateEffectivePlaytime, type PlaytimeCorrection } from "../src/index.js";

const now = "2026-03-10T10:00:00.000Z";

function correction(input: Partial<PlaytimeCorrection>): PlaytimeCorrection {
  return {
    id: input.id ?? crypto.randomUUID(),
    userId: input.userId ?? "u1",
    gameId: input.gameId ?? "g1",
    type: input.type ?? "ADD_DELTA",
    minutes: input.minutes ?? 0,
    reason: input.reason ?? "test",
    createdAt: input.createdAt ?? now,
    revokedAt: input.revokedAt ?? null
  };
}

describe("calculateEffectivePlaytime", () => {
  it("uses official playtime when no corrections exist", () => {
    const result = calculateEffectivePlaytime({
      gameId: "g1",
      officialMinutes: 120,
      corrections: [],
      now
    });
    expect(result.totalMinutes).toBe(120);
    expect(result.source).toBe("official");
  });

  it("supports manual-only game with delta corrections", () => {
    const result = calculateEffectivePlaytime({
      gameId: "g1",
      officialMinutes: null,
      corrections: [correction({ minutes: 45 })],
      now
    });
    expect(result.totalMinutes).toBe(45);
    expect(result.source).toBe("manual-only");
  });

  it("uses latest SET_TOTAL as baseline and applies later ADD_DELTA", () => {
    const result = calculateEffectivePlaytime({
      gameId: "g1",
      officialMinutes: 120,
      corrections: [
        correction({ type: "ADD_DELTA", minutes: 20, createdAt: "2026-03-01T00:00:00.000Z" }),
        correction({ type: "SET_TOTAL", minutes: 200, createdAt: "2026-03-02T00:00:00.000Z" }),
        correction({ type: "ADD_DELTA", minutes: -10, createdAt: "2026-03-03T00:00:00.000Z" })
      ],
      now
    });
    expect(result.totalMinutes).toBe(190);
    expect(result.source).toBe("corrected");
  });

  it("ignores revoked corrections", () => {
    const result = calculateEffectivePlaytime({
      gameId: "g1",
      officialMinutes: 120,
      corrections: [
        correction({ minutes: 10 }),
        correction({ minutes: 50, revokedAt: "2026-03-09T00:00:00.000Z" })
      ],
      now
    });
    expect(result.totalMinutes).toBe(130);
  });

  it("clamps negative totals to zero", () => {
    const result = calculateEffectivePlaytime({
      gameId: "g1",
      officialMinutes: 10,
      corrections: [correction({ minutes: -30 })],
      now
    });
    expect(result.totalMinutes).toBe(0);
  });
});
