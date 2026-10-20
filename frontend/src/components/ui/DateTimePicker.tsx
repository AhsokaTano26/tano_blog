'use client';

import * as Popover from '@radix-ui/react-popover';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type AriaAttributes, type CSSProperties, type KeyboardEvent } from 'react';
import { Input } from './Input';
import { Select } from './Select';

export interface DateTimePickerProps extends AriaAttributes {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
}

type Mode = 'date' | 'time' | 'datetime';
const pad = (value: number) => String(value).padStart(2, '0');
const yearLabel = (year: number) => String(year).padStart(4, '0');
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const hours = Array.from({ length: 24 }, (_, hour) => ({ value: pad(hour), label: pad(hour) }));
const minutes = Array.from({ length: 60 }, (_, minute) => ({ value: pad(minute), label: pad(minute) }));
const dayOffsets: Record<string, number | undefined> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

// Construct calendar days locally, including years 0001–0099. Parsing ISO dates
// through Date would interpret a date-only value as UTC and shift some users' day.
function localDay(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

function dateValue(date: Date) {
  return `${yearLabel(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return;
  const date = localDay(year, month - 1, day);
  if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
}

function validValue(value: string, mode: Mode) {
  if (mode === 'date') return !!parseDate(value);
  const time = mode === 'time' ? value : value.slice(11);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  return mode === 'time' || (value.length === 16 && value[10] === 'T' && !!parseDate(value.slice(0, 10)));
}

function bounds(mode: Mode, min?: string, max?: string) {
  return { min: min && validValue(min, mode) ? min : '', max: max && validValue(max, mode) ? max : '' };
}

function clamp(value: string, min: string, max: string) {
  if (min && value < min) return min;
  if (max && value > max) return max;
  return value;
}

function validationMessage(value: string, mode: Mode, min: string, max: string) {
  if (!value) return '';
  if (!validValue(value, mode)) {
    return mode === 'date' ? '请输入有效日期，格式为 YYYY-MM-DD。'
      : mode === 'time' ? '请输入有效时间，格式为 HH:mm。' : '请输入有效日期和时间，格式为 YYYY-MM-DDTHH:mm。';
  }
  if (min && value < min) return `请选择不早于 ${min} 的${mode === 'time' ? '时间' : '日期'}。`;
  if (max && value > max) return `请选择不晚于 ${max} 的${mode === 'time' ? '时间' : '日期'}。`;
  return '';
}

interface CalendarProps {
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}

function Calendar({ value, min, max, onChange }: CalendarProps) {
  const initial = clamp(value || dateValue(new Date()), min, max);
  const [focused, setFocused] = useState(initial);
  const [view, setView] = useState(() => {
    const date = parseDate(initial) || new Date();
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const [yearDraft, setYearDraft] = useState({ source: view.year, text: yearLabel(view.year) });
  const gridRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);
  const today = dateValue(new Date());
  const titleId = useId();
  const firstDay = localDay(view.year, view.month, 1);
  const gridStart = localDay(view.year, view.month, 1 - firstDay.getDay());
  const allowed = (day: string) => !!parseDate(day) && (!min || day >= min) && (!max || day <= max);
  const monthAllowed = (year: number, month: number) => year >= 1 && year <= 9999
    && (!min || dateValue(localDay(year, month + 1, 0)) >= min)
    && (!max || dateValue(localDay(year, month, 1)) <= max);

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, view]);

  function navigate(date: Date, focus = true) {
    const next = clamp(dateValue(date), min || '0001-01-01', max || '9999-12-31');
    const parsed = parseDate(next);
    if (!parsed) return;
    focusPending.current = focus;
    setFocused(next);
    setView({ year: parsed.getFullYear(), month: parsed.getMonth() });
  }

  function navigateMonth(year: number, month: number, focus = false) {
    const day = (parseDate(focused) || firstDay).getDate();
    navigate(localDay(year, month, Math.min(day, localDay(year, month + 1, 0).getDate())), focus);
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, day: Date) {
    const offset = dayOffsets[event.key];
    if (offset !== undefined) {
      event.preventDefault();
      navigate(localDay(day.getFullYear(), day.getMonth(), day.getDate() + offset));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      navigate(localDay(day.getFullYear(), day.getMonth(), day.getDate() - day.getDay() + (event.key === 'End' ? 6 : 0)));
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      navigateMonth(day.getFullYear() + (event.shiftKey ? (event.key === 'PageUp' ? -1 : 1) : 0), day.getMonth() + (!event.shiftKey ? (event.key === 'PageUp' ? -1 : 1) : 0), true);
    }
  }

  const previous = localDay(view.year, view.month - 1, 1);
  const next = localDay(view.year, view.month + 1, 1);
  return <div className="admin-ui-calendar">
    <div className="admin-ui-calendar-header">
      <button type="button" className="admin-ui-calendar-nav" aria-label="上个月"
        disabled={!monthAllowed(previous.getFullYear(), previous.getMonth())} onClick={() => navigateMonth(view.year, view.month - 1)}><ChevronLeft size={16} /></button>
      <div className="admin-ui-calendar-title">
        <Input value={yearDraft.source === view.year ? yearDraft.text : yearLabel(view.year)} aria-label="年份" inputMode="numeric" maxLength={4}
          className="admin-ui-calendar-year" onChange={event => {
            setYearDraft({ source: view.year, text: event.target.value });
            const year = Number(event.target.value);
            if (/^\d{4}$/.test(event.target.value) && year >= 1) navigateMonth(year, view.month);
          }} onBlur={() => setYearDraft({ source: view.year, text: yearLabel(view.year) })}
          onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} />
        <Select value={String(view.month)} aria-label="月份" className="admin-ui-calendar-month"
          options={Array.from({ length: 12 }, (_, month) => ({ value: String(month), label: `${month + 1} 月`, disabled: !monthAllowed(view.year, month) }))}
          onChange={month => navigateMonth(view.year, Number(month))} />
      </div>
      <button type="button" className="admin-ui-calendar-nav" aria-label="下个月"
        disabled={!monthAllowed(next.getFullYear(), next.getMonth())} onClick={() => navigateMonth(view.year, view.month + 1)}><ChevronRight size={16} /></button>
    </div>
    <span id={titleId} className="sr-only" aria-live="polite">{view.year} 年 {view.month + 1} 月</span>
    <div ref={gridRef} className="admin-ui-calendar-grid" role="grid" aria-labelledby={titleId}>
      <div role="row" className="admin-ui-calendar-row">
        {weekdays.map(day => <span role="columnheader" className="admin-ui-calendar-weekday" key={day}>{day}</span>)}
      </div>
      {Array.from({ length: 6 }, (_, week) => <div role="row" className="admin-ui-calendar-row" key={week}>
        {Array.from({ length: 7 }, (_, column) => {
          const day = localDay(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + week * 7 + column);
          const date = dateValue(day);
          return <button key={date} type="button" role="gridcell" className="admin-ui-calendar-day"
            data-date={date} data-selected={date === value} data-today={date === today} data-outside={day.getMonth() !== view.month}
            aria-label={`${day.getFullYear()} 年 ${day.getMonth() + 1} 月 ${day.getDate()} 日`} aria-selected={date === value}
            aria-current={date === today ? 'date' : undefined} tabIndex={date === focused ? 0 : -1} disabled={!allowed(date)}
            onKeyDown={event => handleKey(event, day)} onFocus={() => setFocused(date)}
            onClick={() => { setFocused(date); onChange(date); }}>{day.getDate()}</button>;
        })}
      </div>)}
    </div>
  </div>;
}

function Picker({ mode, value, onChange, id, name, disabled, min: minimum, max: maximum, required, placeholder, className = '', style, ...aria }: DateTimePickerProps & { mode: Mode }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const errorId = useId();
  const text = value;
  const { min, max } = bounds(mode, minimum, maximum);
  const message = validationMessage(text, mode, min, max);
  const selected = validValue(value, mode) ? value : '';
  const selectedDate = mode !== 'time' ? selected.slice(0, 10) : '';
  const selectedTime = mode === 'time' ? selected : selected.slice(11);
  const dateMin = mode !== 'time' ? min.slice(0, 10) : '';
  const dateMax = mode !== 'time' ? max.slice(0, 10) : '';
  const label = aria['aria-label'] || (mode === 'date' ? '日期' : mode === 'time' ? '时间' : '日期和时间');
  const now = new Date();
  const currentDate = dateValue(now);
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const todayValue = mode === 'date' ? currentDate : mode === 'time' ? currentTime : `${currentDate}T${currentTime}`;

  useEffect(() => { inputRef.current?.setCustomValidity(message); }, [message]);

  function commit(next: string) {
    onChange(next);
  }

  function chooseDate(date: string) {
    commit(mode === 'date' ? date : clamp(`${date}T${selectedTime || '00:00'}`, min, max));
    if (mode === 'date') setOpen(false);
  }

  function chooseTime(part: 'hour' | 'minute', next: string) {
    if (!next) { commit(''); return; }
    const hour = part === 'hour' ? next : selectedTime.slice(0, 2) || '00';
    const minute = part === 'minute' ? next : selectedTime.slice(3, 5) || '00';
    const time = `${hour}:${minute}`;
    const date = selectedDate || clamp(currentDate, dateMin, dateMax);
    commit(clamp(mode === 'time' ? time : `${date}T${time}`, min, max));
  }

  function timeAllowed(time: string) {
    const date = selectedDate || clamp(currentDate, dateMin, dateMax);
    const candidate = mode === 'time' ? time : `${date}T${time}`;
    return (!min || candidate >= min) && (!max || candidate <= max);
  }

  return <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
    <Popover.Anchor asChild>
      <div className="admin-ui-picker" data-disabled={disabled || undefined}>
        <Input {...aria} ref={inputRef} id={id} name={name} type="text" disabled={disabled} required={required}
          className={`admin-ui-picker-field ${className}`} style={style} value={text} autoComplete="off" aria-label={aria['aria-label'] || (!id && !aria['aria-labelledby'] ? label : undefined)}
          aria-invalid={message ? true : aria['aria-invalid']}
          aria-describedby={[aria['aria-describedby'], message ? errorId : ''].filter(Boolean).join(' ') || undefined}
          placeholder={placeholder || (mode === 'date' ? 'YYYY-MM-DD' : mode === 'time' ? 'HH:mm' : 'YYYY-MM-DDTHH:mm')}
          onChange={event => {
            const next = event.target.value;
            const error = validationMessage(next, mode, min, max);
            event.target.setCustomValidity(error);
            // Preserve exactly what the user is editing so consumers cannot save
            // a previous, valid value while the visible field contains an error.
            onChange(next);
          }} onKeyDown={event => {
            if (event.key === 'ArrowDown' && !disabled) { event.preventDefault(); setOpen(true); }
          }} />
        <Popover.Trigger asChild>
          <button type="button" className="admin-ui-picker-trigger admin-ui-picker-icon" disabled={disabled} aria-label={`选择${label}`}>
            {mode === 'time' ? <Clock3 size={16} /> : <CalendarDays size={16} />}
          </button>
        </Popover.Trigger>
      </div>
    </Popover.Anchor>
    {message && <p id={errorId} className="admin-ui-field-error">{message}</p>}
    <Popover.Portal>
      <Popover.Content ref={contentRef} className="admin-ui-popover admin-ui-picker-popover" align="start" sideOffset={6} collisionPadding={8}
        aria-label={`选择${label}`} onOpenAutoFocus={event => {
          event.preventDefault();
          requestAnimationFrame(() => contentRef.current?.querySelector<HTMLElement>('[data-date][tabindex="0"], [role="combobox"]')?.focus());
        }}>
        {mode !== 'time' ? <Calendar value={selectedDate} min={dateMin} max={dateMax} onChange={chooseDate} /> : null}
        {mode !== 'date' ? <div className="admin-ui-time-fields" role="group" aria-label="时间">
          <Clock3 size={16} aria-hidden="true" />
          <Select aria-label="小时" placeholder="时" value={selectedTime.slice(0, 2)} onChange={hour => chooseTime('hour', hour)}
            options={hours.map(hour => ({ ...hour, disabled: !minutes.some(minute => timeAllowed(`${hour.value}:${minute.value}`)) }))} />
          <span className="admin-ui-time-separator" aria-hidden="true">:</span>
          <Select aria-label="分钟" placeholder="分" value={selectedTime.slice(3, 5)} onChange={minute => chooseTime('minute', minute)}
            options={minutes.map(minute => ({ ...minute, disabled: !timeAllowed(`${selectedTime.slice(0, 2) || '00'}:${minute.value}`) }))} />
        </div> : null}
        <div className="admin-ui-picker-actions">
          <button type="button" disabled={!!validationMessage(todayValue, mode, min, max)} onClick={() => { commit(todayValue); if (mode === 'date') setOpen(false); }}>{mode === 'time' ? '现在' : '今天'}</button>
          <button type="button" onClick={() => { commit(''); setOpen(false); }}>清空</button>
          {mode !== 'date' ? <Popover.Close asChild><button type="button">完成</button></Popover.Close> : null}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

export function DatePicker(props: DateTimePickerProps) { return <Picker {...props} mode="date" />; }
export function TimePicker(props: DateTimePickerProps) { return <Picker {...props} mode="time" />; }
export function DateTimePicker(props: DateTimePickerProps) { return <Picker {...props} mode="datetime" />; }
