import styles from './Loading.module.css';

export function LoadingSVG() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="3em" height="3em" viewBox="0 0 24 24"
      aria-hidden="true" focusable="false" style={{ color: 'var(--primary)' }}>
      {Array.from({ length: 9 }, (_, index) => {
        const row = Math.floor(index / 3);
        const column = index % 3;
        return <rect key={index} className={styles.square} width="7.33" height="7.33"
          x={1 + column * 7.33} y={1 + row * 7.33} fill="currentColor"
          style={{ animationDelay: `${(row + column) * 0.2}s` }} />;
      })}
    </svg>
  );
}

export function Loading({ text = '加载中...' }: { text?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center py-20 gap-4">
      <LoadingSVG />
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</span>
    </div>
  );
}
