export const SITE_TIME_ZONE = 'Asia/Shanghai';

const dateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: SITE_TIME_ZONE, dateStyle: 'short' });

export function legacyDateKey(date: Date | number) {
  return dateFormatter.format(date);
}
