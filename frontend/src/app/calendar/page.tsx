'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { Loading } from '@/components/Loading';

export default function CalendarPage() {
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Read URL params on mount
  useEffect(() => {
    const url = new URL(window.location.href);
    const y = url.searchParams.get('year');
    const m = url.searchParams.get('month');
    if (y) setYear(parseInt(y));
    if (m) setMonth(parseInt(m));
  }, []);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPostCalendar({
        year: year.toString(),
        month: month.toString().padStart(2, '0'),
      });
      setPosts(res.items || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // Sync URL with state
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('year', year.toString());
    url.searchParams.set('month', month.toString());
    window.history.replaceState(null, '', url.toString());
  }, [year, month]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else { setMonth(m => m - 1); }
  };

  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else { setMonth(m => m + 1); }
  };

  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  };

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const postsByDate: Record<string, any[]> = {};
  posts.forEach(p => {
    if (!postsByDate[p.date]) postsByDate[p.date] = [];
    postsByDate[p.date].push(p);
  });

  const totalPosts = posts.length;

  return (
    <div className="max-w-[var(--page-width)] mx-auto px-4 py-8">
      <div className="card-base rounded-2xl p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>文章日历</h1>
            {!loading && (
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>
                共 {totalPosts} 篇
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-base sm:text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>{year}年{month}月</span>
            <div className="flex gap-1">
              <button onClick={prevMonth}
                className="btn-glass p-2 rounded-lg hover:opacity-80 transition-all btn-press"
                aria-label="上个月">
                <ChevronLeft className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </button>
              <button onClick={nextMonth}
                className="btn-glass p-2 rounded-lg hover:opacity-80 transition-all btn-press"
                aria-label="下个月">
                <ChevronRight className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>
            {!isCurrentMonth && (
              <button onClick={goToday}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium btn-glass transition-opacity hover:opacity-80 whitespace-nowrap"
                style={{ color: 'var(--primary)' }}>
                <RotateCcw className="w-3.5 h-3.5" />
                今天
              </button>
            )}
          </div>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden" style={{ background: 'var(--glass-border)' }}>
          {weekDays.map((d, idx) => (
            <div key={d} className="p-2 sm:p-3 text-center text-xs sm:text-sm font-medium"
              style={{
                background: 'var(--surface-bg)',
                color: idx === 0 || idx === 6 ? 'var(--color-error)' : 'var(--text-info)',
              }}>
              {d}
            </div>
          ))}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[80px] sm:min-h-[100px]" style={{ background: 'var(--card-bg)' }} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayPosts = postsByDate[dateKey] || [];
            const isToday = dateKey === new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
            const isWeekend = (firstDay + i) % 7 === 0 || (firstDay + i) % 7 === 6;

            return (
              <div
                key={day}
                className="min-h-[80px] sm:min-h-[100px] p-1.5 sm:p-2 transition-colors hover:bg-white/5"
                style={{
                  background: isToday ? 'var(--primary-sub)' : 'var(--card-bg)',
                }}
              >
                <div className={`text-xs sm:text-sm font-medium mb-1 ${isWeekend && !isToday ? 'opacity-60' : ''}`}
                  style={{ color: isToday ? 'var(--primary)' : 'var(--text-info)' }}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayPosts.slice(0, 3).map((p: any) => (
                    <Link
                      key={p.id}
                      href={`/posts/${p.slug}`}
                      className="block text-[10px] sm:text-xs leading-tight px-1 py-0.5 rounded truncate hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--text-secondary)', background: 'var(--btn-card-bg)' }}
                      title={p.title}
                    >
                      {p.title}
                    </Link>
                  ))}
                  {dayPosts.length > 3 && (
                    <button onClick={() => setSelectedDate(dateKey)}
                      className="text-[10px] sm:text-xs px-1 hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--primary)' }}>
                      +{dayPosts.length - 3} 篇
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && <Loading />}

      {/* Day detail modal */}
      {selectedDate && (() => {
        const dayPosts = postsByDate[selectedDate] || [];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setSelectedDate(null)}>
            <div className="w-full max-w-md rounded-2xl p-5 shadow-2xl animate-fade-scale-in"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(24px)' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedDate}</h2>
                <button onClick={() => setSelectedDate(null)}
                  className="p-1 rounded-lg hover:bg-white/10 transition-colors">
                  <X className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                </button>
              </div>
              <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                {dayPosts.map((p: any) => (
                  <Link key={p.id} href={`/posts/${p.slug}`}
                    className="block px-3 py-2 rounded-xl text-sm hover:bg-white/5 transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => setSelectedDate(null)}>
                    {p.title}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
