'use client';

import { useEffect, useState } from 'react';
import { legacyDateKey, SITE_TIME_ZONE } from './legacy-time';
import styles from './legacy-calendar.module.css';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const LUNAR_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: SITE_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const LUNAR_MONTH = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
  timeZone: SITE_TIME_ZONE, month: 'long',
});
const LUNAR_DAY = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
  timeZone: SITE_TIME_ZONE, month: 'numeric', day: 'numeric', numberingSystem: 'latn',
});

function lunarLabel(date: number) {
  const month = LUNAR_MONTH.formatToParts(date).find(part => part.type === 'month')?.value;
  const day = Number(LUNAR_DAY.formatToParts(date).find(part => part.type === 'day')?.value);
  if (!month || !Number.isInteger(day) || day < 1 || day > 30) return '';
  if (day <= 10) return `${month}初${LUNAR_DIGITS[day - 1]}`;
  if (day < 20) return `${month}十${LUNAR_DIGITS[day - 11]}`;
  if (day === 20 || day === 30) return `${month}${day === 20 ? '二十' : '三十'}`;
  return `${month}廿${LUNAR_DIGITS[day - 21]}`;
}

function BeijingClock({ initialTime }: { initialTime: number }) {
  const [time, setTime] = useState(initialTime);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!document.hidden) setTime(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);
  const clock = TIME_FORMAT.format(time);
  return <time className={styles.clock} dateTime={`${clock}+08:00`}>{clock}</time>;
}

export function LegacyCalendar({ initialTime }: { initialTime: number }) {
  const [today, setToday] = useState(() => legacyDateKey(initialTime));
  const [browsingMonth, setBrowsingMonth] = useState<number | null>(null);

  useEffect(() => {
    const updateToday = () => setToday(legacyDateKey(Date.now()));
    const interval = window.setInterval(updateToday, 30_000);
    document.addEventListener('visibilitychange', updateToday);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', updateToday);
    };
  }, []);

  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  const currentMonth = todayYear * 12 + todayMonth - 1;
  const shown = browsingMonth ?? currentMonth;
  const year = Math.floor(shown / 12);
  const month = shown % 12;
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayStart = Date.UTC(todayYear, todayMonth - 1, todayDay);
  const dayOfYear = (todayStart - Date.UTC(todayYear, 0, 1)) / DAY_MS + 1;
  const untilNewYear = (Date.UTC(todayYear + 1, 0, 1) - todayStart) / DAY_MS;
  const lunar = lunarLabel(todayStart);
  const monthLabel = `${year}年${month + 1}月`;

  return (
    <div className={styles.calendar}>
      <div className={styles.clockStrip}><span>北京时间</span><BeijingClock initialTime={initialTime} /></div>
      <div className={styles.monthBar}>
        <button type="button" aria-label="上个月" onClick={() => setBrowsingMonth(value => (value ?? currentMonth) - 1)}>◀</button>
        <span aria-live="polite">{monthLabel}</span>
        <button type="button" aria-label="下个月" onClick={() => setBrowsingMonth(value => (value ?? currentMonth) + 1)}>▶</button>
      </div>
      <table className={styles.table} aria-label={monthLabel + '日历'}>
        <thead>
          <tr>{WEEKDAYS.map(day => <th scope="col" key={day} abbr={`星期${day}`}>{day}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) }, (_, week) => (
            <tr key={week}>
              {WEEKDAYS.map((weekday, index) => {
                const day = week * 7 + index - firstWeekday + 1;
                const inMonth = day > 0 && day <= daysInMonth;
                const isToday = shown === currentMonth && day === todayDay;
                return (
                  <td key={weekday}>
                    {inMonth && (
                      <time dateTime={`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`}
                        aria-current={isToday ? 'date' : undefined}>{day}</time>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.details}>
        {lunar && <p>今日农历 <strong>{lunar}</strong></p>}
        <p>本年第 {dayOfYear} 天 <span aria-hidden="true">·</span> 距元旦 {untilNewYear} 天</p>
        <div className={styles.detailsBottom}>
          <span>本月 {daysInMonth} 天</span>
          {shown !== currentMonth && <button type="button" onClick={() => setBrowsingMonth(null)}>回到本月</button>}
        </div>
      </div>
    </div>
  );
}
