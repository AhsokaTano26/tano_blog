'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { api } from '@/lib/api';
import { Calendar, Eye, Copy, Check, BookOpen } from 'lucide-react';
import { FaWeibo, FaQq } from 'react-icons/fa6';
import { ContentHeadInjection } from '@/components/HtmlInjection';
import { ReadingProgress } from '@/components/ReadingProgress';
import { ImageLightbox } from '@/components/ImageLightbox';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function extractToc(content: string): TocItem[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const items: TocItem[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, '-')
      .replace(/(^-|-$)/g, '');
    items.push({ id, text, level });
  }
  return items;
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
      case '微博': return <FaWeibo className="w-4 h-4" />;
      case 'QQ空间': return <FaQq className="w-4 h-4" />;
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
        <span className="text-xs text-green-600 dark:text-green-400">已复制</span>
      )}
    </div>
  );
}

export default function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string>('');
  const [commentForm, setCommentForm] = useState({ nickname: '', email: '', website: '', content: '' });
  const [commentError, setCommentError] = useState('');
  const [commentSuccess, setCommentSuccess] = useState('');
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [relatedPosts, setRelatedPosts] = useState<any[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.getPost(slug);
        setPost(res.post);
        loadComments(slug);
        // Load related posts
        if (res.post?.category?.slug) {
          api.getCategory(res.post.category.slug).then(catRes => {
            const related = (catRes.posts || []).filter((p: any) => p.slug !== slug).slice(0, 3);
            setRelatedPosts(related);
          }).catch(() => {});
        }
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    load();
  }, [slug]);

  async function loadComments(postId: string) {
    try {
      const res = await api.getComments(postId);
      setComments(res.items);
    } catch (e) { /* comments may be disabled */ }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    setCommentError('');
    setCommentSuccess('');
    try {
      await api.createComment(slug, commentForm);
      setCommentSuccess('评论已提交，等待审核');
      setCommentForm({ nickname: '', email: '', website: '', content: '' });
      loadComments(slug);
    } catch (err: any) {
      setCommentError(err.message);
    }
  }

  const tocItems = useMemo(() => post?.content ? extractToc(post.content) : [], [post?.content]);

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

    const headings = contentRef.current.querySelectorAll('h2, h3');
    headings.forEach((h) => observer.observe(h));

    return () => observer.disconnect();
  }, [tocItems, post?.content]);

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
      img.className += ' rounded-lg transition-opacity hover:opacity-80';
      const handler = () => { setLightboxImages(allSrcs); setLightboxIndex(i); };
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

  // Add IDs to heading elements rendered by ReactMarkdown
  const headingRenderer = (level: 2 | 3) => {
    const Tag = level === 2 ? 'h2' : 'h3';
    return ({ children, ...props }: any) => {
      const text = typeof children === 'string' ? children : '';
      const id = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]+/g, '-')
        .replace(/(^-|-$)/g, '');
      return <Tag id={id} {...props as any}>{children}</Tag>;
    };
  };

  if (loading) {
    return (
      <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
        <div className="animate-spin w-8 h-8 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
        加载中...
      </div>
    );
  }

  if (!post) {
    return (
      <div className="text-center py-20 text-gray-500 dark:text-gray-400">
        <p className="text-lg mb-2">文章不存在</p>
        <a href="/" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">返回首页</a>
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
          {post.cover_image && (
            <img src={post.cover_image} alt={post.title} loading="lazy"
              className="w-full h-56 md:h-72 object-cover rounded-xl mb-6" />
          )}

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4 leading-tight">
            {post.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400 mb-4">
            {post.published_at && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(post.published_at).toLocaleDateString('zh-CN')}
              </span>
            )}
            {post.updated_at && post.published_at && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
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
          <div className="flex flex-wrap items-center gap-2 mb-8">
            {post.category && (
              <a href={`/categories/${post.category.slug}`}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>
                {post.category.name}
              </a>
            )}
            {post.tags?.map((tag: any) => (
              <a key={tag.id} href={`/tags/${tag.slug}`}
                className="px-3 py-1 rounded-lg text-xs btn-glass transition-all"
                style={{ color: 'var(--text-secondary)' }}>
                #{tag.name}
              </a>
            ))}
          </div>

          {/* Markdown Content */}
          <div ref={contentRef} className="prose dark:prose-invert prose-sm sm:prose-base max-w-none mb-10">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                h2: headingRenderer(2),
                h3: headingRenderer(3),
              }}
            >
              {post.content}
            </ReactMarkdown>
          </div>

          {/* Share buttons */}
          <div className="border-t pt-6 mb-6" style={{ borderColor: 'var(--glass-border)' }}>
            <SharePanel url={shareUrl} title={post.title} />
          </div>

          {/* CC License — Fuwari style */}
          <div className="relative mb-6 overflow-hidden rounded-xl px-8 py-6 transition"
            style={{ background: 'var(--card-bg)' }}>
            <div className="font-bold transition" style={{ color: 'var(--text-primary)' }}>{post.title}</div>
            <a href={`/posts/${post.slug}`} className="transition" style={{ color: 'var(--primary)' }}>
              {typeof window !== 'undefined' ? window.location.href : `/posts/${post.slug}`}
            </a>
            <div className="mt-2 flex gap-6">
              <div>
                <div className="text-sm transition" style={{ color: 'var(--text-info)' }}>作者</div>
                <div className="line-clamp-2 transition" style={{ color: 'var(--text-primary)' }}>Tano</div>
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
        </article>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>相关文章</h2>
            <div className="space-y-3">
              {relatedPosts.map((rp: any) => (
                <a
                  key={rp.id}
                  href={`/posts/${rp.slug}`}
                  className="block card-base rounded-2xl p-4 transition-all hover:translate-y-[-2px]"
                  style={{ background: 'var(--card-bg)' }}
                >
                  <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>{rp.title}</h3>
                  {rp.excerpt && (
                    <p className="mt-1 text-sm line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{rp.excerpt}</p>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        <section className="border-t pt-8" style={{ borderColor: 'var(--glass-border)' }}>
          <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
            评论
            {comments.length > 0 && <span className="font-normal" style={{ color: 'var(--text-info)' }}> ({comments.length})</span>}
          </h2>

          {/* Comment list */}
          <div className="space-y-3 mb-8">
            {comments.map((comment: any) => (
              <div key={comment.id} className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{comment.nickname}</span>
                  <span className="text-xs" style={{ color: 'var(--text-info)' }}>{new Date(comment.created_at).toLocaleString('zh-CN')}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--text-secondary)' }}>{comment.content}</p>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-info)' }}>暂无评论</p>
            )}
          </div>

          {/* Comment form */}
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>发表评论</h3>
          {commentError && (
            <div className="glass-card rounded-2xl px-4 py-3 mb-4 text-sm" style={{ color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.2)' }}>
              {commentError}
            </div>
          )}
          {commentSuccess && (
            <div className="glass-card rounded-2xl px-4 py-3 mb-4 text-sm" style={{ color: '#4ade80', borderColor: 'rgba(74, 222, 128, 0.2)' }}>
              {commentSuccess}
            </div>
          )}
          <form onSubmit={handleComment} className="space-y-3 max-w-lg">
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
            <button type="submit"
              className="px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
              style={{ background: 'var(--primary)', boxShadow: '0 0 16px var(--primary-glow)' }}>
              提交评论
            </button>
          </form>
        </section>
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
                  className={`toc-link block py-1.5 pr-2 text-gray-500 dark:text-gray-400 transition-colors ${
                    item.level === 3 ? 'pl-4 text-xs' : 'pl-2 text-sm'
                  } ${activeId === item.id ? '!text-blue-600 dark:!text-blue-400 border-l-blue-500' : ''}`}
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
