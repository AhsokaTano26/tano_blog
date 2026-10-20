'use client';

import { Tooltip } from './Tooltip';
import { Upload } from 'lucide-react';
import { forwardRef, useId, useImperativeHandle, useRef, useState, type InputHTMLAttributes } from 'react';

export interface FilePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  compact?: boolean;
}

export const FilePicker = forwardRef<HTMLInputElement, FilePickerProps>(function FilePicker({
  label, compact, className = '', style, disabled, onChange, onFocus, id, ...props
}, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const filenameId = useId();
  const [filenames, setFilenames] = useState<string[]>([]);
  useImperativeHandle(ref, () => inputRef.current!, []);
  const caption = label || '选择文件';
  const description = [props['aria-describedby'], filenameId].filter(Boolean).join(' ');

  return <div className={`admin-ui-file-picker ${className}`} style={style} data-compact={compact || undefined} data-disabled={disabled || undefined}>
    <input {...props} ref={inputRef} id={id} type="file" disabled={disabled} className="admin-ui-file-input" tabIndex={-1}
      aria-hidden="true"
      aria-label={props['aria-label'] || caption} aria-describedby={description}
      onFocus={event => { buttonRef.current?.focus(); onFocus?.(event); }} onChange={event => {
        setFilenames(Array.from(event.target.files || [], file => file.name));
        onChange?.(event);
      }} />
    <button ref={buttonRef} type="button" className="admin-ui-file-button" disabled={disabled}
      aria-label={props['aria-label'] || caption} aria-describedby={description} onClick={() => inputRef.current?.click()}>
      <Upload size={15} aria-hidden="true" /><span>{caption}</span>
    </button>
    <Tooltip content={filenames.join('、')}><span id={filenameId} className="admin-ui-file-name" aria-live="polite" data-tooltip={filenames.join('、')}>
      {filenames.length ? filenames.join('、') : '未选择文件'}
    </span></Tooltip>
  </div>;
});
