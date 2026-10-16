'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, LineChart, Minus } from 'lucide-react';
import styles from './VisitTrendChart.module.css';

interface DailyVisit {
  date: string;
  count: number;
}

interface Point {
  x: number;
  y: number;
}

const number = new Intl.NumberFormat('zh-CN');
const axisNumber = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const height = 232;
const inset = { top: 16, right: 12, bottom: 34, left: 44 };

function dateLabel(date: string) {
  const [, month, day] = date.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

// Monotone cubic segments keep the curve inside adjacent daily values.
function curve(points: Point[]) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const slopes = points.slice(1).map((point, i) => (point.y - points[i].y) / (point.x - points[i].x));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === points.length - 1) return slopes[i - 1];
    const before = slopes[i - 1], after = slopes[i];
    return before * after <= 0 ? 0 : 2 * before * after / (before + after);
  });
  return points.reduce((path, point, i) => {
    if (!i) return `M ${point.x} ${point.y}`;
    const previous = points[i - 1];
    const third = (point.x - previous.x) / 3;
    return `${path} C ${previous.x + third} ${previous.y + tangents[i - 1] * third}, ${point.x - third} ${point.y - tangents[i] * third}, ${point.x} ${point.y}`;
  }, '');
}

function scaleStep(max: number) {
  const rough = Math.max(max, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const multiple = [1, 2, 2.5, 5, 10].find(value => value * magnitude >= rough) ?? 10;
  return Math.max(1, Math.ceil(multiple * magnitude));
}

export default function VisitTrendChart({ data, unavailable = false }: { data: DailyVisit[]; unavailable?: boolean }) {
  const [period, setPeriod] = useState<7 | 30>(7);
  const [mode, setMode] = useState<'line' | 'bar'>('line');
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(720);
  const plotRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const measure = (value: number) => { if (value > 0) setWidth(Math.round(value)); };
    measure(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ordered = useMemo(() => data
    .filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date) && Number.isFinite(day.count))
    .map(day => ({ ...day, count: Math.max(0, day.count) }))
    .sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const days = ordered.slice(-period);
  const previous = ordered.slice(-period * 2, -period);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const previousTotal = previous.reduce((sum, day) => sum + day.count, 0);
  const change = previous.length === period && days.length === period && previousTotal > 0
    ? (total - previousTotal) / previousTotal * 100 : null;
  const max = Math.max(...days.map(day => day.count), 0);
  const step = scaleStep(max);
  const ceiling = step * 4;
  const baseY = height - inset.bottom;
  const plotHeight = baseY - inset.top;
  const plotWidth = Math.max(1, width - inset.left - inset.right);
  const band = plotWidth / Math.max(1, days.length);
  const points = days.map((day, i) => ({
    x: inset.left + band * (i + 0.5),
    y: baseY - day.count / ceiling * plotHeight,
  }));
  const path = curve(points);
  const selected = active === null || !days.length ? null : Math.min(active, days.length - 1);
  const selectedPoint = selected === null ? null : points[selected];
  const labelStep = Math.max(1, Math.ceil((days.length - 1) / (width < 480 ? 3 : 7)));
  const hasVisits = total > 0 && !unavailable;

  const selectAtPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!hasVisits) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / Math.max(1, bounds.width) * width;
    setActive(Math.max(0, Math.min(days.length - 1, Math.floor((x - inset.left) / band))));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!hasVisits) return;
    const current = selected ?? days.length - 1;
    switch (event.key) {
      case 'ArrowLeft': setActive(Math.max(0, current - 1)); break;
      case 'ArrowRight': setActive(Math.min(days.length - 1, current + 1)); break;
      case 'Home': setActive(0); break;
      case 'End': setActive(days.length - 1); break;
      case 'Escape': setActive(null); break;
      default: return;
    }
    event.preventDefault();
  };

  return (
    <section className={styles.card} aria-label="访问趋势">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>访问趋势</h2>
          <p className={styles.dateRange}>
            {days.length && !unavailable ? `${dateLabel(days[0].date)} — ${dateLabel(days.at(-1)!.date)}` : '了解博客每天的访问情况'}
          </p>
        </div>
        <div className={styles.controls}>
          <div className={styles.segmented} role="group" aria-label="时间范围">
            {([7, 30] as const).map(value => (
              <button type="button" key={value} aria-label={`近${value}天`} aria-pressed={period === value} disabled={unavailable}
                className={styles.rangeButton} onClick={() => { setPeriod(value); setActive(null); }}>
                近 {value} 天
              </button>
            ))}
          </div>
          <div className={styles.segmented} role="group" aria-label="图表类型">
            {([{ value: 'line', label: '折线图', icon: LineChart }, { value: 'bar', label: '柱状图', icon: BarChart3 }] as const).map(item => (
              <button type="button" key={item.value} aria-label={item.label} title={item.label} aria-pressed={mode === item.value}
                className={styles.modeButton} disabled={unavailable} onClick={() => setMode(item.value)}>
                <item.icon size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={styles.metricRow}>
        <div>
          <p className={styles.metricLabel}>近 {period} 天访问量</p>
          <div className={styles.metric}>
            <output aria-label="所选时段访问量">{unavailable ? '—' : number.format(total)}</output>
            <span>次请求</span>
          </div>
        </div>
        {change !== null && !unavailable && (
          <div className={styles.comparison}>
            <span className={styles.change} data-positive={change > 0}>
              {change === 0 ? <Minus size={14} aria-hidden="true" /> : change > 0 ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
              {change > 0 ? '+' : ''}{change.toFixed(1)}%
            </span>
            <span>较前 {period} 天</span>
          </div>
        )}
      </div>

      <div ref={plotRef} className={styles.plot} role="group" tabIndex={hasVisits ? 0 : -1}
        aria-label="每日访问量，使用左右方向键查看日期，按 Escape 关闭提示"
        onPointerMove={selectAtPointer} onPointerDown={selectAtPointer}
        onPointerLeave={event => {
          // Touch pointers leave before synthetic mouse focus; keep their value pinned.
          if (event.pointerType !== 'touch' && event.currentTarget !== document.activeElement) setActive(null);
        }}
        onFocus={() => { if (hasVisits) setActive(current => current ?? days.length - 1); }} onBlur={() => setActive(null)} onKeyDown={onKeyDown}>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`}>
          <title id={`${id}-title`}>近 {period} 天每日访问量{unavailable ? '暂不可用' : `，共 ${number.format(total)} 次请求`}</title>
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.015" />
            </linearGradient>
          </defs>
          {[4, 3, 2, 1, 0].map(tick => {
            const y = baseY - tick / 4 * plotHeight;
            return (
              <g key={tick}>
                <line x1={inset.left} x2={width - inset.right} y1={y} y2={y} className={styles.gridLine} strokeDasharray={tick ? '3 5' : undefined} />
                {hasVisits && <text x={inset.left - 12} y={y + 4} textAnchor="end" className={styles.axisText}>{axisNumber.format(tick * step)}</text>}
              </g>
            );
          })}
          {hasVisits && mode === 'line' && (
            <>
              {points.length > 1 && <path d={`${path} L ${points.at(-1)!.x} ${baseY} L ${points[0].x} ${baseY} Z`} fill={`url(#${id}-fill)`} />}
              <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={points.at(-1)!.x} cy={points.at(-1)!.y} r={3.5} fill="var(--primary)" />
            </>
          )}
          {hasVisits && mode === 'bar' && points.map((point, i) => (
            <rect key={days[i].date} x={point.x - Math.min(32, band * 0.5) / 2} y={point.y}
              width={Math.min(32, band * 0.5)} height={baseY - point.y} rx={4}
              fill="var(--primary)" opacity={selected === null || selected === i ? 0.85 : 0.3} />
          ))}
          {selectedPoint && hasVisits && (
            <>
              <line x1={selectedPoint.x} x2={selectedPoint.x} y1={inset.top} y2={baseY} stroke="var(--primary)" strokeOpacity={0.35} strokeDasharray="3 4" />
              {mode === 'line' && <circle cx={selectedPoint.x} cy={selectedPoint.y} r={5} fill="var(--primary)" stroke="var(--color-bg)" strokeWidth={2.5} />}
            </>
          )}
          {!unavailable && days.map((day, i) => (i % labelStep === 0 || i === days.length - 1) && (
            <text key={day.date} x={points[i].x} y={height - 8} textAnchor="middle" className={styles.axisText}>
              {Number(day.date.slice(5, 7))}/{Number(day.date.slice(8))}
            </text>
          ))}
        </svg>

        {selected !== null && selectedPoint && hasVisits && (
          <div className={styles.tooltip} role="tooltip" aria-live="polite"
            style={{ left: Math.max(inset.left, Math.min(width - 152, selectedPoint.x + 14)), top: Math.max(8, Math.min(height - 100, selectedPoint.y - 78)) }}>
            <span>{dateLabel(days[selected].date)}</span>
            <strong>{number.format(days[selected].count)}<small>次请求</small></strong>
          </div>
        )}
        {!hasVisits && (
          <div className={styles.empty} role={unavailable ? 'status' : undefined}>
            <div className={styles.emptyIcon}><LineChart size={22} strokeWidth={1.5} aria-hidden="true" /></div>
            <p>{unavailable ? '暂时无法读取访问数据' : '所选日期还没有访问记录'}</p>
            {unavailable ? <a href="/admin/access-logs">查看访问日志 <ArrowUpRight size={12} aria-hidden="true" /></a> : <span>有新的访问后，会在这里显示</span>}
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <span className={styles.legend}><i aria-hidden="true" />每日请求量<span className={styles.timezone}>UTC+8</span></span>
        {!unavailable && <span className={styles.summary}>日均 <b>{number.format(days.length ? Math.round(total / days.length) : 0)}</b><span aria-hidden="true">/</span>峰值 <b>{number.format(max)}</b></span>}
      </footer>
      {!unavailable && days.length > 0 && (
        <table className="sr-only">
          <caption>所选日期每日请求量</caption>
          <thead><tr><th scope="col">日期</th><th scope="col">请求次数</th></tr></thead>
          <tbody>{days.map(day => <tr key={day.date}><th scope="row">{day.date}</th><td>{day.count}</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
}
