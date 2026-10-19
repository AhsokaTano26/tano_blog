import type { SeriesItem, TaxonomyItem } from './admin-types';

export interface Post {
  id: string;
  title: string;
  slug: string;
  content?: string;
  excerpt?: string;
  cover_image?: string;
  cover_thumbnail_url?: string;
  status?: 'draft' | 'published';
  is_top?: boolean;
  allow_comment?: boolean;
  view_count?: number;
  comment_count?: number;
  category_id?: string | null;
  category?: TaxonomyItem | null;
  tags?: TaxonomyItem[];
  series?: SeriesItem[];
  author_name?: string;
  author?: { id: string; username: string; nickname?: string; display_name?: string };
  editor?: { id: string; username: string; nickname?: string; display_name?: string };
  password_set?: boolean;
  password_hint?: string;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
  scheduled_at?: string | null;
}

export interface PostMutation {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  cover_image?: string;
  status?: 'draft' | 'published';
  is_top?: boolean;
  allow_comment?: boolean;
  author_name?: string;
  category_id?: string | null;
  tag_ids?: string[];
  series_id?: string | null;
  scheduled_at?: string | null;
  created_at?: string;
  password?: string;
  password_hint?: string;
  expected_updated_at?: string;
}

export interface PostRevision {
  id: string;
  post_id?: string;
  title: string;
  content: string;
  excerpt?: string;
  created_at: string;
  editor?: { username: string; nickname?: string; display_name?: string };
}
