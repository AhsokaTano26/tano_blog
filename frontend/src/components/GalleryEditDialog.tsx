'use client';

import { useState, useRef } from 'react';
import { X, ChevronDown, ChevronUp, ImagePlus } from 'lucide-react';
import { MediaPickerModal } from '@/components/MediaField';
import { GalleryImageItem, GalleryAttrs, createDefaultGalleryAttrs, generateGalleryHtml, getSlotCount } from '@/lib/gallery';

interface GalleryEditDialogProps {
  initialAttrs?: GalleryAttrs;
  onSave: (html: string) => void;
  onClose: () => void;
}

const GRID_OPTIONS = [1, 2, 3, 4, 5] as const;
const WIDTH_OPTIONS = ['50%', '65%', '75%', '85%', '100%'] as const;

export default function GalleryEditDialog({ initialAttrs, onSave, onClose }: GalleryEditDialogProps) {
  const [gridSize, setGridSize] = useState<1 | 2 | 3 | 4 | 5>(initialAttrs?.gridSize || 3);
  const [images, setImages] = useState<GalleryImageItem[]>(initialAttrs?.images || createDefaultGalleryAttrs(3).images);
  const [description, setDescription] = useState(initialAttrs?.description || '');
  const [galleryWidth, setGalleryWidth] = useState(initialAttrs?.maxWidth || '100%');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showMediaPickerIndex, setShowMediaPickerIndex] = useState<number | null>(null);

  function handleGridChange(size: 1 | 2 | 3 | 4 | 5) {
    const newCount = getSlotCount(size);
    if (size > gridSize) {
      setImages(prev => [...prev, ...Array.from({ length: Math.max(0, newCount - prev.length) }, () => ({ url: '', alt: '', caption: '' }))]);
    } else {
      setImages(prev => prev.slice(0, newCount));
    }
    setGridSize(size);
    setExpandedIndex(null);
  }

  function updateImage(index: number, field: keyof GalleryImageItem, value: string) {
    setImages(prev => prev.map((img, i) => i === index ? { ...img, [field]: value } : img));
  }

  function toggleExpand(index: number) {
    setExpandedIndex(prev => prev === index ? null : index);
  }

  function handleSave() {
    const hasImage = images.some(img => img.url);
    if (!hasImage) return;
    const attrs: GalleryAttrs = { gridSize, images, description, maxWidth: galleryWidth };
    onSave(generateGalleryHtml(attrs));
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity duration-200" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden pe-animate-in" style={{ background: 'var(--color-bg)', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>图片画廊</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors btn-glass" style={{ color: 'var(--text-info)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Grid size selector */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>网格尺寸</label>
            <div className="flex gap-2">
              {GRID_OPTIONS.map(size => (
                <button key={size} onClick={() => handleGridChange(size)}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: gridSize === size ? 'var(--btn-card-bg)' : 'transparent',
                    color: gridSize === size ? 'var(--primary)' : 'var(--text-secondary)',
                    border: gridSize === size ? '1px solid var(--glass-border)' : '1px solid transparent',
                  }}>
                  {size === 1 ? '1x2' : `${size}x${size}`}
                </button>
              ))}
            </div>
          </div>

          {/* Gallery width selector */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>整体宽度</label>
            <div className="flex gap-2">
              {WIDTH_OPTIONS.map(w => (
                <button key={w} onClick={() => setGalleryWidth(w)}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: galleryWidth === w ? 'var(--btn-card-bg)' : 'transparent',
                    color: galleryWidth === w ? 'var(--primary)' : 'var(--text-secondary)',
                    border: galleryWidth === w ? '1px solid var(--glass-border)' : '1px solid transparent',
                  }}>
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Image cells */}
          <div className="space-y-2">
            {images.map((img, index) => (
              <div key={index} className="rounded-xl overflow-hidden" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                {/* Collapsed row */}
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="text-xs font-medium w-5 flex-shrink-0" style={{ color: 'var(--text-info)' }}>#{index + 1}</span>
                  <input type="text" value={img.url} onChange={e => updateImage(index, 'url', e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    placeholder="输入图片地址" />
                  <button onClick={() => setShowMediaPickerIndex(index)}
                    className="px-3 py-1.5 rounded-xl text-xs btn-glass whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    选择
                  </button>
                  <button onClick={() => toggleExpand(index)}
                    className="p-1.5 rounded-lg btn-glass transition-colors" style={{ color: 'var(--text-info)' }}>
                    {expandedIndex === index ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Expanded fields */}
                {expandedIndex === index && (
                  <div className="px-3 pb-3 pt-1 space-y-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <div>
                      <label className="block text-xs mb-0.5" style={{ color: 'var(--text-info)' }}>替换文本 (Alt)</label>
                      <input type="text" value={img.alt} onChange={e => updateImage(index, 'alt', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                        placeholder="替代文本" />
                    </div>
                    <div>
                      <label className="block text-xs mb-0.5" style={{ color: 'var(--text-info)' }}>单张描述</label>
                      <input type="text" value={img.caption} onChange={e => updateImage(index, 'caption', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                        placeholder="图片下方的小字描述" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Gallery description */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>画廊描述（显示在图片集下方）</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
              style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
              placeholder="整个图片集的描述性文案（可选）" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--glass-border)' }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm btn-glass" style={{ color: 'var(--text-secondary)' }}>
            取消
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--primary)', boxShadow: '0 0 12px var(--primary-glow)' }}
            disabled={!images.some(img => img.url)}>
            确认
          </button>
        </div>
      </div>

      {/* Media Picker */}
      {showMediaPickerIndex !== null && (
        <MediaPickerModal
          filterType="image"
          onSelect={(url: string) => {
            updateImage(showMediaPickerIndex, 'url', url);
            setShowMediaPickerIndex(null);
          }}
          onClose={() => setShowMediaPickerIndex(null)}
        />
      )}
    </div>
  );
}
