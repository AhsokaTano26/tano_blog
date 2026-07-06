'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

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

function SimpleBar({ data, max }: { data: NameCount[]; max: number }) {
    return (
        <div className="space-y-1">
            {data.map(item => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                    <span className="w-32 truncate text-gray-400">{item.name}</span>
                    <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
                        <div
                            className="h-full bg-blue-500/50 rounded transition-all duration-500"
                            style={{ width: `${(item.count / max) * 100}%` }}
                        />
                    </div>
                    <span className="w-16 text-right text-gray-300">{item.count.toLocaleString()}</span>
                </div>
            ))}
        </div>
    );
}

export default function AnalyticsPage() {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [startDate, setStartDate] = useState(sevenDaysAgo.toISOString().slice(0, 10));
    const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));
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

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const params = { start: startDate, end: endDate };
            const [statsRes, pathRes, refRes, countryRes, statusRes, devRes, browRes, osRes, hourRes] = await Promise.all([
                api.admin.accessLogs.statsTimeRange(params),
                api.admin.accessLogs.statsByPath(),
                api.admin.accessLogs.statsByReferrer(),
                api.admin.accessLogs.statsByCountry(),
                api.admin.accessLogs.statsByStatusCode(),
                api.admin.accessLogs.statsByDevice(),
                api.admin.accessLogs.statsByBrowser(),
                api.admin.accessLogs.statsByOS(),
                api.admin.accessLogs.statsByHour(),
            ]);
            setTimeRangeStats(statsRes as any);
            setByPath(pathRes.items);
            setByReferrer(refRes.items);
            setByCountry(countryRes.items);
            setByStatusCode(statusRes.items);
            setByDevice(devRes.items);
            setByBrowser(browRes.items);
            setByOS(osRes.items);
            setByHour(hourRes.items);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => { loadData(); }, [loadData]);

    const maxPath = Math.max(...byPath.map(i => i.count), 1);
    const maxRef = Math.max(...byReferrer.map(i => i.count), 1);
    const maxCountry = Math.max(...byCountry.map(i => i.count), 1);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">访问统计</h1>
                <div className="flex items-center gap-3">
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm" />
                    <span className="text-gray-400">至</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm" />
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-400">加载中...</div>
            ) : (
                <>
                    {/* Summary cards */}
                    {timeRangeStats && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: '总请求', value: timeRangeStats.total_requests.toLocaleString(), color: 'text-blue-400' },
                                { label: '独立 IP', value: timeRangeStats.unique_ips.toLocaleString(), color: 'text-green-400' },
                                { label: '错误请求', value: timeRangeStats.total_errors.toLocaleString(), color: timeRangeStats.total_errors > 0 ? 'text-red-400' : 'text-gray-400' },
                                { label: '平均响应', value: `${timeRangeStats.avg_response_ms.toFixed(0)}ms`, color: 'text-yellow-400' },
                            ].map(card => (
                                <div key={card.label} className="glass-card rounded-xl p-4">
                                    <div className="text-sm text-gray-400">{card.label}</div>
                                    <div className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Daily trend chart */}
                    {timeRangeStats && timeRangeStats.daily_counts.length > 0 && (
                        <div className="glass-card rounded-xl p-4">
                            <h2 className="text-lg font-medium mb-4">每日趋势</h2>
                            <div className="flex items-end gap-1 h-32">
                                {timeRangeStats.daily_counts.map(d => {
                                    const maxDaily = Math.max(...timeRangeStats!.daily_counts.map(x => x.count), 1);
                                    return (
                                        <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                                            <div className="text-xs text-gray-400">{d.count}</div>
                                            <div className="w-full bg-blue-500/50 rounded-t transition-all"
                                                style={{ height: `${(d.count / maxDaily) * 100}%` }} />
                                            <div className="text-xs text-gray-500 -rotate-45 origin-left">
                                                {d.date.slice(5)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Two-column layout for breakdowns */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="glass-card rounded-xl p-4">
                            <h2 className="text-lg font-medium mb-3">页面排行</h2>
                            <SimpleBar data={byPath} max={maxPath} />
                        </div>
                        <div className="glass-card rounded-xl p-4">
                            <h2 className="text-lg font-medium mb-3">来源分析</h2>
                            <SimpleBar data={byReferrer} max={maxRef} />
                        </div>
                        <div className="glass-card rounded-xl p-4">
                            <h2 className="text-lg font-medium mb-3">国家/地区</h2>
                            <SimpleBar data={byCountry} max={maxCountry} />
                        </div>
                        <div className="glass-card rounded-xl p-4">
                            <h2 className="text-lg font-medium mb-3">状态码分布</h2>
                            <div className="flex gap-4">
                                {byStatusCode.map(item => (
                                    <div key={item.name} className="text-center">
                                        <div className={`text-xl font-bold ${
                                            item.name.startsWith('2') ? 'text-green-400' :
                                            item.name.startsWith('3') ? 'text-blue-400' :
                                            item.name.startsWith('4') ? 'text-yellow-400' :
                                            item.name.startsWith('5') ? 'text-red-400' : 'text-gray-400'
                                        }`}>{item.count.toLocaleString()}</div>
                                        <div className="text-xs text-gray-400">{item.name}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Device/Browser/OS section */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { title: '设备分布', data: byDevice },
                            { title: '浏览器分布', data: byBrowser },
                            { title: '操作系统', data: byOS },
                        ].map(section => {
                            const maxVal = Math.max(...section.data.map(i => i.count), 1);
                            return (
                                <div key={section.title} className="glass-card rounded-xl p-4">
                                    <h2 className="text-lg font-medium mb-3">{section.title}</h2>
                                    <div className="space-y-2">
                                        {section.data.map(item => (
                                            <div key={item.name} className="flex items-center gap-2 text-sm">
                                                <span className="w-20 truncate text-gray-400">{item.name}</span>
                                                <div className="flex-1 h-4 bg-white/5 rounded overflow-hidden">
                                                    <div className="h-full bg-purple-500/50 rounded transition-all"
                                                        style={{ width: `${(item.count / maxVal) * 100}%` }} />
                                                </div>
                                                <span className="w-12 text-right text-gray-300">{item.count.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Hourly distribution */}
                    {byHour.length > 0 && (
                        <div className="glass-card rounded-xl p-4">
                            <h2 className="text-lg font-medium mb-4">时段分布</h2>
                            <div className="flex items-end gap-1 h-24">
                                {Array.from({ length: 24 }).map((_, h) => {
                                    const hourData = byHour.find(i => i.hour === h);
                                    const count = hourData?.count || 0;
                                    const maxHour = Math.max(...byHour.map(i => i.count), 1);
                                    return (
                                        <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                                            <div className="text-xs text-gray-400">{count || ''}</div>
                                            <div className="w-full bg-cyan-500/40 rounded-t transition-all"
                                                style={{ height: `${(count / maxHour) * 100}%` }} />
                                            <div className="text-xs text-gray-500">{h}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
