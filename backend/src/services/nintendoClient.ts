import { createHash } from "node:crypto";
import type { AppEnv } from "../config/env.js";
import type { NintendoFetchedGame } from "../types/domain.js";
import { getCatalogSeeds } from "./catalogService.js";

export interface NintendoClient {
  fetchUserGames(sessionToken: string): Promise<NintendoFetchedGame[]>;
}

function seededNumber(seed: string, min: number, max: number): number {
  const hash = createHash("sha256").update(seed).digest("hex");
  const value = Number.parseInt(hash.slice(0, 8), 16);
  return min + (value % (max - min + 1));
}

async function mockGames(sessionToken: string): Promise<NintendoFetchedGame[]> {
  const daySeed = new Date().toISOString().slice(0, 10);
  const base = `${sessionToken}:${daySeed}`;

  const seedIds = [
    "the-legend-of-zelda-breath-of-the-wild-switch",
    "super-mario-odyssey-switch",
    "dead-cells-switch",
    "hollow-knight-switch"
  ];
  const catalogGames = getCatalogSeeds().filter((entry) => seedIds.includes(entry.externalId));

  return [
    ...catalogGames
      .map((entry, index) => ({
        externalId: entry.externalId,
        title: entry.title,
        coverUrl: entry.fallbackCoverUrl,
        region: "GLOBAL" as const,
        platform: "Switch" as const,
        priceJpy: entry.fallbackPriceAmount,
        playedMinutes: seededNumber(`${base}:${entry.externalId}`, 20 + index * 10, 160 + index * 40) * 60,
        ownedAt: new Date(Date.now() - (20 + index * 9) * 86400000).toISOString(),
        lastPlayedAt: new Date(Date.now() - (index + 1) * 86400000).toISOString()
      })),
    {
      externalId: "manual-tracked-game",
      title: "Manual Tracked Game",
      coverUrl: null,
      region: "UNKNOWN",
      platform: "Switch",
      priceJpy: null,
      playedMinutes: null,
      ownedAt: null,
      lastPlayedAt: null
    }
  ];
}

export function createNintendoClient(env: AppEnv): NintendoClient {
  if (env.NINTENDO_MOCK) {
    return {
      fetchUserGames: async (sessionToken: string) => mockGames(sessionToken)
    };
  }

  return {
    fetchUserGames: async (sessionToken: string) => {
      const response = await fetch("https://api-lp1.znc.srv.nintendo.net/v3/Friend/GetGameList", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error(`Nintendo API failed: ${response.status}`);
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const items = Array.isArray(payload.games) ? payload.games : [];
      return items.map((entry, index) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        return {
          externalId: String(row.id ?? `external-${index}`),
          title: String(row.title ?? "Unknown Game"),
          coverUrl: row.imageUri ? String(row.imageUri) : null,
          region: "JP",
          platform: "Switch",
          priceJpy: row.price ? Number(row.price) : null,
          playedMinutes: row.playedMinutes ? Number(row.playedMinutes) : null,
          ownedAt: row.ownedAt ? String(row.ownedAt) : null,
          lastPlayedAt: row.lastPlayedAt ? String(row.lastPlayedAt) : null
        } satisfies NintendoFetchedGame;
      });
    }
  };
}
