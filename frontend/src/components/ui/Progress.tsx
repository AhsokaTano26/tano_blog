import type { CSSProperties } from 'react';

export function Progress({ value, max = 100, className = '', style, ...props }: {
  value?: number;
  max?: number;
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const percent = value === undefined ? undefined : Math.min(100, Math.max(0, value / (max || 1) * 100));
  return <div {...props} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}
    className={`admin-ui-progress ${className}`} style={style}>
    <span className="admin-ui-progress-fill" data-indeterminate={percent === undefined || undefined} style={{ width: percent === undefined ? '35%' : `${percent}%` }} />
  </div>;
}
