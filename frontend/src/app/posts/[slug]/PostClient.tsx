'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { api } from '@/lib/api';
import { Turnstile } from '@/components/Turnstile';
import { Calendar, Eye, Copy, Check, BookOpen, Shield, User, Edit3, Bookmark, ArrowLeft } from 'lucide-react';
import { ContentHeadInjection } from '@/components/HtmlInjection';
import { ReadingProgress } from '@/components/ReadingProgress';
import { ArticleToc } from '@/components/ArticleToc';
import { ArticleSignature } from '@/components/ArticleSignature';
import { getPostAuthorName } from '@/lib/post-author';
import { ImageLightbox } from '@/components/ImageLightbox';
import { Loading } from '@/components/Loading';
import { ReactionBar } from '@/components/ReactionBar';
import { applyReaction, type ReactionState } from '@/lib/reactions';
import { ScrollReveal } from '@/components/ScrollReveal';
import ArticleMarkdown from '@/components/ArticleMarkdown';
import { CommentMarkdown } from '@/components/CommentMarkdown';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { LoadMore } from '@/components/LoadMore';
import { usePagedItems } from '@/lib/use-paged-items';
import { mergeById } from '@/lib/pagination';
import type { PostResponse } from '@/lib/server-post';
import editorial from '@/components/Editorial.module.css';
import styles from './PostClient.module.css';

type Reactions = Record<string, { counts: Record<string, number>; user: string[] }>;

function collectReactions(items: any[]): Reactions {
  const reactions: Reactions = {};
  for (const comment of items) {
    reactions[comment.id] = { counts: comment.reactions || {}, user: comment.user_emojis || [] };
    Object.assign(reactions, collectReactions(comment.children || []));
  }
  return reactions;
}

interface ShareButton {
  name: string;
  shareUrl: (url: string, title: string) => string;
}

const shareButtons: ShareButton[] = [
  {
    name: '微博',
    shareUrl: (url: string, title: string) =>
      `https://service.weibo.com/share/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  },
  {
    name: 'QQ空间',
    shareUrl: (url: string, title: string) =>
      `https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  },
  {
    name: '豆瓣',
    shareUrl: (url: string, title: string) =>
      `https://www.douban.com/share/service?href=${encodeURIComponent(url)}&name=${encodeURIComponent(title)}`,
  },
  {
    name: '复制链接',
    shareUrl: () => '#',
  },
];

function SharePanel({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = (btn: ShareButton) => {
    if (btn.name === '复制链接') {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      window.open(btn.shareUrl(url, title), '_blank', 'noopener,noreferrer');
    }
  };

  const shareIcon = (name: string) => {
    switch (name) {
      case '微博': return (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.739 5.443zM16.965 11.68c-.246-.077-.414-.132-.285-.475.283-.744.313-1.386.006-1.844-.575-.854-2.15-.808-3.948-.026 0 0-.566.247-.422-.202.277-.882.236-1.623-.196-2.054-.981-.981-3.593.035-5.843 2.271-1.679 1.668-2.646 3.443-2.646 4.985 0 2.965 3.796 4.783 7.502 4.783 4.859 0 8.089-2.833 8.089-5.089.001-1.363-1.142-2.133-2.257-2.329zm2.212-5.111c-.963-1.076-2.38-1.486-3.766-1.248a.606.606 0 00-.492.693.611.611 0 00.698.489c.931-.16 1.876.118 2.534.844.659.727.864 1.7.578 2.594a.608.608 0 00.429.764.61.61 0 00.769-.427c.419-1.304.128-2.715-.75-3.715zm-1.389 2.046c-.455-.509-1.121-.713-1.788-.603a.436.436 0 00-.361.507.439.439 0 00.506.36c.315-.055.641.039.86.287.219.247.285.577.195.87a.436.436 0 00.304.543.437.437 0 00.543-.302c.151-.502.038-1.059-.259-1.662z"/>
        </svg>
      );
      case 'QQ空间': return (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21.395 15.035a39.548 39.548 0 00-1.06-3.474c.043-.61.043-1.254 0-1.859a39.548 39.548 0 001.06-3.474c.165-.37-.053-.786-.443-.912a28.09 28.09 0 00-3.265-.995c-.273-.063-.556.051-.698.286a37.06 37.06 0 01-2.279 3.272 35.08 35.08 0 01-2.711-1.723 35.08 35.08 0 01-2.711 1.723A37.06 37.06 0 016.069 8.38c-.142-.235-.425-.349-.698-.286a28.09 28.09 0 00-3.265.995c-.39.126-.608.542-.443.912a39.548 39.548 0 001.06 3.474c-.043.605-.043 1.249 0 1.859a39.548 39.548 0 00-1.06 3.474c-.165.37.053.786.443.912a28.09 28.09 0 003.265.995c.273.063.556-.051.698-.286a37.06 37.06 0 012.279-3.272c.889.575 1.8 1.127 2.711 1.723.911-.596 1.822-1.148 2.711-1.723a37.06 37.06 0 012.279 3.272c.142.235.425.349.698.286a28.09 28.09 0 003.265-.995c.39-.126.608-.542.443-.912zM12 14.4c-1.325 0-2.4-1.075-2.4-2.4s1.075-2.4 2.4-2.4 2.4 1.075 2.4 2.4-1.075 2.4-2.4 2.4z"/>
        </svg>
      );
      case '豆瓣': return (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 14H8v-2h8v2zm0-4H8v-2h8v2zm0-4H8V6h8v2z" />
        </svg>
      );
      case '复制链接': return copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm" style={{ color: 'var(--text-info)' }}>分享到：</span>
      {shareButtons.map((btn) => (
        <button
          key={btn.name}
          onClick={() => handleShare(btn)}
          aria-label={`分享到${btn.name}`}
          className={`${editorial.action} w-11`}
          style={{ color: 'var(--text-secondary)' }}
          title={btn.name}
        >
          {shareIcon(btn.name)}
        </button>
      ))}
      {copied && (
        <span className="text-xs" style={{ color: 'hsl(142, 60%, 50%)' }}>已复制</span>
      )}
    </div>
  );
}


/* ── Recursive Comment Item ── */
function CommentItem({ comment, depth, onReply, reactions, onReaction, slug, sort, onLoadReactions }: {
  comment: any;
  depth: number;
  onReply: (c: any) => void;
  reactions: Record<string, {counts: Record<string, number>, user: string[]}>;
  onReaction: (commentId: string, emoji: string) => Promise<boolean>;
  slug: string;
  sort: string;
  onLoadReactions: (items: any[]) => void;
}) {
  const [children, setChildren] = useState<any[]>(comment.children || []);
  const [page, setPage] = useState(Math.ceil((comment.children?.length || 0) / 10));
  const [total, setTotal] = useState(comment.children_total ?? comment.children?.length ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const sequence = useRef(0);
  useEffect(() => {
    setChildren(comment.children || []);
    setPage(Math.ceil((comment.children?.length || 0) / 10));
    setTotal(comment.children_total ?? comment.children?.length ?? 0);
    setError('');
    setLoading(false);
    busy.current = false;
    return () => { sequence.current++; };
  }, [comment.children, comment.children_total]);
  async function loadReplies() {
    if (busy.current) return;
    const request = ++sequence.current;
    busy.current = true;
    setLoading(true);
    setError('');
    try {
      // Embedded replies are chronological regardless of the root comment sort.
      const result = await api.getComments(slug, 'oldest', { parent_id: comment.id, page: String(page + 1), page_size: '10' });
      if (request !== sequence.current) return;
      setChildren(previous => mergeById(previous, result.items || []));
      setPage(result.page);
      setTotal(result.total);
      onLoadReactions(result.items || []);
    } catch (failure) {
      if (request === sequence.current) setError(failure instanceof Error ? failure.message : '回复加载失败，请重试');
    } finally {
      if (request === sequence.current) { busy.current = false; setLoading(false); }
    }
  }
  return (
    <div data-comment-id={comment.id} className={depth > 0 ? 'ml-6 pl-4' : ''} style={depth > 0 ? { borderLeft: '1px solid var(--border-color)' } : undefined}>
      <div className={styles.comment}>
        <div className={styles.commentMeta}>
          <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{comment.nickname}</span>
          <span className="text-xs" style={{ color: 'var(--text-info)' }}>{new Date(comment.created_at).toLocaleString('zh-CN')}</span>
          <button onClick={() => onReply(comment)}
            className={`${editorial.action} ml-auto`}
            style={{ color: 'var(--primary)' }}>回复</button>
        </div>
        <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--text-secondary)' }}>{comment.content}</p>
        <div className={`${styles.reactions} mt-3`}><ReactionBar compact label={`${comment.nickname} 的评论表情`}
          counts={reactions[comment.id]?.counts || {}} selected={reactions[comment.id]?.user || []}
          onToggle={emoji => onReaction(comment.id, emoji)} /></div>
      </div>
      {children.map((child: any) => (
        <div key={child.id} className="mt-2">
          <CommentItem comment={child} depth={depth + 1} onReply={onReply} reactions={reactions} onReaction={onReaction}
            slug={slug} sort={sort} onLoadReactions={onLoadReactions} />
        </div>
      ))}
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}
      {(page * 10 < total || error) && <button onClick={loadReplies} disabled={loading}
        className={`${editorial.action} mt-2 disabled:opacity-50`} style={{ color: 'var(--primary)' }}>
        {loading ? '加载中...' : error ? '重试' : '加载更多回复'}
      </button>}
    </div>
  );
}

export default function PostClient({ slug, initialData, initialError = '', initialRetry = false }: {
  slug: string;
  initialData: PostResponse | null;
  initialError?: string;
  initialRetry?: boolean;
}) {
  const router = useRouter();
  const [post, setPost] = useState<any>(initialData?.post || null);
  const [loading, setLoading] = useState(initialRetry);
  const [loadError, setLoadError] = useState(initialError);
  const [shareUrl, setShareUrl] = useState(`/posts/${encodeURIComponent(slug)}`);
  useEffect(() => { setShareUrl(window.location.href); }, [slug]);
  const [commentForm, setCommentForm] = useState({ nickname: '', email: '', website: '', content: '', parent_id: '', hp_field: '' });
  const [commentError, setCommentError] = useState('');
  const [commentSuccess, setCommentSuccess] = useState('');
  const [replyTo, setReplyTo] = useState<any>(null);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [relatedPosts, setRelatedPosts] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reactions, setReactions] = useState<Record<string, {counts: Record<string, number>, user: string[]}>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [adjacentPosts, setAdjacentPosts] = useState<{ prev: any; next: any } | null>(null);
  const [seriesProgress, setSeriesProgress] = useState<{ position: number; total: number } | null>(null);
  const [postReactionState, setPostReactionState] = useState<ReactionState>({ counts: initialData?.reactions || {}, user: initialData?.user_emojis || [] });
  const completedPostReactions = useRef(new Map<string, boolean>());
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordVerifying, setPasswordVerifying] = useState(false);
  const [commentSort, setCommentSort] = useState('oldest');
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSitekey, setTurnstileSitekey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [commentsEnabled, setCommentsEnabled] = useState<boolean | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const canRead = Boolean(post && !post.password_protected);
  const fetchComments = useCallback((params: Record<string, string>) => canRead
    ? api.getComments(slug, commentSort, params)
    : Promise.resolve({ items: [], total: 0, page: 1, size: 20 }), [slug, commentSort, canRead]);
  const commentPages = usePagedItems<any>(fetchComments, 20, mergeById);
  const comments = commentPages.items;
  const addCommentReactions = useCallback((items: any[]) => {
    setReactions(previous => ({ ...collectReactions(items), ...previous }));
  }, []);
  useEffect(() => { addCommentReactions(comments); }, [comments, addCommentReactions]);

  const retryArticle = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await api.getPost(slug);
      setPost(result.post);
      let state: ReactionState = { counts: result.reactions || {}, user: result.user_emojis || [] };
      for (const [emoji, active] of completedPostReactions.current) state = applyReaction(state, emoji, active);
      setPostReactionState(state);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '文章暂时无法加载，请重试');
    } finally { setLoading(false); }
  }, [slug]);

  const browserFallbackStarted = useRef(false);
  useEffect(() => {
    if (!initialRetry || browserFallbackStarted.current) return;
    browserFallbackStarted.current = true;
    void retryArticle();
  }, [initialRetry, retryArticle]);

  const viewRecorded = useRef(false);
  useEffect(() => {
    if (!initialData?.post || initialData.post.password_protected || viewRecorded.current) return;
    viewRecorded.current = true;
    api.recordPostView(slug).then(result => {
      let state: ReactionState = { counts: result.reactions || {}, user: result.user_emojis || [] };
      for (const [emoji, active] of completedPostReactions.current) state = applyReaction(state, emoji, active);
      setPostReactionState(state);
    }).catch(() => {});
  }, [initialData, slug]);

  const seriesSlug = post?.series?.[0]?.slug;
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    api.getAdjacentPosts(slug).then(result => { if (active) setAdjacentPosts(result); }).catch(() => {});
    api.getRelatedPosts(slug).then(result => { if (active) setRelatedPosts(result.items || []); }).catch(() => {});
    if (seriesSlug) {
      api.getSeriesProgress(seriesSlug, slug).then(result => { if (active) setSeriesProgress(result); }).catch(() => {});
    }
    return () => { active = false; };
  }, [slug, canRead, seriesSlug]);

  // Check if current user is admin
  useEffect(() => {
    api.getMe().then(u => {
      if (u.role === 'admin') setIsAdmin(true);
    }).catch(() => {});
  }, []);

  // Keep existing comments readable while applying the public submission policy.
  useEffect(() => {
    let active = true;
    api.getPublicConfig().then(res => {
      if (!active) return;
      setCommentsEnabled(res.config?.comment_enabled !== 'false');
      if (res.config?.turnstile_enabled === 'true' && res.config?.turnstile_sitekey && (res.config?.turnstile_modules || 'comment,link').split(',').map(s => s.trim()).includes('comment')) {
        setTurnstileEnabled(true);
        setTurnstileSitekey(res.config.turnstile_sitekey);
      }
    }).catch(() => { if (active) setCommentsEnabled(false); });
    return () => { active = false; };
  }, []);

  const [captchaAttempt, setCaptchaAttempt] = useState(0);

  async function handleVerifyPassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordVerifying(true);
    try {
      await api.verifyPostPassword(slug, passwordInput);
      window.location.reload();
    } catch (err: any) {
      setPasswordError(err.message || '密码错误');
    }
    setPasswordVerifying(false);
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (commentsEnabled !== true || post?.allow_comment === false) {
      setCommentError('评论已关闭，已有评论仍可浏览。');
      return;
    }
    setCommentError('');
    setCommentSuccess('');
    try {
      await api.createComment(slug, { ...commentForm, cf_turnstile_response: turnstileToken });
      setCommentSuccess('评论已提交，等待审核');
      setCommentForm({ nickname: '', email: '', website: '', content: '', parent_id: '', hp_field: '' });
      setReplyTo(null);
      setTurnstileToken('');
      // Reset Turnstile widget
      setCaptchaAttempt(value => value + 1);
      void commentPages.reload();
    } catch (err: any) {
      setCommentError(err.message);
      // Reset Turnstile on error too
      setCaptchaAttempt(value => value + 1);
    }
  }

  async function handleToggleReaction(commentId: string, emoji: string) {
    const result = await api.toggleReaction(slug, commentId, emoji);
    setReactions(previous => ({ ...previous, [commentId]: applyReaction(previous[commentId] || { counts: {}, user: [] }, emoji, result.active) }));
    return result.active;
  }

  async function handleTogglePostReaction(emoji: string) {
    const result = await api.togglePostReaction(slug, emoji);
    completedPostReactions.current.set(emoji, result.active);
    setPostReactionState(previous => applyReaction(previous, emoji, result.active));
    return result.active;
  }

  const articleContent: string = post?.content || '';
  const authorName = getPostAuthorName(post);
  const { wordCount, readTime } = useMemo(() => {
    if (!articleContent) return { wordCount: 0, readTime: 0 };
    const text = articleContent.replace(/[#*`>\[\]()!\-]/g, '');
    const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const words = text.split(/\s+/).filter(Boolean).length;
    const total = cjk + words;
    return { wordCount: total, readTime: Math.max(1, Math.ceil(total / 300)) };
  }, [articleContent]);

  // Lightbox: collect images and attach click handlers
  useEffect(() => {
    if (!contentRef.current) return;
    const imgs = Array.from(contentRef.current.querySelectorAll('img'));
    const allSrcs = imgs.map(img => img.getAttribute('src') || '');

    imgs.forEach((img, i) => {
      img.style.cursor = 'zoom-in';
      img.className = img.className + ' rounded-lg transition-opacity hover:opacity-80';
      const handler = (e: MouseEvent) => {
        // If image is inside a link, let default navigation happen
        if (img.closest('a')) return;
        e.preventDefault();
        const gallery = img.closest('.editor-image-gallery');
        if (gallery) {
          const galleryImgs = Array.from(gallery.querySelectorAll('img'));
          const gallerySrcs = galleryImgs.map(g => g.getAttribute('src') || '');
          const galleryIndex = galleryImgs.indexOf(img);
          setLightboxImages(gallerySrcs);
          setLightboxIndex(galleryIndex);
        } else {
          setLightboxImages(allSrcs);
          setLightboxIndex(i);
        }
      };
      img.addEventListener('click', handler);
      (img as any)._lbHandler = handler;
    });

    return () => {
      imgs.forEach(img => {
        const h = (img as any)._lbHandler;
        if (h) img.removeEventListener('click', h);
      });
    };
  }, [post?.content]);

  if (loading) {
    return <Loading />;
  }

  if (loadError) {
    return <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p role="alert" style={{ color: 'var(--color-error)' }}>{loadError}</p>
      <button onClick={retryArticle} className={`${editorial.action} mt-4`} style={{ color: 'var(--primary)' }}>重试</button>
    </div>;
  }

  if (!post) {
    return (
      <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
        <p className="text-lg mb-2">文章不存在</p>
        <Link href="/" className="hover:underline text-sm" style={{ color: 'var(--primary)' }}>返回首页</Link>
      </div>
    );
  }

  // Password protection gate
  if ((post as any).password_protected) {
    return (
      <div className={`${editorial.page} max-w-md mx-auto px-4 py-28`}>
        <div className={`${editorial.section} text-center`}>
          <Shield className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--primary)' }} />
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{post.title}</h1>
          {(post as any).password_hint && (
            <p className="text-sm mb-4" style={{ color: 'var(--text-info)' }}>{(post as any).password_hint}</p>
          )}
          <form onSubmit={handleVerifyPassword} className="space-y-3">
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              placeholder="请输入文章密码"
              className={`${editorial.field} w-full`}
              aria-label="文章密码"
              autoFocus
            />
            {passwordError && (
              <p className="text-sm" style={{ color: 'var(--color-error)' }}>{passwordError}</p>
            )}
            <button type="submit" disabled={passwordVerifying}
              className={styles.submit}>
              {passwordVerifying ? '验证中...' : '验证密码'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
    {post.status === 'published' && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Article', headline: post.title,
      description: post.excerpt || '', image: post.cover_image || undefined,
      datePublished: post.published_at, dateModified: post.updated_at,
      author: { '@type': 'Person', name: authorName },
    }).replace(/</g, '\\u003c') }} />}
    <ReadingProgress />
    {lightboxImages.length > 0 && (
      <ImageLightbox
        images={lightboxImages}
        startIndex={lightboxIndex}
        onClose={() => setLightboxImages([])}
      />
    )}
    <div className={`${editorial.page} ${styles.page} max-w-7xl mx-auto px-5 md:px-6 pt-8 pb-8 lg:pt-10 flex gap-8 justify-center`}>
      <ContentHeadInjection />
      {/* Main content */}
      <div className="w-full max-w-3xl min-w-0">
        <article>
          <button
            type="button"
            onClick={() => window.history.length > 1 ? router.back() : router.push('/')}
            className={`${editorial.action} mb-5`}
            style={{ color: 'var(--text-secondary)' }}
            aria-label="返回上一页"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>

          {/* Cover image */}
          {post.cover_image && (
            <ImageWithFallback src={post.cover_image} alt={post.title} loading="lazy"
              className={styles.cover} />
          )}

          {/* Admin status bar */}
          {isAdmin && (
            <div className={styles.status}>
              <span className="flex items-center gap-1.5 font-medium"
                style={{ color: post.status === 'published' ? 'var(--color-success)' : 'var(--color-error)' }}>
                <Shield className="w-4 h-4" />
                {post.status === 'published' ? '已发布' : '草稿'}
              </span>
              {post.author_name && (
                <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                  <User className="w-3.5 h-3.5" />
                  作者：{post.author_name}
                </span>
              )}
              {post.editor && (
                <span className="flex items-center gap-1" style={{ color: 'var(--text-info)' }}>
                  <Edit3 className="w-3.5 h-3.5" />
                  编辑：{post.editor.display_name || post.editor.username}
                </span>
              )}
              <a href={`/admin/posts`} className="ml-auto text-xs hover:underline" style={{ color: 'var(--primary)' }}>
                管理文章
              </a>
            </div>
          )}

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold mb-4 leading-tight" style={{ color: 'var(--text-primary)' }}>
            {post.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            {post.published_at && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(post.published_at).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}
              </span>
            )}
            {post.updated_at && post.published_at && (
              <span className="text-xs" style={{ color: 'var(--text-info)' }}>
                更新于 {new Date(post.updated_at).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              {post.view_count} 次阅读
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              {readTime} 分钟 · {wordCount} 字
            </span>
          </div>

          {/* Category & Tags */}
          <div className={styles.tags}>
            {post.category && (
              <Link href={`/categories/${post.category.slug}`}
                className={styles.tag} style={{ color: 'var(--primary)' }}>
                {post.category.name}
              </Link>
            )}
            {post.tags?.map((tag: any) => (
              <Link key={tag.id} href={`/tags/${tag.slug}`}
                className={styles.tag}
                style={{ color: 'var(--text-secondary)' }}>
                #{tag.name}
              </Link>
            ))}
          </div>

          {/* Series badge with progress */}
          {post.series?.length > 0 && (
            <Link href={`/series/${post.series[0].slug}`}
              className="flex items-center gap-1.5 text-sm mb-6"
              style={{ color: 'var(--primary)' }}>
              <Bookmark className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{post.series[0].name}</span>
              {seriesProgress && (
                <span className="text-xs" style={{ color: 'var(--text-info)' }}>
                  第 {seriesProgress.position} 篇 / 共 {seriesProgress.total} 篇
                </span>
              )}
            </Link>
          )}

          {/* Markdown Content */}
          <div ref={contentRef} className="prose dark:prose-invert prose-sm sm:prose-base max-w-none mb-10 [&_:is(h1,h2,h3,h4,h5,h6)]:scroll-mt-28 [&_:is(h1,h2,h3,h4,h5,h6)]:[overflow-wrap:anywhere]">
            <ArticleMarkdown content={post.content} />
          </div>
          <ArticleSignature authorName={authorName} />

          {/* Share buttons */}
          <ScrollReveal margin="-40px">
          <div className="mb-6">
            <div className="mb-5 flex items-center gap-3" aria-hidden="true" data-article-divider>
              <span className="h-px flex-1" style={{ background: 'var(--border-color)' }} />
              <span className="size-[5px] shrink-0 rotate-45 opacity-45" style={{ background: 'var(--text-info)' }} />
              <span className="h-px flex-1" style={{ background: 'var(--border-color)' }} />
            </div>
            <SharePanel url={shareUrl} title={post.title} />
          </div>
          </ScrollReveal>

          {/* Post reactions */}
          <ScrollReveal margin="-40px">
          <div className={`${editorial.section} ${styles.reactions} mb-2`}>
            <ReactionBar counts={postReactionState.counts} selected={postReactionState.user} onToggle={handleTogglePostReaction} />
          </div>
          </ScrollReveal>

          {/* Attribution */}
          <ScrollReveal margin="-40px">
          <aside aria-label="文章版权信息" className="relative mb-6 overflow-hidden rounded-xl px-8 py-6 transition"
            style={{ background: 'var(--card-bg)', overflowWrap: 'anywhere' }}>
            <div className="font-bold transition" style={{ color: 'var(--text-primary)' }}>{post.title}</div>
            <Link href={`/posts/${post.slug}`} className="transition" style={{ color: 'var(--primary)' }}>
              {shareUrl}
            </Link>
            <div className="mt-2 flex flex-wrap gap-6">
              <div>
                <div className="text-sm transition" style={{ color: 'var(--text-info)' }}>作者</div>
                <div className="line-clamp-2 transition" style={{ color: 'var(--text-primary)' }}>{authorName}</div>
              </div>
              <div>
                <div className="text-sm transition" style={{ color: 'var(--text-info)' }}>发表于</div>
                <div className="line-clamp-2 transition" style={{ color: 'var(--text-primary)' }}>
                  {post.published_at ? new Date(post.published_at).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '-'}
                </div>
              </div>
              <div>
                <div className="text-sm transition" style={{ color: 'var(--text-info)' }}>License</div>
                <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer"
                  className="line-clamp-2 transition hover:underline" style={{ color: 'var(--primary)' }}>
                  CC BY-NC-SA 4.0
                </a>
              </div>
            </div>
            {/* CC watermark */}
            <div aria-hidden="true" className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 select-none opacity-[0.06]">
              <svg xmlns="http://www.w3.org/2000/svg" width="15rem" height="15rem" viewBox="0 0 20 20">
                <path d="M0 0h20v20H0z" fill="none" />
                <path fill="currentColor" d="M10 18a8 8 0 1 1 8-8a8 8 0 0 1-8 8m0-18A9.94 9.94 0 0 0 0 10a9.94 9.94 0 0 0 10 10a9.94 9.94 0 0 0 10-10A9.94 9.94 0 0 0 10 0" />
                <path fill="currentColor" d="M13.49 11.67c-1 0-1.43-.57-1.43-1.71s.43-1.71 1.43-1.71c.57 0 .86.29 1.14.86l1.29-.71A2.8 2.8 0 0 0 13.2 7a2.9 2.9 0 0 0-2.14.86A2.7 2.7 0 0 0 10.2 10a3 3 0 0 0 .86 2.29a2.9 2.9 0 0 0 2.14.86a3.24 3.24 0 0 0 2.71-1.57L14.63 11a1.46 1.46 0 0 1-1.14.71zm-6 0c-1 0-1.43-.57-1.43-1.71s.43-1.71 1.43-1.71c.57 0 .86.29 1.14.86l1.29-.71A2.8 2.8 0 0 0 7.2 7a2.9 2.9 0 0 0-2.14.86A2.7 2.7 0 0 0 4.2 10a3 3 0 0 0 .86 2.29a2.9 2.9 0 0 0 2.14.86a3.24 3.24 0 0 0 2.71-1.57L8.63 11a1.46 1.46 0 0 1-1.14.71z" />
              </svg>
            </div>
          </aside>
          </ScrollReveal>
        </article>

        {/* Adjacent Posts Navigation */}
        <ScrollReveal margin="-40px">
        {(adjacentPosts?.prev || adjacentPosts?.next) && (
          <nav className={styles.adjacent} aria-label="前后文章">
            <div className="flex-1">
              {adjacentPosts?.prev ? (
                <Link href={`/posts/${adjacentPosts.prev.slug}`}
                  className="transition-colors">
                  <div className="text-xs mb-1" style={{ color: 'var(--text-info)' }}>← 上一篇</div>
                  <div className="text-sm font-medium line-clamp-1" style={{ color: 'var(--text-primary)' }}>
                    {adjacentPosts.prev.title}
                  </div>
                </Link>
              ) : <div />}
            </div>
            <div className="flex-1 text-right">
              {adjacentPosts?.next ? (
                <Link href={`/posts/${adjacentPosts.next.slug}`}
                  className="transition-colors">
                  <div className="text-xs mb-1" style={{ color: 'var(--text-info)' }}>下一篇 →</div>
                  <div className="text-sm font-medium line-clamp-1" style={{ color: 'var(--text-primary)' }}>
                    {adjacentPosts.next.title}
                  </div>
                </Link>
              ) : <div />}
            </div>
          </nav>
        )}
        </ScrollReveal>

        {/* Related Posts (tag-based) */}
        <ScrollReveal margin="-40px">
        {relatedPosts.length > 0 && (
          <div className={styles.related}>
            <h2 className={styles.relatedHeading}>猜你喜欢</h2>
            <div className={styles.relatedList}>
              {relatedPosts.slice(0, 6).map((rp: any) => (
                <Link
                  key={rp.id}
                  href={`/posts/${rp.slug}`}
                  className={styles.relatedPost}
                >
                  {rp.cover_image && (
                    <ImageWithFallback src={rp.cover_thumbnail_url || rp.cover_image} fallbackSrc={rp.cover_image} alt={rp.title} loading="lazy" decoding="async" className="w-full h-32 object-cover" />
                  )}
                  <div className={styles.relatedText}>
                    <h3 className="line-clamp-2">
                      {rp.title}
                    </h3>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {rp.tags?.slice(0, 3).map((tag: any) => (
                        <span key={tag.id} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          #{tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
        </ScrollReveal>

        {/* Comments */}
        <ScrollReveal margin="-40px">
        <section className={styles.comments}>
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            评论
            {commentPages.total > 0 && <span className="font-normal" style={{ color: 'var(--text-info)' }}> ({commentPages.total})</span>}
          </h2>

          {/* Sort buttons */}
          <div className={styles.sort}>
            {[{ key: 'oldest', label: '最早' }, { key: 'newest', label: '最新' }, { key: 'reactions', label: '最多点赞' }].map(opt => (
              <button key={opt.key} onClick={() => setCommentSort(opt.key)}
                aria-pressed={commentSort === opt.key}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Comment list */}
          <div className="mb-8">
            {comments.map((comment: any) => (
              <CommentItem key={`${commentSort}-${comment.id}`} slug={slug} sort={commentSort} onLoadReactions={addCommentReactions} comment={comment} depth={0} onReply={(c: any) => {
                setReplyTo(c);
                setCommentForm(prev => ({ ...prev, parent_id: c.id }));
              }} reactions={reactions} onReaction={handleToggleReaction} />
            ))}
            {comments.length === 0 && !commentPages.loading && !commentPages.error && (
              <p className="text-sm" style={{ color: 'var(--text-info)' }}>暂无评论</p>
            )}
          </div>

          <LoadMore {...commentPages} />

          {/* Comment form */}
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>发表评论</h3>
          {commentError && (
            <div className={styles.notice} style={{ color: 'var(--color-error)' }}>
              {commentError}
            </div>
          )}
          {commentSuccess && (
            <div className={styles.notice} style={{ color: 'var(--color-success)' }}>
              {commentSuccess}
            </div>
          )}
          {(commentsEnabled !== true || post.allow_comment === false) && (
            <p role="status" className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              {commentsEnabled === null ? '正在加载评论设置…' : '评论已关闭，已有评论仍可浏览。'}
            </p>
          )}
          <form onSubmit={handleComment} className="space-y-3 max-w-lg">
            <fieldset disabled={commentsEnabled !== true || post.allow_comment === false} className="min-w-0 space-y-3 disabled:opacity-60">
            {/* Honeypot - hidden from humans */}
            <input type="text" name="website_confirm" value={commentForm.hp_field}
              onChange={e => setCommentForm(prev => ({ ...prev, hp_field: e.target.value }))}
              tabIndex={-1} autoComplete="off"
              className="absolute opacity-0 pointer-events-none" style={{ height: 0, width: 0, padding: 0, margin: 0 }} />
            {replyTo && (
              <div className={`${styles.notice} flex items-center gap-2`}
                style={{ color: 'var(--text-secondary)' }}>
                回复 <span className="font-medium" style={{ color: 'var(--primary)' }}>{replyTo.nickname}</span>
                <button type="button" onClick={() => { setReplyTo(null); setCommentForm(prev => ({ ...prev, parent_id: '' })); }}
                  className="ml-auto text-xs hover:opacity-80" style={{ color: 'var(--text-info)' }}>取消</button>
              </div>
            )}
            <div className="flex gap-3">
              <input type="text" value={commentForm.nickname} onChange={e => setCommentForm({ ...commentForm, nickname: e.target.value })}
                placeholder="昵称 *" required
                className={`${editorial.field} flex-1`} aria-label="昵称"
                style={{ color: 'var(--text-primary)' }} />
              <input type="email" value={commentForm.email} onChange={e => setCommentForm({ ...commentForm, email: e.target.value })}
                placeholder="邮箱（不公开）"
                className={`${editorial.field} flex-1`} aria-label="邮箱（不公开）"
                style={{ color: 'var(--text-primary)' }} />
            </div>
            <input type="url" value={commentForm.website} onChange={e => setCommentForm({ ...commentForm, website: e.target.value })}
              placeholder="网站 (可选)"
              className={`${editorial.field} w-full`} aria-label="网站（可选）"
              style={{ color: 'var(--text-primary)' }} />
            <textarea value={commentForm.content} onChange={e => setCommentForm({ ...commentForm, content: e.target.value })}
              placeholder="评论内容 *" required rows={4}
              className={`${editorial.field} w-full resize-none`} aria-label="评论内容"
              style={{ color: 'var(--text-primary)' }} />
            {/* Comment preview toggle */}
            {commentForm.content && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className={`${editorial.action} mb-2`}
                  style={{ color: showPreview ? 'var(--primary)' : 'var(--text-secondary)' }}
                >
                  {showPreview ? '关闭预览' : '预览评论'}
                </button>
                {showPreview && (
                  <div className={`${styles.preview} prose dark:prose-invert prose-sm max-w-none`}>
                    <CommentMarkdown content={commentForm.content} />
                  </div>
                )}
              </div>
            )}
            {turnstileEnabled && (
              <Turnstile key={captchaAttempt} sitekey={turnstileSitekey} action="turnstile-spin-v2" onToken={setTurnstileToken} />
            )}
            <button type="submit"
              disabled={commentsEnabled !== true || post.allow_comment === false}
              className={styles.submit}>
              提交评论
            </button>
            </fieldset>
          </form>
        </section>
        </ScrollReveal>

        <div className="flex justify-center pt-8 pb-2">
          <button
            type="button"
            onClick={() => window.history.length > 1 ? router.back() : router.push('/')}
            className={editorial.action}
            style={{ color: 'var(--text-secondary)' }}
            aria-label="返回上一页"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
        </div>
      </div>

      <ArticleToc contentRef={contentRef} contentKey={articleContent} />
    </div>
    </>
  );
}
