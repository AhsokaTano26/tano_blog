'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { AlertCircle, HelpCircle, PencilLine } from 'lucide-react';

export { Checkbox } from '@/components/ui/Checkbox';
export { Select } from '@/components/ui/Select';

interface DialogActions {
  confirm: (message: string, anchorEl?: HTMLElement | null) => Promise<boolean>;
  alert: (message: string) => Promise<void>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
}
interface Request {
  kind: 'confirm' | 'alert' | 'prompt';
  message: string;
  resolve: (value: boolean | string | null) => void;
}
const ConfirmContext = createContext<DialogActions | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Request | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const pending = useRef<Request | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const acceptRef = useRef<HTMLButtonElement>(null);

  const finish = useCallback((accepted: boolean) => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    current.resolve(current.kind === 'prompt' ? (accepted ? value : null) : accepted);
    setOpen(false);
  }, [value]);

  const request = useCallback((kind: Request['kind'], message: string, defaultValue = '') => {
    pending.current?.resolve(pending.current.kind === 'prompt' ? null : false);
    return new Promise<boolean | string | null>(resolve => {
      const next = { kind, message, resolve };
      pending.current = next;
      setState(next);
      setValue(defaultValue);
      setOpen(true);
    });
  }, []);
  const confirm = useCallback(async (message: string, _anchorEl?: HTMLElement | null) => (await request('confirm', message)) === true, [request]);
  const alert = useCallback(async (message: string) => { await request('alert', message); }, [request]);
  const prompt = useCallback(async (message: string, defaultValue = '') => {
    const result = await request('prompt', message, defaultValue);
    return typeof result === 'string' ? result : null;
  }, [request]);
  useEffect(() => () => {
    const current = pending.current;
    pending.current = null;
    current?.resolve(current.kind === 'prompt' ? null : false);
  }, []);

  const Icon = state?.kind === 'prompt' ? PencilLine : state?.kind === 'alert' ? AlertCircle : HelpCircle;
  return <ConfirmContext.Provider value={{ confirm, alert, prompt }}>
    {children}
    {state && <Dialog open={open} onClose={() => finish(false)}
      title={state.kind === 'prompt' ? '输入信息' : state.kind === 'alert' ? '提示' : '确认操作'}
      role={state.kind === 'prompt' ? 'dialog' : 'alertdialog'} layer={700}
      initialFocusRef={state.kind === 'prompt' ? inputRef : state.kind === 'alert' ? acceptRef : cancelRef}
      className="admin-ui-confirm">
      <form onSubmit={event => { event.preventDefault(); finish(true); }}>
        <span className="admin-ui-confirm-icon"><Icon size={21} /></span>
        <p className="admin-ui-confirm-message">{state.message}</p>
        {state.kind === 'prompt' && <Input ref={inputRef} aria-label={state.message} value={value}
          onChange={event => setValue(event.target.value)} onFocus={event => event.target.select()} />}
        <div className="admin-ui-dialog-actions">
          {state.kind !== 'alert' && <button ref={cancelRef} type="button" className="admin-secondary-action" onClick={() => finish(false)}>取消</button>}
          <button ref={acceptRef} type="submit" className="admin-primary-action">确定</button>
        </div>
      </form>
    </Dialog>}
  </ConfirmContext.Provider>;
}

export function useConfirm() {
  const actions = useContext(ConfirmContext);
  if (!actions) throw new Error('useConfirm must be used within ConfirmProvider');
  return actions;
}
