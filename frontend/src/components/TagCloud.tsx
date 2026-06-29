'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface TagItem {
  id: string;
  name: string;
  slug: string;
  post_count: number;
}

function getTagSize(count: number, minCount: number, maxCount: number): number {
  if (maxCount === minCount) return 16;
  const ratio = (count - minCount) / (maxCount - minCount);
  return 12 + ratio * 12; // 12px to 24px
}

function getTagColor(count: number, minCount: number, maxCount: number): string {
  if (maxCount === minCount) return 'var(--text-secondary)';
  const ratio = (count - minCount) / (maxCount - minCount);
  if (ratio < 0.33) return 'var(--text-info)';
  if (ratio < 0.66) return 'var(--primary)';
  return 'var(--primary)';
}

export function TagCloud() {
  const [tags, setTags] = useState<TagItem[]>([]);

  useEffect(() => {
    api.getTags().then(res => {
      setTags(res.items || []);
    }).catch(() => {});
  }, []);

  if (tags.length === 0) return null;

  const counts = tags.map(t => t.post_count || 0);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);

  return (
    <div className="glass-card rounded-2xl p-4">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
        标签云
      </h3>
      <div className="flex flex-wrap gap-2">
        {tags.map(tag => (
          <Link
            key={tag.id}
            href={`/tags/${tag.slug}`}
            className="inline-block transition-all hover:opacity-80 hover:scale-105"
            style={{
              fontSize: `${getTagSize(tag.post_count || 0, minCount, maxCount)}px`,
              color: getTagColor(tag.post_count || 0, minCount, maxCount),
            }}
          >
            {tag.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
