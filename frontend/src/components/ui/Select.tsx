'use client';

import * as Primitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { CSSProperties } from 'react';

export interface SelectOption { value: string; label: string; disabled?: boolean; }
export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  className?: string;
  style?: CSSProperties;
}

// Radix reserves an empty value for its placeholder. Encode values so an actual
// "none/all" option remains keyboard-selectable, including in form filters.
const encode = (value: string) => `option:${value}`;

export function Select({ value, onChange, options, placeholder, disabled, required, name, className = '', style, ...props }: SelectProps) {
  const items = placeholder && !options.some(option => option.value === '')
    ? [{ value: '', label: placeholder }, ...options] : options;
  const selected = items.find(option => option.value === value);
  return <Primitive.Root value={selected && (!required || value) ? encode(value) : ''} onValueChange={next => onChange(next.slice(7))}
    disabled={disabled || items.length === 0} required={required}>
    {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
    <Primitive.Trigger {...props} aria-label={props['aria-label'] || placeholder || '选择'} data-value={value}
      className={`admin-ui-select-trigger ${className}`} style={style}>
      <Primitive.Value placeholder={placeholder || '请选择'}>{selected?.label}</Primitive.Value>
      <Primitive.Icon className="admin-ui-select-icon"><ChevronDown size={15} /></Primitive.Icon>
    </Primitive.Trigger>
    <Primitive.Portal>
      <Primitive.Content className="admin-ui-popover admin-ui-select-content" position="popper" sideOffset={6} collisionPadding={8}>
        <Primitive.ScrollUpButton className="admin-ui-select-scroll"><ChevronUp size={14} /></Primitive.ScrollUpButton>
        <Primitive.Viewport className="admin-ui-select-viewport">
          {items.map(option => <Primitive.Item className="admin-ui-select-option" key={option.value} value={encode(option.value)} data-value={option.value} disabled={option.disabled}>
            <Primitive.ItemText>{option.label}</Primitive.ItemText>
            <Primitive.ItemIndicator className="admin-ui-select-check"><Check size={14} /></Primitive.ItemIndicator>
          </Primitive.Item>)}
        </Primitive.Viewport>
        <Primitive.ScrollDownButton className="admin-ui-select-scroll"><ChevronDown size={14} /></Primitive.ScrollDownButton>
      </Primitive.Content>
    </Primitive.Portal>
  </Primitive.Root>;
}
