'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  indeterminate?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  value?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  className?: string;
  style?: CSSProperties;
}

export function Checkbox({ checked, onChange, label, indeterminate = false, disabled, className = '', style, ...props }: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (inputRef.current) inputRef.current.indeterminate = indeterminate; }, [indeterminate]);
  const Wrapper = label ? 'label' : 'span';
  return <Wrapper className={`admin-ui-checkbox ${className}`} style={style} data-disabled={disabled || undefined}
    onClick={event => event.stopPropagation()}>
    <span className="admin-ui-checkbox-control">
      <input {...props} ref={inputRef} type="checkbox" checked={checked} disabled={disabled}
        aria-checked={indeterminate ? 'mixed' : checked} className="admin-ui-checkbox-input"
        onChange={event => onChange(event.target.checked)} />
      <span className="admin-ui-checkbox-box" aria-hidden="true" data-checked={checked || indeterminate}>
        {indeterminate ? <Minus size={13} strokeWidth={3} /> : checked ? <Check size={13} strokeWidth={3} /> : null}
      </span>
    </span>
    {label && <span className="admin-ui-checkbox-label">{label}</span>}
  </Wrapper>;
}
