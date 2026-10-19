'use client';

export function RequestFeedback({ error, onRetry, pending = false }: {
  error: string;
  onRetry?: () => void;
  pending?: boolean;
}) {
  if (!error) return null;
  return <div role="alert" className="mb-3 rounded-lg p-3 text-sm" style={{ color: 'var(--color-error)', background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
    <span>{error}</span>
    {onRetry && <button type="button" onClick={onRetry} disabled={pending} className="ml-3 underline disabled:opacity-50">重试</button>}
  </div>;
}
