import type { Post } from './post-types';

export function getPostAuthorName(post?: Pick<Post, 'author_name' | 'author'> | null): string {
  const candidates = [post?.author_name, post?.author?.display_name, post?.author?.nickname, post?.author?.username];
  return candidates.map(name => name?.trim()).find(Boolean) || 'Tano';
}
