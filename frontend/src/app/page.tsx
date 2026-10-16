import HomeClient from '@/components/HomeClient';
import { fetchPublicApi } from '@/lib/server-api';
import { homePostParams, parseHomeQuery, type HomeInitialData, type TaxonomyItem } from '@/lib/home-data';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseHomeQuery(await searchParams);
  const [posts, categories, tags, series, profile] = await Promise.allSettled([
    fetchPublicApi<NonNullable<HomeInitialData['posts']>>('/api/v1/posts', homePostParams(query)),
    fetchPublicApi<{ items: TaxonomyItem[] }>('/api/v1/categories'),
    fetchPublicApi<{ items: TaxonomyItem[] }>('/api/v1/tags'),
    fetchPublicApi<{ items: TaxonomyItem[] }>('/api/v1/series'),
    fetchPublicApi<{ config: Record<string, string> }>('/api/v1/config/public'),
  ]);
  const initialData: HomeInitialData = {
    posts: posts.status === 'fulfilled' ? posts.value : undefined,
    categories: categories.status === 'fulfilled' ? categories.value.items || [] : undefined,
    tags: tags.status === 'fulfilled' ? tags.value.items || [] : undefined,
    series: series.status === 'fulfilled' ? series.value.items || [] : undefined,
    profile: profile.status === 'fulfilled' ? profile.value.config || {} : undefined,
  };
  return <HomeClient key={JSON.stringify(query)} initialQuery={query} initialData={initialData} />;
}
