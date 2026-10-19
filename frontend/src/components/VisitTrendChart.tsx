'use client';

import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import RequestTrendChart from './RequestTrendChart';
import type { RequestDateRange } from '@/lib/request-statistics';
import styles from './VisitTrendChart.module.css';

interface DailyVisit { date: string; count: number; }

function dateLabel(date: string) {
  const [, month, day] = date.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

export default function VisitTrendChart({ data, unavailable = false, range, compact = false }: {
  data: DailyVisit[];
  unavailable?: boolean;
  range?: RequestDateRange;
  compact?: boolean;
}) {
  const [period, setPeriod] = useState<7 | 30>(7);
  const ordered = useMemo(() => data
    .filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date) && Number.isFinite(day.count))
    .map(day => ({ ...day, count: Math.max(0, day.count) }))
    .sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const days = useMemo(() => range
    ? ordered.filter(day => day.date >= range.start && day.date <= range.end)
    : ordered.slice(-period), [ordered, range, period]);
  const previous = range ? [] : ordered.slice(-period * 2, -period);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const previousTotal = previous.reduce((sum, day) => sum + day.count, 0);
  const change = previous.length === period && days.length === period && previousTotal > 0
    ? (total - previousTotal) / previousTotal * 100 : null;
  const samples = useMemo(() => days.map(day => ({
    key: day.date,
    label: range ? day.date : dateLabel(day.date),
    axisLabel: `${Number(day.date.slice(5, 7))}/${Number(day.date.slice(8))}`,
    count: day.count,
  })), [days, range]);

  return <RequestTrendChart data={samples} unavailable={unavailable} compact={compact}
    title={range ? '每日请求趋势' : '访问趋势'}
    subtitle={range ? `${range.start} — ${range.end} · 全部请求`
      : days.length && !unavailable ? `${dateLabel(days[0].date)} — ${dateLabel(days.at(-1)!.date)}` : '了解博客每天的访问情况'}
    metricLabel={range ? '所选日期请求量' : `近 ${period} 天访问量`}
    controls={!range && <div className={styles.segmented} role="group" aria-label="时间范围">
      {([7, 30] as const).map(value => <button type="button" key={value} aria-label={`近${value}天`} aria-pressed={period === value}
        disabled={unavailable} className={styles.rangeButton} onClick={() => setPeriod(value)}>近 {value} 天</button>)}
    </div>}
    comparison={change !== null && !unavailable && <div className={styles.comparison}>
      <span className={styles.change} data-positive={change > 0}>
        {change === 0 ? <Minus size={14} aria-hidden="true" /> : change > 0 ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
        {change > 0 ? '+' : ''}{change.toFixed(1)}%
      </span><span>较前 {period} 天</span>
    </div>} />;
}
