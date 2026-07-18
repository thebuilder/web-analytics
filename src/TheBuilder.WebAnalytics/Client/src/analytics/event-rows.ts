import type { AnalyticsEventRow } from "../api/types.gen.js";

export function visibleEventRows(rows: AnalyticsEventRow[]): AnalyticsEventRow[] {
  return rows.filter(({ eventName }) => {
    const value = eventName.trim().toLocaleLowerCase();
    return value.length > 0 && value !== "others";
  });
}

export function topEventRows(rows: AnalyticsEventRow[], limit = 10): AnalyticsEventRow[] {
  return visibleEventRows(rows).slice(0, limit);
}
