import Link from 'next/link';
import { Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="glass-card rounded-2xl p-10 text-center max-w-md">
        <div className="text-7xl font-bold mb-4" style={{ color: 'var(--primary)', opacity: 0.3 }}>404</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>页面走丢了</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          你要找的页面不存在，可能已被移除或地址有误
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/"
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--primary)' }}>
            <Home className="w-4 h-4" />
            回到首页
          </Link>
          <Link href="/search"
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium btn-glass transition-colors"
            style={{ color: 'var(--text-secondary)' }}>
            <Search className="w-4 h-4" />
            搜索文章
          </Link>
        </div>
      </div>
    </div>
  );
}
