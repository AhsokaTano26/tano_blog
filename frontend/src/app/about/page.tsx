'use client';

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="card-base rounded-2xl p-8" style={{ background: 'var(--card-bg)' }}>
        <div className="flex justify-center mb-6">
          <img src="/aimi.png" alt="Tano" loading="lazy" className="w-24 h-24 rounded-full object-cover shadow-lg" />
        </div>
        <h2 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--text-primary)' }}>Tano</h2>
        <p className="text-center mb-6" style={{ color: 'var(--text-secondary)' }}>A BanG Dreamer!</p>
        <div className="space-y-4" style={{ color: 'var(--text-secondary)' }}>
          <p>这里是 Tano 的个人博客，记录生活的点滴和兴趣的分享。</p>
          <p>本站主要分享：</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>BanG Dream! 相关内容（翻译、感想、资源）</li>
            <li>技术学习笔记和教程</li>
            <li>偶尔的生活随笔</li>
          </ul>
          <p>联系我：<a href="mailto:public@tano.asia" className="hover:underline" style={{ color: 'var(--primary)' }}>public@tano.asia</a></p>
          <p>GitHub：<a href="https://github.com/AhsokaTano26" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--primary)' }}>AhsokaTano26</a></p>
        </div>
      </div>
    </div>
  );
}
