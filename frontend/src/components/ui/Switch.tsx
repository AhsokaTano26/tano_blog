'use client';

export function Switch({ checked, onChange, disabled, 'aria-label': label }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label': string;
}) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled}
    className="admin-ui-switch" onClick={event => { event.stopPropagation(); onChange(!checked); }}>
    <span className="admin-ui-switch-thumb" aria-hidden="true" />
  </button>;
}
