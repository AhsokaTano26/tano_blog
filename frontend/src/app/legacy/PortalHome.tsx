/* eslint-disable @next/next/no-html-link-for-pages -- Legacy navigation must recheck the saved setting on the server. */
import { ImageWithFallback } from '@/components/ImageWithFallback';
import type { PostSummary } from '@/lib/home-data';
import { CategoryLinks, FriendLinks, Panel, PhotoGrid, PostRows } from './Portal';
import { LegacyCalendar } from './LegacyCalendar';
import { LEGACY_LIST, legacyPostHref, readCategories, readFriends, readGallery, readPosts, tryRead } from './data';
import styles from './portal.module.css';

export async function PortalHome({ config, initialTime }: { config: Record<string, string>; initialTime: number }) {
  const [latest, popular, categories, friends, photos] = await Promise.all([
    readPosts(1, 8),
    tryRead<{ items: PostSummary[] }>('/api/v1/posts/top-viewed'),
    readCategories(),
    readFriends(),
    readGallery(1, 3),
  ]);
  const posts = latest?.items ?? [];
  const lead = posts[0];
  const illustrated = posts.find(post => post.cover_thumbnail_url || post.cover_image);
  const categoryItems = categories?.items ?? [];
  const gallery = photos?.items ?? [];
  const siteFacts = [
    { label: '文章收录', count: latest?.total, unit: '篇' },
    { label: '内容分类', count: categories?.items?.length, unit: '类' },
    { label: '图库收录', count: photos?.total, unit: '张' },
    { label: '友情链接', count: friends?.items?.length, unit: '站' },
  ].filter(item => typeof item.count === 'number');
  const image = gallery[0];
  const featuredUrl = illustrated?.cover_thumbnail_url || illustrated?.cover_image || image?.thumbnail_url || image?.url;
  const featuredHref = illustrated ? legacyPostHref(illustrated.slug) : '/legacy/gallery';

  return (
    <>
      <section className={styles.headline}>
        <h1>{lead ? <a href={legacyPostHref(lead.slug)}>{lead.title}</a> : config.site_title || '朝花夕拾录'}</h1>
        {(lead?.excerpt || config.site_description) && <p>{lead?.excerpt || config.site_description}</p>}
      </section>
      <div className={styles.columns}>
        <div className={`${styles.column} ${styles.newsColumn}`}>
          <Panel id="legacy-latest" title="最新文章" href={LEGACY_LIST}>
            {latest ? <PostRows posts={posts} /> : <p role="status" className={styles.empty}>文章暂时无法加载，请刷新重试。</p>}
          </Panel>
          <Panel title="文章分类"><CategoryLinks items={categoryItems} counts /></Panel>
          <Panel title="站点服务">
            <ul className={`${styles.rows} ${styles.serviceLinks}`}>
              <li><a href="/legacy/archive">时光归档</a></li>
              <li><a href={LEGACY_LIST}>文章检索</a></li>
              <li><a href="/rss.xml">RSS 订阅</a></li>
              <li><a href="/sitemap.xml">网站地图</a></li>
            </ul>
          </Panel>
        </div>
        <aside className={`${styles.column} ${styles.introColumn}`} aria-label="栏目与站点介绍">
          <Panel id="legacy-featured" title="图文精选">
            {featuredUrl ? <a className={styles.featured} href={featuredHref}>
              <ImageWithFallback src={featuredUrl} fallbackSrc={illustrated?.cover_image || image?.url}
                alt={illustrated?.title || image?.title || '浏览图片馆'} decoding="async" />
            </a> : <p className={styles.empty}>暂无图文</p>}
          </Panel>
          <Panel title="栏目导航"><CategoryLinks items={categoryItems.slice(0, 3)} /></Panel>
          <Panel title="站点介绍">
            <div className={styles.intro}>
              <a href="/legacy/about">{config.profile_name || 'Tano'}</a>
              {(config.profile_bio || config.site_description) && <p>{config.profile_bio || config.site_description}</p>}
              {siteFacts.length > 0 && (
                <dl className={styles.siteFacts}>
                  {siteFacts.map(({ label, count, unit }) => (
                    <div key={label}><dt>{label}</dt><dd>{count} {unit}</dd></div>
                  ))}
                </dl>
              )}
            </div>
          </Panel>
        </aside>
        <aside className={`${styles.column} ${styles.serviceColumn}`} aria-label="热门文章与电子日历">
          <Panel id="legacy-popular" title="热门文章"><PostRows posts={(popular?.items ?? []).slice(0, 8)} dated={false} /></Panel>
          <Panel title="电子日历"><LegacyCalendar initialTime={initialTime} /></Panel>
        </aside>
      </div>
      <div className={styles.bands}>
        <Panel title="友情链接" href="/legacy/links"><FriendLinks items={(friends?.items ?? []).slice(0, 8)} compact /></Panel>
        <Panel id="legacy-photos" title="影像记忆" href="/legacy/gallery"><PhotoGrid items={gallery} preview /></Panel>
      </div>
    </>
  );
}
