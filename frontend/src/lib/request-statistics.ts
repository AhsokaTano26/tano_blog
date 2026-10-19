export interface RequestDateRange { start: string; end: string; }

/** Inclusive calendar days, matching the API's UTC+8 grouping. */
export function recentRequestRange(days: 7 | 30 | 90, now = Date.now()): RequestDateRange {
  const end = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  const start = new Date(Date.parse(end) - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { start, end };
}
