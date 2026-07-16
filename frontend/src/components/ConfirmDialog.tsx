'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
  anchorRect?: { top: number; left: number };
}

const ConfirmContext = createContext<((message: string, anchorEl?: HTMLElement | null) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((message: string, anchorEl?: HTMLElement | null) => {
    return new Promise<boolean>(resolve => {
      const target = anchorEl || (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
      const rect = target?.getBoundingClientRect();
      setState({
        message,
        resolve,
        anchorRect: rect ? { top: rect.bottom + 4, left: rect.right } : undefined,
      });
    });
  }, []);

  const handleConfirm = () => {
    state?.resolve(true);
    setState(null);
  };

  const handleCancel = () => {
    state?.resolve(false);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <>
          {/* Backdrop only for centered mode */}
          {!state.anchorRect && (
            <div className="fixed inset-0 z-[300] animate-fade-in"
              style={{ background: 'rgba(0,0,0,0.5)' }}
              onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }} />
          )}
          {state.anchorRect ? (
            // Anchor-positioned popover
            <div className="fixed z-[300] animate-fade-in"
              style={{ top: state.anchorRect.top, left: state.anchorRect.left }}>
              <div className="rounded-2xl p-5 shadow-2xl"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(24px)', minWidth: '220px' }}>
                <p className="text-sm mb-5" style={{ color: 'var(--text-primary)' }}>{state.message}</p>
                <div className="flex justify-end gap-2">
                  <button onClick={handleCancel}
                    className="px-4 py-2 rounded-xl text-sm btn-glass btn-press"
                    style={{ color: 'var(--text-secondary)' }}>取消</button>
                  <button onClick={handleConfirm}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-white btn-press"
                    style={{ background: 'var(--primary)' }}>确定</button>
                </div>
              </div>
            </div>
          ) : (
            // Centered modal
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4"
              onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
              <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-fade-scale-in"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(24px)' }}>
                <p className="text-sm mb-6" style={{ color: 'var(--text-primary)' }}>{state.message}</p>
                <div className="flex justify-end gap-2">
                  <button onClick={handleCancel}
                    className="px-4 py-2 rounded-xl text-sm btn-glass btn-press"
                    style={{ color: 'var(--text-secondary)' }}>取消</button>
                  <button onClick={handleConfirm}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-white btn-press"
                    style={{ background: 'var(--primary)' }}>确定</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used within ConfirmProvider');
  return { confirm };
}

export function Checkbox({ checked, onChange, label }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className="w-5 h-5 rounded flex items-center justify-center transition-all"
        style={{
          background: checked ? 'var(--primary)' : 'var(--btn-card-bg)',
          border: checked ? 'none' : '2px solid var(--glass-border)',
        }}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {label && <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>}
    </label>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

export function Select({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  // Compute position after open state is committed to DOM
  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const estimatedHeight = options.length * 36 + 8;
      const bottomSpace = window.innerHeight - rect.bottom;
      if (bottomSpace < estimatedHeight && rect.top > estimatedHeight) {
        setPos({ top: rect.top - estimatedHeight, left: rect.left, width: rect.width });
      } else {
        setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      }
    }
  }, [open]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const triggerEl = ref.current;
      const portalEl = portalRef.current;
      if (triggerEl && !triggerEl.contains(target) && portalEl && !portalEl.contains(target)) {
        setOpen(false);
      }
    }
    // Delay adding listener to avoid catching the opening click
    const id = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card flex items-center justify-between cursor-pointer transition-colors"
        style={{ color: value ? 'var(--text-primary)' : 'var(--text-info)' }}>
        <span>{selected?.label || placeholder || '请选择'}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-info)' }} />
      </div>

      {open && typeof window !== 'undefined' && createPortal(
        <div ref={portalRef}
          className="rounded-xl shadow-2xl py-1"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
            background: 'var(--card-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(24px)',
          }}>
          {options.map(opt => (
            <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              className="px-3 py-2 text-sm cursor-pointer transition-colors hover:opacity-80"
              style={{
                background: opt.value === value ? 'var(--primary-sub)' : 'transparent',
                color: opt.value === value ? 'var(--primary)' : 'var(--text-primary)',
              }}>
              {opt.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
