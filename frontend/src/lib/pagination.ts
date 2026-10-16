export function mergeById<T extends { id: string }>(previous: T[], incoming: T[]): T[] {
  const entries = new Map(previous.map(item => [item.id, item]));
  for (const item of incoming) entries.set(item.id, item);
  return [...entries.values()];
}

export interface ArchiveGroup {
  year: number;
  month: number;
  count: number;
  posts: { id: string; slug: string; title: string; published_at: string }[];
}

export function mergeArchiveGroups(previous: ArchiveGroup[], incoming: ArchiveGroup[]): ArchiveGroup[] {
  const groups = new Map(previous.map(group => [`${group.year}-${group.month}`, group]));
  for (const group of incoming) {
    const key = `${group.year}-${group.month}`;
    const existing = groups.get(key);
    const posts = mergeById(existing?.posts || [], group.posts);
    groups.set(key, { ...group, posts, count: Math.max(existing?.count || 0, group.count, posts.length) });
  }
  return [...groups.values()];
}
