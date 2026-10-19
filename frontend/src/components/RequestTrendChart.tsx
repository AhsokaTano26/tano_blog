'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { BarChart3, LineChart } from 'lucide-react';
import styles from './VisitTrendChart.module.css';

export interface RequestSample {
  key: string;
  label: string;
  axisLabel: string;
  count: number;
}

interface Point { x: number; y: number; }
const number = new Intl.NumberFormat('zh-CN');
const axisNumber = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
const inset = { top: 16, right: 16, bottom: 34, left: 44 };

// Preserve the overview's monotone curve without introducing a charting runtime.
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
    const previous = points[i - 1], third = (point.x - previous.x) / 3;
    return `${path} C ${previous.x + third} ${previous.y + tangents[i - 1] * third}, ${point.x - third} ${point.y - tangents[i] * third}, ${point.x} ${point.y}`;
  }, '');
}

function scaleStep(max: number) {
  const rough = Math.max(max, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const multiple = [1, 2, 2.5, 5, 10].find(value => value * magnitude >= rough) ?? 10;
  return Math.max(1, Math.ceil(multiple * magnitude));
}

export default function RequestTrendChart({ data, title, subtitle, metricLabel, controls, comparison, unavailable = false,
  compact = false, initialMode = 'line', legend = '每日请求量', averageLabel = '日均', bucketLabel = '日期', height = compact ? 188 : 232,
}: {
  data: RequestSample[];
  title: string;
  subtitle: string;
  metricLabel: string;
  controls?: ReactNode;
  comparison?: ReactNode;
  unavailable?: boolean;
  compact?: boolean;
  initialMode?: 'line' | 'bar';
  legend?: string;
  averageLabel?: string;
  bucketLabel?: string;
  height?: number;
}) {
  const [mode, setMode] = useState(initialMode);
  const [selection, setSelection] = useState<{ data: RequestSample[]; index: number } | null>(null);
  const [width, setWidth] = useState(720);
  const plotRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const series = useMemo(() => data.filter(item => Number.isFinite(item.count)).map(item => ({ ...item, count: Math.max(0, item.count) })), [data]);

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

  const geometry = useMemo(() => {
    const total = series.reduce((sum, sample) => sum + sample.count, 0);
    const max = Math.max(...series.map(sample => sample.count), 0);
    const step = scaleStep(max), baseY = height - inset.bottom;
    const plotHeight = baseY - inset.top;
    const plotWidth = Math.max(1, width - inset.left - inset.right);
    const band = plotWidth / Math.max(1, series.length);
    const points = series.map((sample, i) => ({ x: inset.left + band * (i + .5), y: baseY - sample.count / (step * 4) * plotHeight }));
    const slots = Math.min(series.length, Math.max(2, Math.min(8, Math.floor(plotWidth / 72) + 1)));
    const labels = new Set(Array.from({ length: slots }, (_, i) => slots === 1 ? 0 : Math.round(i * (series.length - 1) / (slots - 1))));
    return { total, max, step, baseY, plotHeight, band, points, labels, path: curve(points) };
  }, [series, width, height]);
  const { total, max, step, baseY, plotHeight, band, points, labels, path } = geometry;
  const hasRequests = total > 0 && !unavailable;
  const selected = selection?.data === series && series.length ? Math.min(selection.index, series.length - 1) : null;
  const selectedPoint = selected === null ? null : points[selected];

  function selectAtPointer(event: PointerEvent<HTMLDivElement>) {
    if (!hasRequests) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / Math.max(1, bounds.width) * width;
    const index = Math.max(0, Math.min(series.length - 1, Math.floor((x - inset.left) / band)));
    setSelection(previous => previous?.data === series && previous.index === index ? previous : { data: series, index });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!hasRequests || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    const key = event.key;
    if (key === 'Escape') { setSelection(null); return; }
    setSelection(previous => {
      const current = previous?.data === series ? previous.index : series.length - 1;
      const index = key === 'Home' ? 0 : key === 'End' ? series.length - 1
        : key === 'ArrowLeft' ? Math.max(0, current - 1) : Math.min(series.length - 1, current + 1);
      return { data: series, index };
    });
  }

  // Pointer inspection only updates the cursor and tooltip, not hundreds of marks/table rows.
  const marks = useMemo(() => <>
    {[4, 3, 2, 1, 0].map(tick => {
      const y = baseY - tick / 4 * plotHeight;
      return <g key={tick}>
        <line x1={inset.left} x2={width - inset.right} y1={y} y2={y} className={styles.gridLine} strokeDasharray={tick ? '3 5' : undefined} />
        {hasRequests && <text x={inset.left - 12} y={y + 4} textAnchor="end" className={styles.axisText}>{axisNumber.format(tick * step)}</text>}
      </g>;
    })}
    {hasRequests && mode === 'line' && <>
      {points.length > 1 && <path d={`${path} L ${points.at(-1)!.x} ${baseY} L ${points[0].x} ${baseY} Z`} fill={`url(#${id}-fill)`} />}
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points.at(-1)!.x} cy={points.at(-1)!.y} r={3.5} fill="var(--primary)" />
    </>}
    {hasRequests && mode === 'bar' && points.map((point, i) => <rect key={series[i].key} data-count={series[i].count}
      x={point.x - Math.min(32, band * .55) / 2} y={point.y} width={Math.min(32, band * .55)} height={baseY - point.y}
      rx={Math.min(4, band * .15)} fill="var(--primary)" opacity={.72} />)}
    <g data-axis="x">{!unavailable && series.map((sample, i) => labels.has(i) && <text key={sample.key}
      x={points[i].x} y={height - 8} textAnchor="middle" className={styles.axisText}>{sample.axisLabel}</text>)}</g>
  </>, [series, width, height, baseY, plotHeight, step, hasRequests, mode, points, path, band, labels, id, unavailable]);

  const table = useMemo(() => !unavailable && series.length > 0 && <table className="sr-only">
    <caption>所选{bucketLabel}{legend}</caption>
    <thead><tr><th scope="col">{bucketLabel}</th><th scope="col">请求次数</th></tr></thead>
    <tbody>{series.map(sample => <tr key={sample.key}><th scope="row">{sample.label}</th><td>{sample.count}</td></tr>)}</tbody>
  </table>, [series, unavailable, bucketLabel, legend]);
  const tooltipWidth = Math.min(140, Math.max(0, width - 16));

  return <section className={`${styles.card} ${compact ? styles.compact : ''}`} aria-label={title}>
    <header className={styles.header}>
      <div><h2 className={styles.title}>{title}</h2><p className={styles.dateRange}>{subtitle}</p></div>
      <div className={styles.controls}>
        {controls}
        <div className={styles.segmented} role="group" aria-label="图表类型">
          {([{ value: 'line', label: '折线图', icon: LineChart }, { value: 'bar', label: '柱状图', icon: BarChart3 }] as const).map(item =>
            <button type="button" key={item.value} aria-label={item.label} title={item.label} aria-pressed={mode === item.value}
              className={styles.modeButton} disabled={unavailable} onClick={() => setMode(item.value)}><item.icon size={16} strokeWidth={1.8} aria-hidden="true" /></button>)}
        </div>
      </div>
    </header>
    <div className={styles.metricRow}>
      <div><p className={styles.metricLabel}>{metricLabel}</p><div className={styles.metric}>
        <output aria-label="所选时段访问量">{unavailable ? '—' : number.format(total)}</output><span>次请求</span>
      </div></div>
      {comparison}
    </div>
    <div ref={plotRef} className={styles.plot} role="group" tabIndex={hasRequests ? 0 : -1} style={{ height }}
      aria-label={`${legend}，使用左右方向键查看${bucketLabel}，按 Escape 关闭提示`}
      onPointerMove={selectAtPointer} onPointerDown={selectAtPointer}
      onPointerLeave={event => { if (event.pointerType !== 'touch' && event.currentTarget !== document.activeElement) setSelection(null); }}
      onFocus={() => { if (hasRequests) setSelection(previous => previous?.data === series ? previous : { data: series, index: series.length - 1 }); }}
      onBlur={() => setSelection(null)} onKeyDown={onKeyDown}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`}>
        <title id={`${id}-title`}>{title}{unavailable ? '暂不可用' : `，共 ${number.format(total)} 次请求`}</title>
        <defs><linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity=".2" /><stop offset="100%" stopColor="var(--primary)" stopOpacity=".015" />
        </linearGradient></defs>
        {marks}
        {selectedPoint && hasRequests && <>
          <line x1={selectedPoint.x} x2={selectedPoint.x} y1={inset.top} y2={baseY} stroke="var(--primary)" strokeOpacity={.35} strokeDasharray="3 4" />
          {mode === 'line'
            ? <circle cx={selectedPoint.x} cy={selectedPoint.y} r={5} fill="var(--primary)" stroke="var(--color-bg)" strokeWidth={2.5} />
            : <rect x={selectedPoint.x - Math.min(32, band * .55) / 2} y={selectedPoint.y} width={Math.min(32, band * .55)}
              height={baseY - selectedPoint.y} rx={Math.min(4, band * .15)} fill="var(--primary)" />}
        </>}
      </svg>
      {selected !== null && selectedPoint && hasRequests && <div className={styles.tooltip} role="tooltip" aria-live="polite"
        style={{ width: tooltipWidth, left: Math.max(8, Math.min(width - tooltipWidth - 8, selectedPoint.x + 14)), top: Math.max(8, Math.min(height - 100, selectedPoint.y - 78)) }}>
        <span>{series[selected].label}</span><strong>{number.format(series[selected].count)}<small>次请求</small></strong>
      </div>}
      {!hasRequests && <div className={styles.empty} role={unavailable ? 'status' : undefined}>
        <div className={styles.emptyIcon}><LineChart size={22} strokeWidth={1.5} aria-hidden="true" /></div>
        <p>{unavailable ? '暂时无法读取访问数据' : '所选日期还没有访问记录'}</p>
        {unavailable ? <a href="/admin/access-logs">查看访问日志</a> : <span>有新的访问后，会在这里显示</span>}
      </div>}
    </div>
    <footer className={styles.footer}>
      <span className={styles.legend}><i aria-hidden="true" />{legend}<span className={styles.timezone}>UTC+8</span></span>
      {!unavailable && <span className={styles.summary}>{averageLabel} <b>{number.format(series.length ? Math.round(total / series.length) : 0)}</b>
        <span aria-hidden="true">/</span>峰值 <b>{number.format(max)}</b></span>}
    </footer>
    {table}
  </section>;
}
