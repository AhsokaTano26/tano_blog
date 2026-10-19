export interface TaxonomyItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  sort_order?: number;
  post_count?: number;
}

export interface SeriesItem extends TaxonomyItem {
  cover_image?: string;
}

export interface NavLinkItem {
  id: string;
  title: string;
  url: string;
  sort_order: number;
}

export interface FriendLinkItem {
  id: string;
  name: string;
  url: string;
  description?: string;
  avatar?: string;
  email?: string;
  status: string;
  sort_order?: number;
  created_at?: string;
}

export interface IpBanItem {
  id: string;
  ip_address: string;
  email?: string;
  scope: string;
  reason?: string;
  expires_at?: string;
  auto_ban?: boolean;
  created_at: string;
}

export interface AdminCommentItem {
  id: string;
  nickname: string;
  content: string;
  status: string;
  created_at: string;
  edited_count?: number;
  edited_at?: string;
  email?: string;
  ip_address: string;
  user_agent?: string;
  country?: string;
  city?: string;
  website?: string;
  post?: { id: string; title: string; slug: string };
}

export interface CommentRevision {
  id: string;
  content: string;
  edited_at: string;
}

export interface MediaTag { id: string; name: string }

export interface MediaItem {
  id: string;
  thumbnail_url?: string;
  url: string;
  original_name: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
  tags: MediaTag[];
  title?: string;
  artist?: string;
  album?: string;
  description?: string;
  in_gallery?: boolean;
}
