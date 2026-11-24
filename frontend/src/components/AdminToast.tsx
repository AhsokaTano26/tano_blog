'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';

type Tone = 'success' | 'error' | 'info';

interface Notice {
  message: string;
  tone?: Tone;
  revision?: number;
}

const ToastViewport = createContext<HTMLDivElement | null>(null);
const icons = { success: CircleCheck, error: CircleAlert, info: Info };

export function AdminToastProvider({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  return <ToastViewport.Provider value={viewport}>
    {children}
    <div ref={setViewport} className="admin-toast-viewport" aria-live="polite" />
  </ToastViewport.Provider>;
}

export function useAdminNotice(defaultTone: Tone = 'success') {
  const [notice, setNotice] = useState({ message: '', tone: defaultTone, revision: 0 });
  const notify = useCallback((message: SetStateAction<string>, tone: Tone = defaultTone) => {
    setNotice(previous => ({
      message: typeof message === 'function' ? message(previous.message) : message,
      tone,
      revision: previous.revision + 1,
    }));
  }, [defaultTone]);
  return [notice, notify] as const;
}

function TimedToast({ message, tone }: { message: string; tone: Tone }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;
  const Icon = icons[tone];
  return <div role={tone === 'error' ? 'alert' : 'status'} className="admin-toast" data-tone={tone}>
    <Icon size={18} aria-hidden="true" />
    <span>{message}</span>
  </div>;
}

export function AdminToast({ message, tone = 'success', revision = 0 }: Notice) {
  const viewport = useContext(ToastViewport);
  if (!message) return null;
  const toast = <TimedToast key={JSON.stringify([message, tone, revision])} message={message} tone={tone} />;
  return viewport ? createPortal(toast, viewport) : toast;
}

export function AdminRequestFeedback({ error, onRetry, pending = false, retryLabel = '重试' }: {
  error: string;
  onRetry?: () => void;
  pending?: boolean;
  retryLabel?: string;
}) {
  if (!error) return null;
  return <>
    <AdminToast message={error} tone="error" />
    {onRetry && <button type="button" onClick={onRetry} disabled={pending} className="admin-feedback-retry">{retryLabel}</button>}
  </>;
}
