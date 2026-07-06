'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import Link from 'next/link';

export function CalendarSidebar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="card-base p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <Link href="/calendar" className="text-sm font-bold hover:opacity-80 transition-opacity" style={{ color: 'var(--text-primary)' }}>文章日历</Link>
        <div className="flex gap-0.5">
          <button onClick={prevMonth} className="p-1 rounded hover:bg-white/10 transition-colors" aria-label="上个月">
            <ChevronLeft className="w-3.5 h-3.5" style={{ color: 'var(--text-info)' }} />
          </button>
          <span className="text-xs px-1.5 py-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
            {year}年{month}月
          </span>
          <button onClick={nextMonth} className="p-1 rounded hover:bg-white/10 transition-colors" aria-label="下个月">
            <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-info)' }} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
        {weekDays.map(d => (
          <div key={d} className="text-[10px] py-1 font-medium" style={{ color: 'var(--text-info)' }}>
            {d}
          </div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e-${i}`} className="py-1" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayPosts = postsByDate[dateKey] || [];
          const isToday = dateKey === now.toISOString().slice(0, 10);
          const hasPosts = dayPosts.length > 0;

          return (
            <div key={day} className="relative py-1">
              <span
                className={`inline-flex items-center justify-center w-6 h-6 text-xs rounded-full ${
                  isToday ? 'ring-1 ring-inset' : ''
                } ${hasPosts ? 'font-bold' : ''}`}
                style={{
                  color: isToday ? 'var(--primary)' : hasPosts ? 'var(--text-primary)' : 'var(--text-info)',
                  background: hasPosts ? 'var(--primary-sub)' : 'transparent',
                }}
              >
                {day}
              </span>
              {dayPosts.length > 0 && (
                <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {dayPosts.slice(0, 3).map((p: any) => (
                    <div
                      key={p.id}
                      className="w-1 h-1 rounded-full"
                      style={{ background: 'var(--primary)' }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!loading && posts.length > 0 && (
        <div className="mt-2 pt-2 space-y-1" style={{ borderTop: '1px solid var(--glass-border)' }}>
          {posts.slice(0, 5).map((p: any) => (
            <Link key={p.id} href={`/posts/${p.slug}`}
              className="block text-xs px-1.5 py-1 rounded truncate hover:bg-white/5 transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              title={p.title}>
              {p.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
