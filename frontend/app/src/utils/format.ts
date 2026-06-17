// Utility functions ported from Web frontend (pure functions, no DOM dependencies)

/** Minutes → hours (e.g. 210 → "3.5h", 30 → "0.5h", 60 → "1h") */
export function formatDuration(minutes: number): string {
  if (minutes === 0) return "0h";
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${parseFloat(hours.toFixed(1))}h`;
}

/** Numeric score → string (e.g. 8.5 → "8.5") */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

/** 0–100 score → percentage string */
export function formatPercentScore(score: number): string {
  return `${Math.round(score)}`;
}

/** Clamp score to 0.1–10.0 range */
export function clampPlayerScore(score: number): number {
  return Math.max(0.1, Math.min(10, Math.round(score * 10) / 10));
}

// FX rates (EUR base, same as backend)
const FX_RATES: Record<string, number> = {
  EUR: 1, USD: 1.08, GBP: 0.86, JPY: 162.5,
  CNY: 7.72, HKD: 8.45, KRW: 1430, AUD: 1.65,
  CAD: 1.47, NZD: 1.78, CHF: 0.94,
};

/** Convert amount from one currency to another via EUR */
export function convertCurrency(amount: number, from: string, to: string): number {
  const fromRate = FX_RATES[from] ?? 1;
  const toRate = FX_RATES[to] ?? 1;
  return (amount / fromRate) * toRate;
}

/** Format price with currency symbol */
export function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    JPY: "¥", CNY: "¥", USD: "$", EUR: "€",
    GBP: "£", HKD: "HK$", KRW: "₩", AUD: "A$",
    CAD: "C$", NZD: "NZ$", CHF: "CHF",
  };
  const sym = symbols[currency] ?? currency + " ";
  const dec = ["JPY", "KRW"].includes(currency) ? 0 : 2;
  return `${sym}${amount.toFixed(dec)}`;
}

/** Format price for display, optionally converting to CNY */
export function formatDisplayCurrency(
  amount: number,
  priceCurrency: string,
  marketMode: "DOMESTIC" | "GLOBAL" = "GLOBAL"
): string {
  if (marketMode === "DOMESTIC") {
    const cny = convertCurrency(amount, priceCurrency, "CNY");
    return `¥${Math.round(cny)}`;
  }
  return formatCurrency(amount, priceCurrency === "" ? "JPY" : priceCurrency);
}

/** Extract error message from Axios error or fallback */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const axiosErr = error as { response?: { data?: { message?: string } }; message?: string };
    if (axiosErr.response?.data?.message) return axiosErr.response.data.message;
    if (axiosErr.message) return axiosErr.message;
  }
  return fallback;
}

/** Derive nickname from email */
export function getNickname(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}
