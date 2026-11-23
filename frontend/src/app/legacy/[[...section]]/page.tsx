import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PortalFrame } from '../Portal';
import { PortalHome } from '../PortalHome';
import { AboutPortal, ArchiveList, ArticleList, FriendDirectory, GalleryList } from '../PortalSections';
import { LegacyArticle } from '../LegacyArticle';
import { LegacyLogin } from '../LegacyLogin';
import { LegacyAvailability } from '@/components/LegacyAvailability';
import { isLegacyOpen, readCategories, readListQuery, tryRead, type LegacySearchParams } from '../data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '旧版门户 · 朝花夕拾录', robots: { index: false, follow: true } };

const knownSections = new Set(['', 'posts', 'archive', 'gallery', 'links', 'about', 'login']);

export default async function LegacyPage({ params, searchParams }: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<LegacySearchParams>;
}) {
  const { section = [] } = await params;
  const [active = '', slug] = section;
  if (!knownSections.has(active) || section.length > (active === 'posts' ? 2 : 1)) notFound();

  // Every legacy URL runs this check before loading any portal content.
  if (!await isLegacyOpen()) notFound();

  const query = readListQuery(await searchParams);
  const [site, taxonomy] = await Promise.all([
    tryRead<{ config: Record<string, string> }>('/api/v1/config/public'),
    active === 'login' ? null : readCategories(),
  ]);
  const config = site?.config ?? {};
  if (active === 'login') {
    return <LegacyAvailability><LegacyLogin title={config.site_title || '朝花夕拾录'} /></LegacyAvailability>;
  }
  const categories = (taxonomy?.items ?? []).map(({ slug, name }) => ({ slug, name }));
  const date = new Date();
  const modernHref = active === 'posts'
    ? (slug ? `/posts/${encodeURIComponent(slug)}` : '/')
    : (active ? `/${active}` : '/');

  const content = (() => {
    switch (active) {
      case 'posts': return slug ? <LegacyArticle slug={slug} /> : <ArticleList {...query} />;
      case 'archive': return <ArchiveList page={query.page} />;
      case 'gallery': return <GalleryList page={query.page} />;
      case 'links': return <FriendDirectory />;
      case 'about': return <AboutPortal config={config} />;
      default: return <PortalHome config={config} initialTime={date.getTime()} />;
    }
  })();

  return (
    <PortalFrame config={config} active={active} search={query.search} modernHref={modernHref} categories={categories} date={date}>
      {content}
    </PortalFrame>
  );
}
