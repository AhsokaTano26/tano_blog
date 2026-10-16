'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import { ImageLightbox } from '@/components/ImageLightbox';
import { Loading } from '@/components/Loading';
import { LoadMore } from '@/components/LoadMore';
import { usePagedItems } from '@/lib/use-paged-items';
import { mergeById } from '@/lib/pagination';

interface GalleryImage {
  id: string;
  url: string;
  thumbnail_url?: string;
  title: string;
  description: string;
  width: number;
  height: number;
}

const fetchImages = (params: Record<string, string>) => api.getGalleryImages(params);

export default function GalleryPage() {
  const pagination = usePagedItems<GalleryImage>(fetchImages, 48, mergeById);
  const { items: images, total, initialLoading } = pagination;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (initialLoading) return <Loading />;

  return (
    <main className="page-transition min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* 页面标题 */}
        <div className="text-center mb-10 animate-fade-in-up">
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>图片馆</h1>
          <p className="text-sm" style={{ color: 'var(--text-info)' }}>
            共 {total} 张图片
          </p>
        </div>

        {/* Masonry 瀑布流 */}
        {images.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-info)' }}>
            暂无图片
          </div>
        ) : (
          <div className="gallery-masonry">
            {images.map((img, index) => {
              return (
                <div
                  key={img.id}
                  className="gallery-masonry-item animate-fade-in-up"
                  style={{ animationDelay: `${(index % 10) * 0.05}s` }}
                  onClick={() => setLightboxIndex(index)}
                >
                  <div className="gallery-masonry-inner">
                    <ImageWithFallback
                      src={img.thumbnail_url || img.url}
                      fallbackSrc={img.url}
                      alt={img.title || '图片'}
                      loading="lazy"
                      decoding="async"
                      style={{ aspectRatio: img.width && img.height ? `${img.width}/${img.height}` : undefined }}
                    />
                    {img.title && (
                      <div className="gallery-masonry-overlay">
                        <span>{img.title}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <LoadMore {...pagination} />
      </div>

      {/* 灯箱 */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={images.map(img => ({ url: img.url, title: img.title, description: img.description }))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </main>
  );
}
