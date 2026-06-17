import dayjs from "dayjs";

/** ISO date string → readable format (e.g. "2024-05-09") */
export function formatSimpleDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return dayjs(iso).format("YYYY-MM-DD");
}

/** ISO date string → Chinese relative time */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = dayjs(iso);
  const now = dayjs();
  const diffMins = now.diff(d, "minute");
  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins}分钟前`;
  const diffHours = now.diff(d, "hour");
  if (diffHours < 24) return `${diffHours}小时前`;
  const diffDays = now.diff(d, "day");
  if (diffDays < 30) return `${diffDays}天前`;
  const diffMonths = now.diff(d, "month");
  if (diffMonths < 12) return `${diffMonths}个月前`;
  return d.format("YYYY-MM-DD");
}

/** Format data source label */
export function formatSourceText(source: string): string {
  switch (source) {
    case "official": return "官方同步";
    case "corrected": return "已修正";
    case "manual-only": return "手动记录";
    default: return source;
  }
}
