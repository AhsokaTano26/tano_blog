'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useExitPresence } from '@/lib/use-exit-presence';

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
  anchorRect?: { top: number; left: number };
}

const ConfirmContext = createContext<((message: string, anchorEl?: HTMLElement | null) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [open, setOpen] = useState(false);
  const present = useExitPresence(open);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const pending = useRef<ConfirmState | null>(null);

  const finish = useCallback((accepted: boolean) => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    current.resolve(accepted);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    function keyboard(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      document.documentElement.dataset.adminInput = 'keyboard';
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      if (event.key !== 'Tab' || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
    };
  }, [open, state, finish]);

  useEffect(() => () => { pending.current?.resolve(false); }, []);

  const confirm = useCallback((message: string, anchorEl?: HTMLElement | null) => {
    return new Promise<boolean>(resolve => {
      // Textareas can fill the viewport; attaching a dialog below them hides
      // every action. Only infer a button anchor, otherwise use the modal.
      const target = anchorEl || (document.activeElement instanceof window.HTMLButtonElement ? document.activeElement : null);
      if (!dialogRef.current?.contains(target)) triggerRef.current = target || null;
      const rect = target?.getBoundingClientRect();
      const fits = rect && rect.right >= 8 && rect.right + 320 <= window.innerWidth - 8 && rect.bottom + 200 <= window.innerHeight - 8;
      pending.current?.resolve(false);
      const next = {
        message,
        resolve,
        anchorRect: fits ? { top: rect.bottom + 4, left: rect.right } : undefined,
      };
      pending.current = next;
      setState(next);
      setOpen(true);
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {present && state && createPortal(
        <div className={`admin-overlay fixed z-[300] ${state.anchorRect ? '' : 'inset-0 flex items-center justify-center p-4'}`}
          data-state={open ? 'open' : 'closed'} inert={!open} aria-hidden={!open || undefined}
          onPointerDownCapture={() => { document.documentElement.dataset.adminInput = 'pointer'; }}
          style={state.anchorRect
            ? { top: state.anchorRect.top, left: state.anchorRect.left, width: 320, maxHeight: `calc(100dvh - ${state.anchorRect.top + 8}px)` }
            : { background: 'rgba(0,0,0,0.5)' }}
          onClick={event => { if (event.target === event.currentTarget) finish(false); }}>
          <div ref={dialogRef} role={open ? 'alertdialog' : undefined} aria-modal={open && !state.anchorRect ? true : undefined} aria-label="确认操作"
            className={`admin-dialog-panel w-full overflow-y-auto rounded-2xl shadow-2xl ${state.anchorRect ? 'admin-popover-panel p-5' : 'max-w-sm max-h-[85dvh] p-6'}`}
            style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(24px)', maxHeight: state.anchorRect ? 'inherit' : undefined }}>
            <p className="text-sm mb-5" style={{ color: 'var(--text-primary)' }}>{state.message}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => finish(false)} className="px-4 py-2 rounded-xl text-sm btn-glass btn-press"
                style={{ color: 'var(--text-secondary)' }}>取消</button>
              <button onClick={() => finish(true)} className="px-4 py-2 rounded-xl text-sm font-medium text-white btn-press"
                style={{ background: 'var(--primary)' }}>确定</button>
            </div>
          </div>
        </div>, document.body
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
    <label className="flex items-center gap-2 cursor-pointer select-none" onClick={event => event.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}
        aria-label={label || '选择'} className="w-5 h-5 rounded cursor-pointer" style={{ accentColor: 'var(--primary)' }} />
      {label && <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>}
    </label>
  );
}

interface SelectOption { value: string; label: string; }

export function Select({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  return (
    <select value={value} onChange={event => onChange(event.target.value)} aria-label={placeholder || '选择'}
      className="w-full px-3 py-2 rounded-xl text-sm glass-card cursor-pointer"
      style={{ color: value ? 'var(--text-primary)' : 'var(--text-info)' }}>
      {placeholder && !options.some(option => option.value === '') && <option value="">{placeholder}</option>}
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}
