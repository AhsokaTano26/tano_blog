import { cache } from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { fetchServerPost, ServerPostError } from '@/lib/server-post';
import PostClient from './PostClient';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

// React cache shares this read with generateMetadata only within this request.
// The fetch itself is no-store, including admin drafts and password access.
const readPost = cache(async (slug: string) => {
  const cookie = (await cookies()).toString();
  try {
    return { data: await fetchServerPost(slug, cookie), status: 200 };
  } catch (error) {
    return { data: null, status: error instanceof ServerPostError ? error.status : 503 };
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await readPost(slug);
  const post = data?.post;
  if (!post) return { title: '文章暂时无法加载', robots: { index: false } };
  return {
    title: post.title,
    description: post.excerpt || '',
    openGraph: { title: post.title, description: post.excerpt || '', type: 'article' },
    ...(post.password_protected || post.status !== 'published' ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const { data, status } = await readPost(slug);
  if (status === 404) notFound();
  return <PostClient key={slug} slug={slug} initialData={data}
    initialError={data ? '' : '文章暂时无法加载，请重试'} initialRetry={status === 409} />;
}
