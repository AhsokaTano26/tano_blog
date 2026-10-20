'use client';

import * as Primitive from '@radix-ui/react-dialog';
import { createContext, useContext, useEffect, useId, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';

const DialogLayer = createContext(200);

export interface DialogProps {
  open?: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  role?: 'dialog' | 'alertdialog';
  closeOnOutside?: boolean;
  hideCloseButton?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  layer?: number;
}

export function Dialog({ open = true, onClose, title, description, children, className = '', style, role = 'dialog', closeOnOutside = true, hideCloseButton = true, initialFocusRef, layer }: DialogProps) {
  const inheritedLayer = useContext(DialogLayer);
  const level = layer ?? inheritedLayer;
  const triggerRef = useRef<HTMLElement | null>(null);
  const descriptionId = useId();
  useEffect(() => {
    if (!open && triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
  }, [open]);
  return <Primitive.Root open={open} onOpenChange={next => { if (!next) onClose(); }}>
    <Primitive.Portal>
      <Primitive.Overlay className="admin-overlay admin-ui-dialog-overlay" style={{ zIndex: level }} />
      <Primitive.Content role={role} className={`admin-dialog-panel admin-ui-dialog ${className}`} style={{ zIndex: level + 1, ...style }}
        aria-describedby={description ? descriptionId : undefined}
        onOpenAutoFocus={event => {
          triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          if (initialFocusRef?.current) { event.preventDefault(); initialFocusRef.current.focus({ preventScroll: true }); }
        }}
        onCloseAutoFocus={event => { event.preventDefault(); if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true }); }}
        onPointerDownOutside={event => { if (!closeOnOutside) event.preventDefault(); }}
        onEscapeKeyDown={() => { document.documentElement.dataset.adminInput = 'keyboard'; }}>
        <Primitive.Title className="sr-only">{title}</Primitive.Title>
        {description && <Primitive.Description id={descriptionId} className="sr-only">{description}</Primitive.Description>}
        <DialogLayer.Provider value={level + 20}>{children}</DialogLayer.Provider>
        {!hideCloseButton && <Primitive.Close className="admin-ui-dialog-close" aria-label="关闭弹窗"><X size={18} /></Primitive.Close>}
      </Primitive.Content>
    </Primitive.Portal>
  </Primitive.Root>;
}
