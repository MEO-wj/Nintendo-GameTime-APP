import { createHash } from "node:crypto";
import type { AppEnv } from "../config/env.js";
import type { NintendoFetchedGame } from "../types/domain.js";

export interface NintendoClient {
  fetchUserGames(sessionToken: string): Promise<NintendoFetchedGame[]>;
}

function seededNumber(seed: string, min: number, max: number): number {
  const hash = createHash("sha256").update(seed).digest("hex");
  const value = Number.parseInt(hash.slice(0, 8), 16);
  return min + (value % (max - min + 1));
}

function mockGames(sessionToken: string): NintendoFetchedGame[] {
  const daySeed = new Date().toISOString().slice(0, 10);
  const base = `${sessionToken}:${daySeed}`;
  return [
    {
      externalId: "switch-zelda-botw",
      title: "The Legend of Zelda: Breath of the Wild",
      coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7h.jpg",
      region: "JP",
      platform: "Switch",
      priceJpy: 7678,
      playedMinutes: seededNumber(`${base}:botw`, 100, 320) * 60,
      ownedAt: "2025-01-16T10:00:00.000Z",
      lastPlayedAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      externalId: "switch-mario-odyssey",
      title: "Super Mario Odyssey",
      coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1mxf.jpg",
      region: "JP",
      platform: "Switch",
      priceJpy: 6578,
      playedMinutes: seededNumber(`${base}:odyssey`, 40, 180) * 60,
      ownedAt: "2025-10-05T08:00:00.000Z",
      lastPlayedAt: new Date(Date.now() - 5 * 86400000).toISOString()
    },
    {
      externalId: "switch-dead-cells",
      title: "Dead Cells",
      coverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1q7d.jpg",
      region: "JP",
      platform: "Switch",
      priceJpy: 2480,
      playedMinutes: seededNumber(`${base}:deadcells`, 20, 120) * 60,
      ownedAt: "2026-03-04T10:00:00.000Z",
      lastPlayedAt: new Date(Date.now() - 2 * 86400000).toISOString()
    },
    {
      externalId: "switch-manual-only",
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
