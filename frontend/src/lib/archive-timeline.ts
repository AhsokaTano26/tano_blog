import type { ArchiveGroup } from '@/lib/pagination';

export interface ArchiveYear {
  year: number;
  count: number;
  months: ArchiveGroup[];
}

export function getArchiveYears(groups: ArchiveGroup[], query = ''): ArchiveYear[] {
  const search = query.trim().toLocaleLowerCase();
  const years = new Map<number, ArchiveYear>();
  for (const group of groups) {
    const posts = group.posts.filter(post => !search || `${post.title} ${post.excerpt || ''}`.toLocaleLowerCase().includes(search))
      .sort((a, b) => b.published_at.localeCompare(a.published_at));
    if (!posts.length) continue;
    const year = years.get(group.year) || { year: group.year, count: 0, months: [] };
    year.months.push({ ...group, posts, count: posts.length });
    year.count += posts.length;
    years.set(group.year, year);
  }
  return [...years.values()].sort((a, b) => b.year - a.year).map(year => ({
    ...year, months: year.months.sort((a, b) => b.month - a.month),
  }));
}

export function getTimelineProgress(now: Date) {
  const year = now.getFullYear();
  const day = now.getDate();
  const month = now.getMonth();
  // Calendar days must not be shifted by daylight-saving changes.
  const elapsedDays = (Date.UTC(year, month, day) - Date.UTC(year, 0, 1)) / 86_400_000;
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  const start = new Date(year, month, day).getTime();
  const end = new Date(year, month, day + 1).getTime();
  const fraction = (now.getTime() - start) / (end - start);
  return {
    dayOfYear: elapsedDays + 1,
    yearProgress: (elapsedDays + fraction) / daysInYear * 100,
    dayProgress: fraction * 100,
  };
}
