export interface TaxonomyItem {
  id: string;
  name: string;
  slug: string;
  post_count?: number;
}

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  published_at?: string;
  created_at?: string;
  author_name?: string;
  category?: TaxonomyItem;
  series?: TaxonomyItem[];
  tags?: TaxonomyItem[];
  view_count?: number;
  comment_count?: number;
  cover_image?: string;
  cover_thumbnail_url?: string;
}

export interface HomeInitialData {
  posts?: { items: PostSummary[]; total: number };
  categories?: TaxonomyItem[];
  tags?: TaxonomyItem[];
  series?: TaxonomyItem[];
  profile?: Record<string, string>;
}

export interface HomeQuery {
  page: number;
  category: string;
  tag: string;
}

export const HOME_PAGE_SIZE = 10;

export function parseHomeQuery(params: Record<string, string | string[] | undefined>): HomeQuery {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const rawPage = first(params.page) || '1';
  const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    category: first(params.category) || '',
    tag: first(params.tag) || '',
  };
}

export function homePostParams(query: HomeQuery): Record<string, string> {
  return {
    page: String(query.page),
    page_size: String(HOME_PAGE_SIZE),
    ...(query.category ? { category: query.category } : {}),
    ...(query.tag ? { tag: query.tag } : {}),
  };
}
