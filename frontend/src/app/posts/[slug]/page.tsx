'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';

import 'katex/dist/katex.min.css';
import { api } from '@/lib/api';
import { Calendar, Eye, Copy, Check, BookOpen, Shield, User, Edit3, Bookmark } from 'lucide-react';
import { ContentHeadInjection } from '@/components/HtmlInjection';
import { ReadingProgress } from '@/components/ReadingProgress';
import { ImageLightbox } from '@/components/ImageLightbox';
import { Loading } from '@/components/Loading';
import { MermaidDiagram } from '@/components/MermaidDiagram';
import { ArticleAudioPlayer } from '@/components/ArticleAudioPlayer';
import { EmojiPickerButton } from '@/components/EmojiPicker';
import { ScrollReveal } from '@/components/ScrollReveal';

interface TocItem {
  id: string;
  text: string;
  level: number;
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
    <div className="flex items-center gap-2">
      <span className="text-sm" style={{ color: 'var(--text-info)' }}>分享到：</span>
      {shareButtons.map((btn) => (
        <button
          key={btn.name}
          onClick={() => handleShare(btn)}
          aria-label={`分享到${btn.name}`}
          className="w-8 h-8 flex items-center justify-center rounded-xl btn-glass transition-all hover:scale-110"
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
function CommentItem({ comment, depth, onReply, reactions, onReaction }: {
  comment: any;
  depth: number;
  onReply: (c: any) => void;
  reactions: Record<string, {counts: Record<string, number>, user: string[]}>;
  onReaction: (commentId: string, emoji: string) => void;
}) {
  return (
    <div className={depth > 0 ? 'ml-6 pl-4' : ''} style={depth > 0 ? { borderLeft: '2px solid var(--glass-border)' } : undefined}>
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{comment.nickname}</span>
          <span className="text-xs" style={{ color: 'var(--text-info)' }}>{new Date(comment.created_at).toLocaleString('zh-CN')}</span>
          <button onClick={() => onReply(comment)}
            className="ml-auto text-xs px-2 py-0.5 rounded btn-glass"
            style={{ color: 'var(--primary)' }}>回复</button>
        </div>
        <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--text-secondary)' }}>{comment.content}</p>
        {/* Reaction buttons */}
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {reactions?.[comment.id] && Object.entries(reactions[comment.id].counts).map(([emoji, count]) => {
            const isActive = reactions[comment.id].user?.includes(emoji);
            return (
              <button
                key={emoji}
                onClick={() => onReaction(comment.id, emoji)}
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-sm transition-all ${
                  isActive ? 'bg-opacity-20' : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  background: isActive ? 'var(--primary-sub)' : 'var(--btn-card-bg)',
                  color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                }}
              >
                <span>{emoji}</span>
                {count > 0 && <span className="text-xs font-medium">{count}</span>}
              </button>
            );
          })}
          <EmojiPickerButton onSelect={(emoji) => onReaction(comment.id, emoji)} />
        </div>
      </div>
      {comment.children?.map((child: any) => (
        <div key={child.id} className="mt-2">
          <CommentItem comment={child} depth={depth + 1} onReply={onReply} reactions={reactions} onReaction={onReaction} />
        </div>
      ))}
    </div>
  );
}

/* ── Code Block Renderer ── */

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);

  const handleCopy = useCallback(() => {
    const code = codeRef.current?.querySelector('code')?.textContent || '';
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, []);

  const lang = className?.replace('language-', '') || '';

  return (
    <div className="relative group my-4 rounded-lg overflow-hidden" style={{ background: 'var(--code-bg, #1e1e2e)' }}>
      <div className="flex items-center justify-between px-4 py-1.5 text-xs" style={{ background: 'var(--code-header, #2d2d3d)', color: 'var(--text-secondary)' }}>
        <span>{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded transition-opacity hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre ref={codeRef} className={className} style={{ margin: 0, padding: '1rem' }}>{children}</pre>
    </div>
  );
}

export default function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string>('');
  const [commentForm, setCommentForm] = useState({ nickname: '', email: '', website: '', content: '', parent_id: '', hp_field: '' });
  const [commentError, setCommentError] = useState('');
  const [commentSuccess, setCommentSuccess] = useState('');
  const [replyTo, setReplyTo] = useState<any>(null);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [relatedPosts, setRelatedPosts] = useState<any[]>([]);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reactions, setReactions] = useState<Record<string, {counts: Record<string, number>, user: string[]}>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [adjacentPosts, setAdjacentPosts] = useState<{ prev: any; next: any } | null>(null);
  const [seriesProgress, setSeriesProgress] = useState<{ position: number; total: number } | null>(null);
  const [postReactions, setPostReactions] = useState<Record<string, number>>({});
  const [postUserEmojis, setPostUserEmojis] = useState<string[]>([]);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordVerifying, setPasswordVerifying] = useState(false);
  const [commentSort, setCommentSort] = useState('oldest');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.getPost(slug);
        setPost(res.post);
        if (res.reactions) setPostReactions(res.reactions);
        if (res.user_emojis) setPostUserEmojis(res.user_emojis);
        loadComments(slug, 'oldest');
        // Load adjacent and related posts in parallel
        api.getAdjacentPosts(slug).then(adj => {
          setAdjacentPosts(adj);
        }).catch(() => {});
        api.getRelatedPosts(slug).then(rel => {
          setRelatedPosts(rel.items || []);
        }).catch(() => {});
        // Load series progress
        if (res.post?.series?.length > 0) {
          api.getSeriesBySlug(res.post.series[0].slug).then(seriesRes => {
            if (seriesRes?.series?.posts) {
              const idx = seriesRes.series.posts.findIndex((p: any) => p.slug === slug);
              if (idx !== -1) {
                setSeriesProgress({ position: idx + 1, total: seriesRes.series.posts.length });
              }
            }
          }).catch(() => {});
        }
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    load();
  }, [slug]);

  // Check if current user is admin
  useEffect(() => {
    api.getMe().then(u => {
      if (u.role === 'admin') setIsAdmin(true);
    }).catch(() => {});
  }, []);

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

  async function loadComments(postId: string, sort?: string) {
    try {
      const res = await api.getComments(postId, sort || commentSort);
      setComments(res.items);
      // Initialize reactions state
      const reactionsMap: Record<string, {counts: Record<string, number>, user: string[]}> = {};
      function extractReactions(items: any[]) {
        for (const c of items) {
          reactionsMap[c.id] = { counts: c.reactions || {}, user: c.user_emojis || [] };
          if (c.children) extractReactions(c.children);
        }
      }
      extractReactions(res.items);
      setReactions(reactionsMap);
    } catch (e) { /* comments may be disabled */ }
  }

  // Re-fetch comments on sort change
  useEffect(() => {
    if (post) loadComments(slug, commentSort);
  }, [commentSort]);

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    setCommentError('');
    setCommentSuccess('');
    try {
      await api.createComment(slug, commentForm);
      setCommentSuccess('评论已提交，等待审核');
      setCommentForm({ nickname: '', email: '', website: '', content: '', parent_id: '', hp_field: '' });
      setReplyTo(null);
      loadComments(slug);
    } catch (err: any) {
      setCommentError(err.message);
    }
  }

  async function handleToggleReaction(commentId: string, emoji: string) {
    try {
      const res = await api.toggleReaction(slug, commentId, emoji);
      setReactions(prev => {
        const next = { ...prev };
        const current = next[commentId] || { counts: {}, user: [] };
        const newCounts = { ...current.counts };
        const newUser = [...current.user];

        if (res.active) {
          // Add reaction
          newCounts[emoji] = (newCounts[emoji] || 0) + 1;
          if (!newUser.includes(emoji)) newUser.push(emoji);
        } else {
          // Remove reaction
          newCounts[emoji] = Math.max(0, (newCounts[emoji] || 0) - 1);
          const idx = newUser.indexOf(emoji);
          if (idx >= 0) newUser.splice(idx, 1);
          if (newCounts[emoji] === 0) delete newCounts[emoji];
        }

        next[commentId] = { counts: newCounts, user: newUser };
        return next;
      });
    } catch (e) {
      // Ignore reaction errors
    }
  }

  async function handleTogglePostReaction(emoji: string) {
    try {
      const res = await api.togglePostReaction(slug, emoji);
      setPostReactions(prev => {
        const next = { ...prev };
        if (res.active) {
          next[emoji] = (next[emoji] || 0) + 1;
        } else {
          next[emoji] = Math.max(0, (next[emoji] || 0) - 1);
          if (next[emoji] === 0) delete next[emoji];
        }
        return next;
      });
      setPostUserEmojis(prev => {
        if (res.active) {
          return prev.includes(emoji) ? prev : [...prev, emoji];
        } else {
          return prev.filter(e => e !== emoji);
        }
      });
    } catch (e) {
      // Ignore reaction errors
    }
  }

  // Extract TOC from rendered DOM (rehype-slug adds IDs to headings)
  useEffect(() => {
    if (!contentRef.current) return;
    const headings = contentRef.current.querySelectorAll('h1, h2, h3');
    const items: TocItem[] = Array.from(headings)
      .filter((h) => !h.closest('[data-footnotes]'))
      .map((h) => ({
        id: h.id,
        text: h.textContent || '',
        level: parseInt(h.tagName.charAt(1)),
      }));
    setTocItems(items);
  }, [post?.content]);

  const { wordCount, readTime } = useMemo(() => {
    if (!post?.content) return { wordCount: 0, readTime: 0 };
    const text = post.content.replace(/[#*`>\[\]()!\-]/g, '');
    const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const words = text.split(/\s+/).filter(Boolean).length;
    const total = cjk + words;
    return { wordCount: total, readTime: Math.max(1, Math.ceil(total / 300)) };
  }, [post?.content]);

  // IntersectionObserver for TOC active state
  useEffect(() => {
    if (!tocItems.length || !contentRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px' }
    );

    const headings = contentRef.current.querySelectorAll('h1, h2, h3');
    headings.forEach((h) => observer.observe(h));

    return () => observer.disconnect();
  }, [tocItems]);

  // SEO: inject OG and JSON-LD
  useEffect(() => {
    if (!post) return;
    const meta = [
      { property: 'og:title', content: post.title },
      { property: 'og:description', content: post.excerpt || '' },
      { property: 'og:type', content: 'article' },
      { property: 'og:url', content: window.location.href },
    ];
    if (post.cover_image) meta.push({ property: 'og:image', content: post.cover_image });

    const tags = meta.map(m => {
      const el = document.createElement('meta');
      el.setAttribute('property', m.property);
      el.setAttribute('content', m.content);
      el.setAttribute('data-seo', 'og');
      return el;
    });

    // JSON-LD
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.excerpt || '',
      image: post.cover_image || '',
      datePublished: post.published_at,
      dateModified: post.updated_at,
      author: { '@type': 'Person', name: 'Tano' },
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(jsonLd);
    script.setAttribute('data-seo', 'jsonld');

    tags.forEach(el => document.head.appendChild(el));
    document.head.appendChild(script);

    return () => {
      tags.forEach(el => el.remove());
      script.remove();
    };
  }, [post]);

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

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  // Stable markdown component mappings — defined before early returns to obey Hook order
  const markdownComponents = useMemo(() => ({
    code: ({ className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      if (match?.[1] === 'mermaid') {
        return <MermaidDiagram code={String(children).replace(/\n$/, '')} />;
      }
      return <code className={className} {...props}>{children}</code>;
    },
    pre: CodeBlock,
    audio: ({ src }: any) => <ArticleAudioPlayer src={src || ''} />,
  }), []);

  if (loading) {
    return <Loading />;
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
      <div className="max-w-md mx-auto px-4 py-20">
        <div className="glass-card rounded-2xl p-8 text-center">
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
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }}
              autoFocus
            />
            {passwordError && (
              <p className="text-sm" style={{ color: 'var(--color-error)' }}>{passwordError}</p>
            )}
            <button type="submit" disabled={passwordVerifying}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50"
              style={{ background: 'var(--primary)' }}>
              {passwordVerifying ? '验证中...' : '验证密码'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
    <ReadingProgress />
    {lightboxImages.length > 0 && (
      <ImageLightbox
        images={lightboxImages}
        startIndex={lightboxIndex}
        onClose={() => setLightboxImages([])}
      />
    )}
    <div className="max-w-7xl mx-auto px-4 py-8 flex gap-8 justify-center">
      <ContentHeadInjection />
      {/* Main content */}
      <div className="w-full max-w-3xl min-w-0">
        <article>
          {/* Cover image */}
          <ScrollReveal margin="-40px">
          {post.cover_image && (
            <img src={post.cover_image} alt={post.title} loading="lazy"
              className="w-full h-56 md:h-72 object-cover rounded-xl mb-6" />
          )}
          </ScrollReveal>

          {/* Admin status bar */}
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl mb-4 text-sm glass-card"
              style={{ borderLeft: '3px solid var(--primary)' }}>
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
                {new Date(post.published_at).toLocaleDateString('zh-CN')}
              </span>
            )}
            {post.updated_at && post.published_at && (
              <span className="text-xs" style={{ color: 'var(--text-info)' }}>
                更新于 {new Date(post.updated_at).toLocaleDateString('zh-CN')}
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
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {post.category && (
              <Link href={`/categories/${post.category.slug}`}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>
                {post.category.name}
              </Link>
            )}
            {post.tags?.map((tag: any) => (
              <Link key={tag.id} href={`/tags/${tag.slug}`}
                className="px-3 py-1 rounded-lg text-xs btn-glass transition-all"
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
                <span className="text-xs px-1.5 py-0.5 rounded-md"
                  style={{ color: 'var(--text-info)', background: 'var(--btn-card-bg)' }}>
                  第 {seriesProgress.position} 篇 / 共 {seriesProgress.total} 篇
                </span>
              )}
            </Link>
          )}

          {/* Markdown Content */}
          <ScrollReveal margin="-60px">
          <div ref={contentRef} className="prose dark:prose-invert prose-sm sm:prose-base max-w-none mb-10">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeHighlight, rehypeSlug, rehypeKatex, rehypeRaw]}
              components={markdownComponents}
            >
              {post.content}
            </ReactMarkdown>
          </div>
          </ScrollReveal>

          {/* Share buttons */}
          <ScrollReveal margin="-40px">
          <div className="border-t pt-6 mb-6" style={{ borderColor: 'var(--glass-border)' }}>
            <SharePanel url={shareUrl} title={post.title} />
          </div>
          </ScrollReveal>

          {/* Post reactions */}
          <ScrollReveal margin="-40px">
          <div className="border-t pt-6 mb-6" style={{ borderColor: 'var(--glass-border)' }}>
            <div className="flex items-center gap-2 flex-wrap">
              {Object.entries(postReactions).map(([emoji, count]) => (
                <button key={emoji} onClick={() => handleTogglePostReaction(emoji)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm transition-all"
                  style={{
                    background: postUserEmojis.includes(emoji) ? 'var(--primary-sub)' : 'var(--btn-card-bg)',
                    color: postUserEmojis.includes(emoji) ? 'var(--primary)' : 'var(--text-secondary)',
                  }}>
                  <span className="text-base leading-none">{emoji}</span>
                  <span>{count}</span>
                </button>
              ))}
              <EmojiPickerButton onSelect={handleTogglePostReaction} />
            </div>
          </div>
          </ScrollReveal>

          {/* CC License — Fuwari style */}
          <ScrollReveal margin="-40px">
          <div className="relative mb-6 overflow-hidden rounded-xl px-8 py-6 transition"
            style={{ background: 'var(--card-bg)' }}>
            <div className="font-bold transition" style={{ color: 'var(--text-primary)' }}>{post.title}</div>
            <Link href={`/posts/${post.slug}`} className="transition" style={{ color: 'var(--primary)' }}>
              {typeof window !== 'undefined' ? window.location.href : `/posts/${post.slug}`}
            </Link>
            <div className="mt-2 flex gap-6">
              <div>
                <div className="text-sm transition" style={{ color: 'var(--text-info)' }}>作者</div>
                <div className="line-clamp-2 transition" style={{ color: 'var(--text-primary)' }}>{post.author_name || '-'}</div>
              </div>
              <div>
                <div className="text-sm transition" style={{ color: 'var(--text-info)' }}>发表于</div>
                <div className="line-clamp-2 transition" style={{ color: 'var(--text-primary)' }}>
                  {post.published_at ? new Date(post.published_at).toLocaleDateString('zh-CN') : '-'}
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
            <div className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 select-none opacity-[0.06]">
              <svg xmlns="http://www.w3.org/2000/svg" width="15rem" height="15rem" viewBox="0 0 20 20">
                <path d="M0 0h20v20H0z" fill="none" />
                <path fill="currentColor" d="M10 18a8 8 0 1 1 8-8a8 8 0 0 1-8 8m0-18A9.94 9.94 0 0 0 0 10a9.94 9.94 0 0 0 10 10a9.94 9.94 0 0 0 10-10A9.94 9.94 0 0 0 10 0" />
                <path fill="currentColor" d="M13.49 11.67c-1 0-1.43-.57-1.43-1.71s.43-1.71 1.43-1.71c.57 0 .86.29 1.14.86l1.29-.71A2.8 2.8 0 0 0 13.2 7a2.9 2.9 0 0 0-2.14.86A2.7 2.7 0 0 0 10.2 10a3 3 0 0 0 .86 2.29a2.9 2.9 0 0 0 2.14.86a3.24 3.24 0 0 0 2.71-1.57L14.63 11a1.46 1.46 0 0 1-1.14.71zm-6 0c-1 0-1.43-.57-1.43-1.71s.43-1.71 1.43-1.71c.57 0 .86.29 1.14.86l1.29-.71A2.8 2.8 0 0 0 7.2 7a2.9 2.9 0 0 0-2.14.86A2.7 2.7 0 0 0 4.2 10a3 3 0 0 0 .86 2.29a2.9 2.9 0 0 0 2.14.86a3.24 3.24 0 0 0 2.71-1.57L8.63 11a1.46 1.46 0 0 1-1.14.71z" />
              </svg>
            </div>
          </div>
          </ScrollReveal>
        </article>

        {/* Adjacent Posts Navigation */}
        <ScrollReveal margin="-40px">
        {(adjacentPosts?.prev || adjacentPosts?.next) && (
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex-1">
              {adjacentPosts?.prev ? (
                <Link href={`/posts/${adjacentPosts.prev.slug}`}
                  className="block glass-card rounded-2xl p-4 transition-all hover:translate-y-[-2px]">
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
                  className="block glass-card rounded-2xl p-4 transition-all hover:translate-y-[-2px]">
                  <div className="text-xs mb-1" style={{ color: 'var(--text-info)' }}>下一篇 →</div>
                  <div className="text-sm font-medium line-clamp-1" style={{ color: 'var(--text-primary)' }}>
                    {adjacentPosts.next.title}
                  </div>
                </Link>
              ) : <div />}
            </div>
          </div>
        )}
        </ScrollReveal>

        {/* Related Posts (tag-based) */}
        <ScrollReveal margin="-40px">
        {relatedPosts.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>猜你喜欢</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {relatedPosts.slice(0, 6).map((rp: any) => (
                <Link
                  key={rp.id}
                  href={`/posts/${rp.slug}`}
                  className="glass-card rounded-2xl overflow-hidden transition-all hover:translate-y-[-2px]"
                >
                  {rp.cover_image && (
                    <img src={rp.cover_image} alt={rp.title} className="w-full h-32 object-cover" />
                  )}
                  <div className="p-3">
                    <h3 className="text-sm font-bold line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                      {rp.title}
                    </h3>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {rp.tags?.slice(0, 3).map((tag: any) => (
                        <span key={tag.id} className="px-1.5 py-0.5 text-xs rounded"
                          style={{ background: 'var(--btn-card-bg)', color: 'var(--text-secondary)' }}>
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
        <section className="border-t pt-8" style={{ borderColor: 'var(--glass-border)' }}>
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            评论
            {comments.length > 0 && <span className="font-normal" style={{ color: 'var(--text-info)' }}> ({comments.length})</span>}
          </h2>

          {/* Sort buttons */}
          <div className="flex gap-2 mb-4">
            {[{ key: 'oldest', label: '最早' }, { key: 'newest', label: '最新' }, { key: 'reactions', label: '最多点赞' }].map(opt => (
              <button key={opt.key} onClick={() => setCommentSort(opt.key)}
                className="px-2.5 py-1 rounded-lg text-xs transition-all"
                style={{
                  background: commentSort === opt.key ? 'var(--primary)' : 'var(--btn-card-bg)',
                  color: commentSort === opt.key ? '#fff' : 'var(--text-secondary)',
                }}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Comment list */}
          <div className="space-y-3 mb-8">
            {comments.map((comment: any) => (
              <CommentItem key={comment.id} comment={comment} depth={0} onReply={(c: any) => {
                setReplyTo(c);
                setCommentForm(prev => ({ ...prev, parent_id: c.id }));
              }} reactions={reactions} onReaction={handleToggleReaction} />
            ))}
            {comments.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-info)' }}>暂无评论</p>
            )}
          </div>

          {/* Comment form */}
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>发表评论</h3>
          {commentError && (
            <div className="glass-card rounded-2xl px-4 py-3 mb-4 text-sm" style={{ color: 'var(--color-error)' }}>
              {commentError}
            </div>
          )}
          {commentSuccess && (
            <div className="glass-card rounded-2xl px-4 py-3 mb-4 text-sm" style={{ color: 'var(--color-success)' }}>
              {commentSuccess}
            </div>
          )}
          <form onSubmit={handleComment} className="space-y-3 max-w-lg">
            {/* Honeypot - hidden from humans */}
            <input type="text" name="website_confirm" value={commentForm.hp_field}
              onChange={e => setCommentForm(prev => ({ ...prev, hp_field: e.target.value }))}
              tabIndex={-1} autoComplete="off"
              className="absolute opacity-0 pointer-events-none" style={{ height: 0, width: 0, padding: 0, margin: 0 }} />
            {replyTo && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm glass-card"
                style={{ color: 'var(--text-secondary)' }}>
                回复 <span className="font-medium" style={{ color: 'var(--primary)' }}>{replyTo.nickname}</span>
                <button type="button" onClick={() => { setReplyTo(null); setCommentForm(prev => ({ ...prev, parent_id: '' })); }}
                  className="ml-auto text-xs hover:opacity-80" style={{ color: 'var(--text-info)' }}>取消</button>
              </div>
            )}
            <div className="flex gap-3">
              <input type="text" value={commentForm.nickname} onChange={e => setCommentForm({ ...commentForm, nickname: e.target.value })}
                placeholder="昵称 *" required
                className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
              <input type="email" value={commentForm.email} onChange={e => setCommentForm({ ...commentForm, email: e.target.value })}
                placeholder="邮箱（不公开）"
                className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
            </div>
            <input type="url" value={commentForm.website} onChange={e => setCommentForm({ ...commentForm, website: e.target.value })}
              placeholder="网站 (可选)"
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }} />
            <textarea value={commentForm.content} onChange={e => setCommentForm({ ...commentForm, content: e.target.value })}
              placeholder="评论内容 *" required rows={4}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none glass-card resize-none"
              style={{ color: 'var(--text-primary)' }} />
            {/* Comment preview toggle */}
            {commentForm.content && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="text-xs px-3 py-1 rounded-lg btn-glass transition-all mb-2"
                  style={{ color: showPreview ? 'var(--primary)' : 'var(--text-secondary)' }}
                >
                  {showPreview ? '关闭预览' : '预览评论'}
                </button>
                {showPreview && (
                  <div className="prose dark:prose-invert prose-sm max-w-none rounded-xl p-4 overflow-y-auto"
                    style={{ maxHeight: '200px', background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {commentForm.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}
            <button type="submit"
              className="px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
              style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
              提交评论
            </button>
          </form>
        </section>
        </ScrollReveal>
      </div>

      {/* TOC Sidebar */}
      {tocItems.length > 0 && (
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <div className="sticky top-24">
            <h3 className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--text-info)' }}>目录</h3>
            <nav className="space-y-0.5 text-sm max-h-[70vh] overflow-y-auto glass-card rounded-2xl p-3">
              {tocItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className={`toc-link block py-1.5 pr-2 transition-colors ${
                    item.level === 1 ? 'pl-2 text-sm font-medium' : item.level === 3 ? 'pl-6 text-xs' : 'pl-4 text-sm'
                  }`}
                  style={{ color: activeId === item.id ? 'var(--primary)' : 'var(--text-secondary)' }}
                >
                  {item.text}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      )}
    </div>
    </>
  );
}
