'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { recentRequestRange } from '@/lib/request-statistics';
import VisitTrendChart from '@/components/VisitTrendChart';
import { RequestSummary, RequestBreakdown, RequestHours } from '@/components/RequestStatistics';
import styles from '@/components/RequestStatistics.module.css';

interface NameCount {
    name: string;
    count: number;
}

interface TimeRangeStats {
    total_requests: number;
    unique_ips: number;
    total_errors: number;
    avg_response_ms: number;
    daily_counts: { date: string; count: number }[];
}

export default function AnalyticsPage() {
    const [range, setRange] = useState(() => recentRequestRange(7));
    const { start: startDate, end: endDate } = range;
    const [timeRangeStats, setTimeRangeStats] = useState<TimeRangeStats | null>(null);
    const [byPath, setByPath] = useState<NameCount[]>([]);
    const [byReferrer, setByReferrer] = useState<NameCount[]>([]);
    const [byCountry, setByCountry] = useState<NameCount[]>([]);
    const [byStatusCode, setByStatusCode] = useState<NameCount[]>([]);
    const [byDevice, setByDevice] = useState<NameCount[]>([]);
    const [byBrowser, setByBrowser] = useState<NameCount[]>([]);
    const [byOS, setByOS] = useState<NameCount[]>([]);
    const [byHour, setByHour] = useState<{ hour: number; count: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const requestSequence = useRef(0);

    const loadData = useCallback(async () => {
        const sequence = ++requestSequence.current;
        const days = (Date.parse(endDate) - Date.parse(startDate)) / 86400000;
        if (!Number.isFinite(days) || days < 0 || days > 365) {
            setError('请选择有效日期范围，开始日期不能晚于结束日期，最多 366 天');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const params = { start: startDate, end: endDate };
            const data = await api.admin.accessLogs.overview(params);
            if (sequence !== requestSequence.current) return;
            setTimeRangeStats(data.stats);
            setByPath(data.path);
            setByReferrer(data.referrer);
            setByCountry(data.country);
            setByStatusCode(data.status);
            setByDevice(data.device);
            setByBrowser(data.browser);
            setByOS(data.os);
            setByHour(data.hour);
        } catch (e) {
            if (sequence === requestSequence.current) setError(e instanceof Error ? e.message : '统计加载失败，请重试');
        } finally {
            if (sequence === requestSequence.current) setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        void loadData();
        return () => { requestSequence.current++; };
    }, [loadData]);

    const total = timeRangeStats?.total_requests ?? 0;

    return (
        <div className="space-y-5">
            <header className="admin-page-heading">
                <div><h1>访问统计</h1><p>了解请求趋势、流量来源与访问设备。</p></div>
            </header>
            <div className={styles.toolbar}>
                <div className={styles.presets} role="group" aria-label="统计日期范围">
                    {([7, 30, 90] as const).map(days => {
                        const preset = recentRequestRange(days);
                        return <button type="button" key={days} aria-pressed={startDate === preset.start && endDate === preset.end}
                            onClick={() => setRange(preset)}>近 {days} 天</button>;
                    })}
                </div>
                <div className={styles.dateInputs}>
                    <label htmlFor="analytics-start">开始日期</label>
                    <input id="analytics-start" type="date" aria-label="开始日期" value={startDate}
                        onChange={e => setRange(current => ({ ...current, start: e.target.value }))} />
                    <label htmlFor="analytics-end">结束日期</label>
                    <input id="analytics-end" type="date" aria-label="结束日期" value={endDate}
                        onChange={e => setRange(current => ({ ...current, end: e.target.value }))} />
                </div>
            </div>
            <p className={styles.scope}>按 UTC+8 日期统计全部请求，包含结束日；每次最多 366 天。请求数包含接口和页面请求。</p>
            {loading ? (
                <div role="status" className={styles.loading}>加载中…</div>
            ) : error ? (
                <div role="alert" className="glass-card rounded-xl p-5 text-sm" style={{ color: 'var(--color-error)' }}>
                    {error}<button onClick={() => void loadData()} className="ml-3 underline">重试</button>
                </div>
            ) : (
                <>
                    {timeRangeStats && <>
                        <RequestSummary stats={timeRangeStats} />
                        <VisitTrendChart data={timeRangeStats.daily_counts} range={range} />
                    </>}
                    <RequestHours data={byHour} />
                    <div className={styles.grid}>
                        <RequestBreakdown title="页面排行" data={byPath} total={total} />
                        <RequestBreakdown title="来源分析" data={byReferrer} total={total} />
                        <RequestBreakdown title="国家/地区" data={byCountry} total={total} />
                        <RequestBreakdown title="状态码分布" data={byStatusCode} total={total} status />
                    </div>
                    <div className={styles.devices}>
                        <RequestBreakdown title="设备分布" data={byDevice} total={total} />
                        <RequestBreakdown title="浏览器分布" data={byBrowser} total={total} />
                        <RequestBreakdown title="操作系统" data={byOS} total={total} />
                    </div>
                </>
            )}
        </div>
    );
}
