import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import ArticleMarkdown from '@/components/ArticleMarkdown';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import type { Post } from '@/lib/post-types';
import { fetchServerPost, ServerPostError } from '@/lib/server-post';
import { LegacyPassword } from './LegacyPassword';
import { formatDay, LEGACY_HOME, LEGACY_LIST } from './data';
import styles from './portal.module.css';

export async function LegacyArticle({ slug }: { slug: string }) {
  const cookie = (await cookies()).toString();
  let post: (Post & { password_protected?: boolean }) | undefined;
  try {
    post = (await fetchServerPost(slug, cookie)).post;
  } catch (error) {
    if (error instanceof ServerPostError && error.status === 404) notFound();
  }
  if (!post) return <p role="status" className={styles.empty}>文章暂时无法加载，请刷新重试。</p>;

  const date = formatDay(post.published_at || post.created_at);
  const author = post.author_name || post.author?.display_name || post.author?.nickname || post.author?.username;
  return (
    <article>
      <p className={styles.breadcrumb}>
        <a href={LEGACY_HOME}>网站首页</a> <span aria-hidden="true">&gt;</span> <a href={LEGACY_LIST}>文章列表</a> <span aria-hidden="true">&gt;</span> 正文
      </p>
      <header className={styles.articleHeading}>
        <h1>{post.title}</h1>
        <div>
          {author && <span>作者：{author}</span>}
          {date && <span>发布时间：<time dateTime={date}>{date}</time></span>}
          {post.category && <span>栏目：{post.category.name}</span>}
        </div>
      </header>
      {post.password_protected ? <LegacyPassword slug={slug} hint={post.password_hint} /> : (
        <div className={styles.articleBody}>
          {post.cover_image && <ImageWithFallback src={post.cover_image} alt={post.title} className={styles.articleCover} />}
          {post.content ? <div className={`article-content ${styles.markdown}`}><ArticleMarkdown content={post.content} /></div>
            : <p className={styles.empty}>暂无正文</p>}
        </div>
      )}
      <p className={styles.articleActions}><a href={LEGACY_LIST}>返回文章列表</a><a href={`/posts/${encodeURIComponent(slug)}`}>在新版中阅读</a></p>
    </article>
  );
}
