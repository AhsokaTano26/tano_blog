import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
import editorial from '@/components/Editorial.module.css';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <section className={`${editorial.page} ${styles.page}`} aria-labelledby="not-found-title">
      <div className={styles.layout}>
        <div className={styles.note}>
          <p className={styles.code}>404</p>
          <h1 id="not-found-title" className={styles.title}>页面不见了</h1>
        </div>
        <nav className={styles.links} aria-label="继续浏览">
          <Link href="/" className={editorial.action}>
            <ArrowLeft size={16} aria-hidden="true" /> 返回首页
          </Link>
          <Link href="/search" className={editorial.action}>
            <Search size={16} aria-hidden="true" /> 搜索文章
          </Link>
        </nav>
      </div>
    </section>
  );
}
