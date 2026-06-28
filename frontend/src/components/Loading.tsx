export function Loading({ text = '加载中...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <svg xmlns="http://www.w3.org/2000/svg" width="3em" height="3em" viewBox="0 0 24 24"
        style={{ color: 'var(--primary)' }}>
        <path d="M0 0h24v24H0z" fill="none" />
        <rect width="7.33" height="7.33" x="1" y="1" fill="currentColor">
          <animate id="a1" attributeName="x" begin="0;a9.end+0.2s" dur="0.6s" values="1;4;1" />
          <animate attributeName="y" begin="0;a9.end+0.2s" dur="0.6s" values="1;4;1" />
          <animate attributeName="width" begin="0;a9.end+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
          <animate attributeName="height" begin="0;a9.end+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
        </rect>
        <rect width="7.33" height="7.33" x="8.33" y="1" fill="currentColor">
          <animate attributeName="x" begin="a1.begin+0.1s" dur="0.6s" values="8.33;11.33;8.33" />
          <animate attributeName="y" begin="a1.begin+0.1s" dur="0.6s" values="1;4;1" />
          <animate attributeName="width" begin="a1.begin+0.1s" dur="0.6s" values="7.33;1.33;7.33" />
          <animate attributeName="height" begin="a1.begin+0.1s" dur="0.6s" values="7.33;1.33;7.33" />
        </rect>
        <rect width="7.33" height="7.33" x="1" y="8.33" fill="currentColor">
          <animate attributeName="x" begin="a1.begin+0.1s" dur="0.6s" values="1;4;1" />
          <animate attributeName="y" begin="a1.begin+0.1s" dur="0.6s" values="8.33;11.33;8.33" />
          <animate attributeName="width" begin="a1.begin+0.1s" dur="0.6s" values="7.33;1.33;7.33" />
          <animate attributeName="height" begin="a1.begin+0.1s" dur="0.6s" values="7.33;1.33;7.33" />
        </rect>
        <rect width="7.33" height="7.33" x="15.66" y="1" fill="currentColor">
          <animate attributeName="x" begin="a1.begin+0.2s" dur="0.6s" values="15.66;18.66;15.66" />
          <animate attributeName="y" begin="a1.begin+0.2s" dur="0.6s" values="1;4;1" />
          <animate attributeName="width" begin="a1.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
          <animate attributeName="height" begin="a1.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
        </rect>
        <rect width="7.33" height="7.33" x="8.33" y="8.33" fill="currentColor">
          <animate attributeName="x" begin="a1.begin+0.2s" dur="0.6s" values="8.33;11.33;8.33" />
          <animate attributeName="y" begin="a1.begin+0.2s" dur="0.6s" values="8.33;11.33;8.33" />
          <animate attributeName="width" begin="a1.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
          <animate attributeName="height" begin="a1.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
        </rect>
        <rect width="7.33" height="7.33" x="1" y="15.66" fill="currentColor">
          <animate attributeName="x" begin="a1.begin+0.2s" dur="0.6s" values="1;4;1" />
          <animate attributeName="y" begin="a1.begin+0.2s" dur="0.6s" values="15.66;18.66;15.66" />
          <animate attributeName="width" begin="a1.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
          <animate attributeName="height" begin="a1.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33" />
        </rect>
        <rect width="7.33" height="7.33" x="15.66" y="8.33" fill="currentColor">
          <animate attributeName="x" begin="a1.begin+0.3s" dur="0.6s" values="15.66;18.66;15.66" />
          <animate attributeName="y" begin="a1.begin+0.3s" dur="0.6s" values="8.33;11.33;8.33" />
          <animate attributeName="width" begin="a1.begin+0.3s" dur="0.6s" values="7.33;1.33;7.33" />
          <animate attributeName="height" begin="a1.begin+0.3s" dur="0.6s" values="7.33;1.33;7.33" />
        </rect>
        <rect width="7.33" height="7.33" x="8.33" y="15.66" fill="currentColor">
          <animate attributeName="x" begin="a1.begin+0.3s" dur="0.6s" values="8.33;11.33;8.33" />
          <animate attributeName="y" begin="a1.begin+0.3s" dur="0.6s" values="15.66;18.66;15.66" />
          <animate attributeName="width" begin="a1.begin+0.3s" dur="0.6s" values="7.33;1.33;7.33" />
          <animate attributeName="height" begin="a1.begin+0.3s" dur="0.6s" values="7.33;1.33;7.33" />
        </rect>
        <rect width="7.33" height="7.33" x="15.66" y="15.66" fill="currentColor">
          <animate id="a9" attributeName="x" begin="a1.begin+0.4s" dur="0.6s" values="15.66;18.66;15.66" />
          <animate attributeName="y" begin="a1.begin+0.4s" dur="0.6s" values="15.66;18.66;15.66" />
          <animate attributeName="width" begin="a1.begin+0.4s" dur="0.6s" values="7.33;1.33;7.33" />
          <animate attributeName="height" begin="a1.begin+0.4s" dur="0.6s" values="7.33;1.33;7.33" />
        </rect>
      </svg>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</span>
    </div>
  );
}
