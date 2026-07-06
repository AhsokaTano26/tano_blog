'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

export default function CalendarPage() {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

    const loadPosts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.admin.posts.calendar({
                year: year.toString(),
                month: month.toString().padStart(2, '0'),
            });
            setPosts(res.items);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [year, month]);

    useEffect(() => { loadPosts(); }, [loadPosts]);

    const prevMonth = () => {
        if (month === 1) { setYear(y => y - 1); setMonth(12); }
        else { setMonth(m => m - 1); }
    };

    const nextMonth = () => {
        if (month === 12) { setYear(y => y + 1); setMonth(1); }
        else { setMonth(m => m + 1); }
    };

    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    const postsByDate: Record<string, any[]> = {};
    posts.forEach(p => {
        if (!postsByDate[p.date]) postsByDate[p.date] = [];
        postsByDate[p.date].push(p);
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'published': return 'text-green-500 bg-green-500/10';
            case 'draft': return 'text-gray-400 bg-gray-500/10';
            default: return 'text-gray-400 bg-gray-500/10';
        }
    };

    const getStatusDot = (status: string) => {
        switch (status) {
            case 'published': return 'bg-green-500';
            case 'draft': return 'bg-gray-400';
            default: return 'bg-gray-400';
        }
    };

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">文章日历</h1>
                <div className="flex items-center gap-4">
                    <span className="text-lg font-medium">{year}年{month}月</span>
                    <div className="flex gap-1">
                        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-7 gap-px bg-white/5 rounded-xl overflow-hidden">
                {weekDays.map(d => (
                    <div key={d} className="p-3 text-center text-sm font-medium text-gray-400 bg-black/20">
                        {d}
                    </div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[120px] bg-black/10 p-2" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateKey = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                    const dayPosts = postsByDate[dateKey] || [];
                    const isToday = new Date().toISOString().slice(0, 10) === dateKey;

                    return (
                        <div
                            key={day}
                            className={`min-h-[120px] p-2 bg-black/20 hover:bg-white/5 transition-colors ${
                                isToday ? 'ring-1 ring-inset ring-blue-500/50' : ''
                            }`}
                        >
                            <div className="text-sm font-medium mb-1 text-gray-400">{day}</div>
                            <div className="space-y-0.5">
                                {dayPosts.slice(0, 3).map(p => (
                                    <a
                                        key={p.id}
                                        href={`/admin/posts`}
                                        className={`block text-xs px-1.5 py-0.5 rounded truncate ${getStatusColor(p.status)}`}
                                    >
                                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${getStatusDot(p.status)}`} />
                                        {p.title}
                                    </a>
                                ))}
                                {dayPosts.length > 3 && (
                                    <div className="text-xs text-gray-500 px-1">
                                        +{dayPosts.length - 3} 篇
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex gap-4 mt-4 text-sm text-gray-400">
                <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    已发布
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                    草稿
                </div>
            </div>
        </div>
    );
}
