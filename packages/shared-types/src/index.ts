export type CorrectionType = "SET_TOTAL" | "ADD_DELTA";

export interface Game {
  id: string;
  userId: string;
  title: string;
  coverUrl?: string;
  region: "JP" | "GLOBAL" | "UNKNOWN";
  platform: "Switch";
  priceJpy?: number | null;
  ownedAt?: string | null;
  lastPlayedAt?: string | null;
}

export interface OfficialSnapshot {
  id: string;
  userId: string;
  gameId: string;
  playedMinutes: number | null;
  rawPayload: Record<string, unknown>;
  capturedAt: string;
}

export interface PlaytimeCorrection {
  id: string;
  userId: string;
  gameId: string;
  type: CorrectionType;
  minutes: number;
  reason: string;
  createdAt: string;
  revokedAt?: string | null;
}

export interface EffectivePlaytime {
  gameId: string;
  officialMinutes: number | null;
  correctionDeltaMinutes: number;
  totalMinutes: number;
  source: "official" | "corrected" | "manual-only";
  updatedAt: string;
}

export interface SyncJob {
  id: string;
  userId: string;
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED";
  triggeredBy: "MANUAL" | "SCHEDULED" | "BIND";
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  errorSummary?: string | null;
}

export function calculateEffectivePlaytime(params: {
  gameId: string;
  officialMinutes: number | null;
  corrections: PlaytimeCorrection[];
  now?: string;
}): EffectivePlaytime {
  const now = params.now ?? new Date().toISOString();
  const activeCorrections = params.corrections
    .filter((entry) => !entry.revokedAt)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const latestSetTotal = [...activeCorrections]
    .reverse()
    .find((entry) => entry.type === "SET_TOTAL");

  let totalMinutes = params.officialMinutes ?? 0;
  let source: EffectivePlaytime["source"] =
    params.officialMinutes === null ? "manual-only" : "official";

  if (latestSetTotal) {
    const baseMinutes = latestSetTotal.minutes;
    const deltaAfterSet = activeCorrections
      .filter((entry) => entry.type === "ADD_DELTA" && Date.parse(entry.createdAt) > Date.parse(latestSetTotal.createdAt))
      .reduce((acc, curr) => acc + curr.minutes, 0);

    totalMinutes = baseMinutes + deltaAfterSet;
    source = "corrected";
  } else {
    const deltaMinutes = activeCorrections
      .filter((entry) => entry.type === "ADD_DELTA")
      .reduce((acc, curr) => acc + curr.minutes, 0);
    totalMinutes = (params.officialMinutes ?? 0) + deltaMinutes;
    if (deltaMinutes !== 0 || params.officialMinutes === null) {
      source = params.officialMinutes === null ? "manual-only" : "corrected";
    }
  }

  const clampedTotal = Math.max(0, totalMinutes);
  const official = params.officialMinutes ?? 0;
  const correctionDeltaMinutes = clampedTotal - official;

  return {
    gameId: params.gameId,
    officialMinutes: params.officialMinutes,
    correctionDeltaMinutes,
    totalMinutes: clampedTotal,
    source,
    updatedAt: now
  };
}

export function calculateEffectivePlaytimeMap(params: {
  officialMinutesByGame: Record<string, number | null>;
  correctionsByGame: Record<string, PlaytimeCorrection[]>;
  now?: string;
}): Record<string, EffectivePlaytime> {
  const allGameIds = new Set([
    ...Object.keys(params.officialMinutesByGame),
    ...Object.keys(params.correctionsByGame)
  ]);

  const result: Record<string, EffectivePlaytime> = {};
  for (const gameId of allGameIds) {
    result[gameId] = calculateEffectivePlaytime({
      gameId,
      officialMinutes: params.officialMinutesByGame[gameId] ?? null,
      corrections: params.correctionsByGame[gameId] ?? [],
      now: params.now
    });
  }
  return result;
}
