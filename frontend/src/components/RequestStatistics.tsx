'use client';
import { Tooltip } from '@/components/ui/Tooltip';

import { useId, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock, Globe } from 'lucide-react';
import RequestTrendChart from './RequestTrendChart';
import styles from './RequestStatistics.module.css';

interface NameCount { name: string; count: number; }
const number = new Intl.NumberFormat('zh-CN');
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });

export function RequestSummary({ stats }: { stats: { total_requests: number; unique_ips: number; total_errors: number; avg_response_ms: number } }) {
  const cards = [
    { label: '总请求', value: number.format(stats.total_requests), note: '按请求计数', icon: Activity },
    { label: '独立 IP', value: number.format(stats.unique_ips), note: '按来源 IP 去重', icon: Globe },
    { label: '错误请求', value: number.format(stats.total_errors), note: '4xx 与 5xx 响应', icon: AlertTriangle, alert: stats.total_errors > 0 },
    { label: '平均响应', value: number.format(Math.round(stats.avg_response_ms)), unit: 'ms', note: '服务端平均耗时', icon: Clock },
  ];
  return <dl className={styles.metrics} aria-label="日期范围内请求概况">
    {cards.map(card => <div key={card.label} className={styles.metric} data-alert={card.alert || undefined}>
      <dt><card.icon size={15} aria-hidden="true" />{card.label}</dt>
      <dd>{card.value}{card.unit && <span>{card.unit}</span>}</dd><p>{card.note}</p>
    </div>)}
  </dl>;
}

export function RequestBreakdown({ title, data, total, status = false }: { title: string; data: NameCount[]; total: number; status?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const items = useMemo(() => data.filter(item => Number.isFinite(item.count) && item.count > 0)
    .slice().sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)), [data]);
  const visible = expanded ? items : items.slice(0, 8);
  const max = Math.max(items[0]?.count || 0, 1);
  return <section className={styles.breakdown} aria-label={title}>
    <header><h2>{title}</h2><span>请求数 / 占比</span></header>
    <p className={styles.note}>占日期范围内全部请求{!status && items.length >= 20 ? ' · 请求量前 20 项' : ''}</p>
    {items.length ? <>
      <ol id={id} className={styles.ranking}>
        {visible.map((item, index) => {
          const name = !item.name.trim() || item.name.toLowerCase() === 'unknown' ? '未知' : item.name;
          const tone = status ? item.name.startsWith('5') ? 'error' : item.name.startsWith('4') ? 'warning' : item.name.startsWith('2') ? 'success' : 'neutral' : undefined;
          const share = total > 0 ? item.count / total : null;
          return <li key={item.name} data-tone={tone}>
            <div className={styles.rankingHeader}>
              <Tooltip content={name}><span className={styles.name} data-tooltip={name}>{!status && <small aria-hidden="true">{String(index + 1).padStart(2, '0')}</small>}{status ? <code>{name}</code> : name}</span></Tooltip>
              <span className={styles.value}><strong>{number.format(item.count)}</strong><span>{share === null ? '—' : share > 0 && share < .001 ? '<0.1%' : percent.format(share)}</span></span>
            </div>
            <div className={styles.track} aria-hidden="true"><div style={{ width: `${item.count / max * 100}%` }} /></div>
          </li>;
        })}
      </ol>
      {items.length > 8 && <button type="button" className={styles.expand} aria-controls={id} aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}>{expanded ? '收起排行' : `查看其余 ${items.length - 8} 项`}</button>}
    </> : <p className={styles.empty}>所选日期暂无记录</p>}
  </section>;
}

export function RequestHours({ data }: { data: { hour: number; count: number }[] }) {
  const samples = useMemo(() => {
    const hours = Array<number>(24).fill(0);
    for (const item of data) {
      if (Number.isInteger(item.hour) && item.hour >= 0 && item.hour < 24 && Number.isFinite(item.count)) hours[item.hour] += Math.max(0, item.count);
    }
    return hours.map((count, hour) => ({ key: `hour-${hour}`, count,
      label: `${String(hour).padStart(2, '0')}:00 — ${String(hour + 1).padStart(2, '0')}:00`, axisLabel: `${String(hour).padStart(2, '0')}:00` }));
  }, [data]);
  return <RequestTrendChart data={samples} title="时段分布" subtitle="所选日期按小时汇总 · UTC+8" metricLabel="各小时累计请求量"
    initialMode="bar" height={188} legend="每小时请求量" averageLabel="时均" bucketLabel="时段" compact />;
}
