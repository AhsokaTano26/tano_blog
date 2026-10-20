'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';

interface DisclosureProps {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  defaultOpen?: boolean;
}

export function Disclosure({ title, children, className = '', style, defaultOpen = false }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <div className={`admin-ui-disclosure ${className}`} style={style} data-state={open ? 'open' : 'closed'}>
    <button type="button" className="admin-ui-disclosure-trigger" id={`${id}-trigger`}
      aria-expanded={open} aria-controls={`${id}-content`} onClick={() => setOpen(value => !value)}>
      <span className="admin-ui-disclosure-title">{title}</span>
      <ChevronDown className="admin-ui-disclosure-chevron" size={16} aria-hidden="true" />
    </button>
    <div className="admin-ui-disclosure-content" id={`${id}-content`} role="region" aria-labelledby={`${id}-trigger`} hidden={!open}>
      {children}
    </div>
  </div>;
}
