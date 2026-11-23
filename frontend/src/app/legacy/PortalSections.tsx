import ArticleMarkdown from '@/components/ArticleMarkdown';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { Globe } from 'lucide-react';
import type { PostSummary } from '@/lib/home-data';
import { CategoryLinks, FriendLinks, Pagination, Panel, PhotoGrid, PostRows, SectionHeading } from './Portal';
import { dateOf, LEGACY_LIST, legacyPostHref, readCategories, readFriends, readGallery, readPosts, tryRead, type ArchiveMonth, type Collection } from './data';
import styles from './portal.module.css';

const unavailable = <p role="status" className={styles.empty}>内容暂时无法加载，请刷新重试。</p>;

function ArticleDirectory({ posts }: { posts: PostSummary[] }) {
  if (posts.length === 0) return <p className={styles.empty}>暂无文章</p>;
  return (
    <ul className={styles.articleDirectory}>
      {posts.map(post => {
        const cover = post.cover_thumbnail_url || post.cover_image;
        const date = dateOf(post);
        return (
          <li key={post.id}>
            <div className={styles.directoryThumb} aria-hidden="true">
              {cover ? <ImageWithFallback src={cover} fallbackSrc={post.cover_image} alt="" loading="lazy" />
                : <Globe size={29} strokeWidth={1.7} />}
            </div>
            <div>
              <h2><a href={legacyPostHref(post.slug)}>{post.title}</a></h2>
              {post.excerpt && <p>{post.excerpt}</p>}
              {date && <time dateTime={date}>{date}</time>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export async function ArticleList({ page, search, category }: { page: number; search: string; category: string }) {
  const [posts, categories] = await Promise.all([
    readPosts(page, 10, { ...(search ? { search } : {}), ...(category ? { category } : {}) }),
    readCategories(),
  ]);

  return (
    <>
      <SectionHeading title={search ? '文章检索' : '文章列表'} />
      <div className={styles.sectionGrid}>
        <aside><Panel title="栏目导航"><CategoryLinks items={categories?.items ?? []} active={category} /></Panel></aside>
        <div>
          {search && <p className={styles.searchResult}>关键词“{search}”{posts && `，共 ${posts.total} 篇文章`}</p>}
          {posts ? (
            <>
              <ArticleDirectory posts={posts.items ?? []} />
              <Pagination path={LEGACY_LIST} filters={{ q: search, category }} collection={posts} />
            </>
          ) : unavailable}
        </div>
      </div>
    </>
  );
}

export async function ArchiveList({ page }: { page: number }) {
  const archive = await tryRead<Collection<ArchiveMonth>>('/api/v1/archive', { page: String(page), page_size: '30' });
  return (
    <>
      <SectionHeading title="时光归档" />
      {archive ? <>
        <div className={styles.bands}>
          {archive.items?.length ? archive.items.map(month => (
            <Panel key={`${month.year}-${month.month}`} title={`${month.year} 年 ${month.month} 月`}>
              <PostRows posts={month.posts} />
            </Panel>
          )) : <p className={styles.empty}>暂无归档文章</p>}
        </div>
        <Pagination path="/legacy/archive" collection={archive} />
      </> : unavailable}
    </>
  );
}

export async function GalleryList({ page }: { page: number }) {
  const gallery = await readGallery(page, 18);
  return (
    <>
      <SectionHeading title="图片馆" />
      {gallery ? <>
        <PhotoGrid items={gallery.items ?? []} />
        <Pagination path="/legacy/gallery" collection={gallery} />
      </> : unavailable}
    </>
  );
}

export async function FriendDirectory() {
  const friends = await readFriends();
  return (
    <>
      <SectionHeading title="友情链接" />
      {friends ? <FriendLinks items={friends.items ?? []} /> : unavailable}
      <p className={styles.articleActions}><a href="/links">前往新版申请友链</a></p>
    </>
  );
}

export async function AboutPortal({ config }: { config: Record<string, string> }) {
  const about = await tryRead<{ config: Record<string, string> }>('/api/v1/config/about');
  const bio = config.profile_bio || config.site_description;
  const contents = about?.config?.about_content;
  return (
    <>
      <SectionHeading title="关于本站" />
      <div className={styles.articleBody}>
        <h2>{config.profile_name || 'Tano'}</h2>
        {bio && <p>{bio}</p>}
        {contents && <div className={`article-content ${styles.markdown}`}><ArticleMarkdown content={contents} /></div>}
        <section id="legacy-edition" className={styles.editionNote}>
          <h2>旧版说明</h2>
          <p>旧版门户已开放。可从栏目菜单浏览文章、时光归档、图片和友链，页面上方也可以随时切回新版。</p>
        </section>
        <p className={styles.articleActions}><a href="/about">在新版查看联系方式</a></p>
      </div>
    </>
  );
}
