'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';

interface MediaFieldProps {
  value: string;
  onChange: (url: string) => void;
  accept?: string;
  placeholder?: string;
  previewSize?: number;
  rounded?: 'square' | 'circle';
  filterType?: 'image' | 'video' | 'audio' | 'document';
}

export function MediaField({ value, onChange, accept, placeholder, previewSize = 64, rounded = 'square', filterType }: MediaFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.admin.media.upload(file);
      const url = res.media?.url;
      if (url) onChange(url);
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      {value && (
        <img
          src={value}
          alt="预览"
          className="object-cover flex-shrink-0"
          style={{
            width: previewSize,
            height: previewSize,
            borderRadius: rounded === 'circle' ? '50%' : '8px',
            background: 'var(--btn-card-bg)',
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm outline-none glass-card"
        style={{ color: 'var(--text-primary)' }}
      />
      <button
        onClick={() => setShowPicker(true)}
        className="px-3 py-2 rounded-xl text-sm btn-glass whitespace-nowrap flex-shrink-0"
        style={{ color: 'var(--text-secondary)' }}
      >
        媒体库
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="px-3 py-2 rounded-xl text-sm font-medium text-white whitespace-nowrap flex-shrink-0 transition-all hover:opacity-90 disabled:opacity-50"
        style={{ background: 'var(--primary)' }}
      >
        {uploading ? '上传中...' : '上传'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept || 'image/*'}
        onChange={handleUpload}
        style={{ display: 'none' }}
      />
      {showPicker && (
        <MediaPickerModal
          onSelect={(url) => { onChange(url); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
          filterType={filterType}
        />
      )}
    </div>
  );
}

function getMediaType(mime: string): 'image' | 'video' | 'audio' | 'document' {
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  return 'document';
}

const typeTabs = [
  { key: '', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'audio', label: '音频' },
  { key: 'document', label: '文档' },
];

export function MediaPickerModal({ onSelect, onClose, onUpload, triggerRect, filterType }: { onSelect: (url: string, originalName?: string, thumbnailUrl?: string) => void; onClose: () => void; onUpload?: () => void; triggerRect?: DOMRect; filterType?: 'image' | 'video' | 'audio' | 'document' | '' }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tagFilter, setTagFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState(filterType || '');
  const [mediaTags, setMediaTags] = useState<{ id: string; name: string }[]>([]);
  const pageSize = 30;

  const loadTags = async () => {
    try {
      const res = await api.admin.media.tags.list();
      setMediaTags(res.items || []);
    } catch { /* ignore */ }
  };

  async function loadItems() {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
      if (tagFilter) params.tag = tagFilter;
      const res = await api.admin.media.list(params);
      if (page === 1) {
        setItems(res.items || []);
      } else {
        setItems(prev => [...prev, ...(res.items || [])]);
      }
      setTotal(res.total || 0);
    } catch {
      // ignore
    }
    setLoading(false);
  }

  useEffect(() => { loadTags(); }, []);
  useEffect(() => { loadItems(); }, [page, tagFilter]);
  useEffect(() => { setPage(1); }, [tagFilter, typeFilter]);

  const filtered = typeFilter
    ? items.filter(item => getMediaType(item.mime_type) === typeFilter)
    : items;

  const hasMore = items.length < total;

  const modalContent = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>从媒体库选择</span>
        <div className="flex items-center gap-2">
          {onUpload && (
            <button onClick={onUpload}
              className="px-3 py-1 rounded-xl text-xs font-medium text-white transition-all hover:opacity-90"
              style={{ background: 'var(--primary)' }}>
              上传新文件
            </button>
          )}
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--text-info)' }}>取消</button>
        </div>
      </div>

      {/* Type filter — hidden when filterType is forced */}
      {!filterType && (
        <div className="flex items-center gap-1 mb-2 flex-shrink-0">
          {typeTabs.map(tab => (
            <button key={tab.key} onClick={() => setTypeFilter(tab.key)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: typeFilter === tab.key ? 'var(--primary-sub)' : 'transparent',
                color: typeFilter === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
              }}>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tag filter */}
      {mediaTags.length > 0 && (
        <div className="flex items-center gap-1.5 mb-2 pb-2 overflow-x-auto flex-shrink-0"
          style={{ borderBottom: '1px solid var(--glass-border)' }}>
          {['', ...mediaTags.map(t => t.id)].map(id => {
            const tag = id ? mediaTags.find(t => t.id === id) : null;
            const active = tagFilter === id;
            return (
              <button key={id || 'all'} onClick={() => setTagFilter(id)}
                className="px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition-colors"
                style={{
                  background: active ? 'var(--primary-sub)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--text-secondary)',
                }}>
                {tag ? tag.name : '全部'}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-5 gap-2 overflow-y-auto flex-1 content-start">
        {filtered.map(item => (
          <div
            key={item.id}
            onClick={() => onSelect(item.url, item.original_name || item.filename || '', item.thumbnail_url || '')}
            className="cursor-pointer rounded-xl overflow-hidden hover:opacity-80 transition-opacity"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}
            title={item.original_name || item.filename || ''}
          >
            {item.thumbnail_url || item.mime_type?.startsWith('image/') ? (
              <img
                src={item.thumbnail_url || item.url}
                alt={item.original_name || ''}
                className="w-full h-16 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-16 flex items-center justify-center text-xs font-medium" style={{ color: 'var(--text-secondary)', background: 'var(--surface-bg)' }}>
                {item.original_name?.split('.').pop()?.toUpperCase() || 'FILE'}
              </div>
            )}
            <div className="px-1.5 pb-1.5 pt-1 text-[11px] truncate text-center font-medium" style={{ color: 'var(--text-primary)' }}>
              {item.original_name || item.filename || ''}
            </div>
          </div>
        ))}
      </div>
      {loading && (
        <p className="text-center text-sm mt-2" style={{ color: 'var(--text-info)' }}>加载中...</p>
      )}
      {hasMore && !loading && (
        <button
          onClick={() => setPage(p => p + 1)}
          className="w-full mt-2 py-2 rounded-xl text-sm btn-glass"
          style={{ color: 'var(--text-secondary)' }}
        >
          加载更多
        </button>
      )}
      {!loading && items.length === 0 && (
        <p className="text-center text-sm" style={{ color: 'var(--text-info)' }}>媒体库为空</p>
      )}
      {!loading && items.length > 0 && filtered.length === 0 && (
        <p className="text-center text-sm" style={{ color: 'var(--text-info)' }}>无匹配的媒体文件</p>
      )}
    </>
  );

  if (triggerRect) {
    const popWidth = Math.min(560, window.innerWidth - 16);
    let top = triggerRect.bottom + 4;
    let left = triggerRect.left;
    if (left + popWidth > window.innerWidth - 8) left = Math.max(8, window.innerWidth - popWidth - 8);
    if (top + 400 > window.innerHeight) top = Math.max(8, triggerRect.top - 400);
    return createPortal(
      <>
        <div className="fixed inset-0 z-[300]" onClick={onClose} />
        <div className="fixed z-[300] animate-fade-in"
          style={{ top, left }}>
          <div className="rounded-2xl p-4 shadow-2xl flex flex-col"
            style={{
              width: popWidth,
              maxHeight: '70vh',
              background: 'var(--card-bg)',
              border: '1px solid var(--glass-border)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}>
            {modalContent}
          </div>
        </div>
      </>,
      document.body
    );
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl p-4 shadow-2xl flex flex-col animate-fade-scale-in"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--glass-border)',
          maxHeight: '75vh',
          backdropFilter: 'blur(24px)',
        }}
      >
        {modalContent}
      </div>
    </div>
  );
}
