'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { MediaPickerModal } from './MediaField';
import type { ImageAttrs } from '@/lib/article-image';

const WIDTH_PRESETS = [
  { label: '小', value: '50%' },
  { label: '中', value: '75%' },
  { label: '大', value: '100%' },
  { label: '原始', value: '' },
];

// ===== ImageEditDialog Component =====

export default function ImageEditDialog({ attrs, onSave, onClose }: {
  attrs: ImageAttrs;
  onSave: (attrs: ImageAttrs) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(attrs.url ?? '');
  const [alt, setAlt] = useState(attrs.alt ?? '');
  const [width, setWidth] = useState(attrs.width ?? '100%');
  const [height, setHeight] = useState(attrs.height ?? '');
  const [align, setAlign] = useState<'left' | 'center' | 'right'>(attrs.align ?? 'center');
  const [caption, setCaption] = useState(attrs.caption ?? '');
  const [linkUrl, setLinkUrl] = useState(attrs.linkUrl ?? '');
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  function handleSave() {
    if (!url) return;
    onSave({ url, alt, width, height, align, caption, linkUrl });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity duration-200" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden pe-animate-in" style={{ background: 'var(--color-bg)', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>编辑图片</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors btn-glass" style={{ color: 'var(--text-info)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* URL */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>图片 URL</label>
            <div className="flex gap-2">
              <input type="text" value={url} onChange={e => setUrl(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }}
                placeholder="输入图片地址" />
              <button onClick={() => setShowMediaPicker(true)}
                className="px-3 py-2 rounded-xl text-sm btn-glass whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                媒体库
              </button>
            </div>
          </div>

          {/* Alt Text */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>替代文本 (Alt)</label>
            <input type="text" value={alt} onChange={e => setAlt(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }}
              placeholder="图片描述" />
          </div>

          {/* Width Presets */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>尺寸</label>
            <div className="flex gap-2 mb-2">
              {WIDTH_PRESETS.map(p => (
                <button key={p.value} onClick={() => setWidth(p.value)}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: width === p.value ? 'var(--btn-card-bg)' : 'transparent',
                    color: width === p.value ? 'var(--primary)' : 'var(--text-secondary)',
                    border: width === p.value ? '1px solid var(--glass-border)' : '1px solid transparent',
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: 'var(--text-info)' }}>宽度</label>
                <input type="text" value={width} onChange={e => setWidth(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
                  style={{ color: 'var(--text-primary)' }}
                  placeholder="100%" />
              </div>
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: 'var(--text-info)' }}>高度</label>
                <input type="text" value={height} onChange={e => setHeight(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
                  style={{ color: 'var(--text-primary)' }}
                  placeholder="auto" />
              </div>
            </div>
          </div>

          {/* Alignment */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>对齐方式</label>
            <div className="flex gap-2">
              {(['left', 'center', 'right'] as const).map(a => (
                <button key={a} onClick={() => setAlign(a)}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: align === a ? 'var(--btn-card-bg)' : 'transparent',
                    color: align === a ? 'var(--primary)' : 'var(--text-secondary)',
                    border: align === a ? '1px solid var(--glass-border)' : '1px solid transparent',
                  }}>
                  {a === 'left' ? '左对齐' : a === 'center' ? '居中' : '右对齐'}
                </button>
              ))}
            </div>
          </div>

          {/* Caption */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>描述文本</label>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none glass-card"
              style={{ color: 'var(--text-primary)' }}
              placeholder="图片下方的描述文字" />
          </div>

          {/* Link URL */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>跳转链接</label>
            <input type="text" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }}
              placeholder="点击图片跳转的 URL" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--glass-border)' }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm btn-glass" style={{ color: 'var(--text-secondary)' }}>
            取消
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: 'var(--primary)', boxShadow: '0 0 12px var(--primary-glow)' }}>
            确认
          </button>
        </div>
      </div>

      {showMediaPicker && (
        <MediaPickerModal
          filterType="image"
          onSelect={(url: string) => { setUrl(url); setShowMediaPicker(false); }}
          onClose={() => setShowMediaPicker(false)}
        />
      )}
    </div>
  );
}
