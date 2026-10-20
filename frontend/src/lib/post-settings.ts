import { localDateTimeTimestamp } from './date-value';

export type ExcerptMode = 'manual' | 'auto';

export function toDateTimeLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function scheduledTimestamp(value: string, status: string): string | null {
  return value && status === 'draft' ? localDateTimeTimestamp(value, '定时发布时间') : null;
}
