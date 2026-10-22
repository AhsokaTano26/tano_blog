'use client';

import { Tooltip } from '@/components/ui/Tooltip';
import { Input } from '@/components/ui/Input';
import { Dialog } from '@/components/ui/Dialog';
import { FilePicker } from '@/components/ui/FilePicker';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { requestError } from '@/lib/request-feedback';
import { RequestFeedback } from '@/components/RequestFeedback';
import { ImageWithFallback } from '@/components/ImageWithFallback';
import type { MediaItem } from '@/lib/admin-types';

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
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const res = await api.admin.media.upload(file);
      const url = res.media?.url;
      if (url) onChange(url);
    } catch (err) {
      setUploadError(requestError(err, '上传附件失败'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value && (
        <ImageWithFallback
          src={value}
          alt="预览"
          className="object-cover flex-shrink-0"
          style={{
            width: previewSize,
            height: previewSize,
            borderRadius: rounded === 'circle' ? '50%' : '8px',
            background: 'var(--btn-card-bg)',
          }}
        />
      )}
      <Input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm outline-none glass-card"
        style={{ color: 'var(--text-primary)' }}
      />
      <button type="button"
        onClick={() => setShowPicker(true)}
        className="px-3 py-2 rounded-xl text-sm btn-glass whitespace-nowrap flex-shrink-0"
        style={{ color: 'var(--text-secondary)' }}
      >
        媒体库
      </button>
      <FilePicker
        ref={fileInputRef}
        accept={accept || 'image/*'}
        onChange={handleUpload}
        disabled={uploading}
        label={uploading ? '上传中...' : '上传'}
        compact
        className="flex-shrink-0"
      />
      {uploadError && <div className="w-full"><RequestFeedback error={uploadError} /></div>}
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

const typeTabs = [
  { key: '', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'video', label: '视频' },
  { key: 'audio', label: '音频' },
  { key: 'document', label: '文档' },
];

export function MediaPickerModal({ onSelect, onClose, onUpload, filterType }: { onSelect: (url: string, originalName?: string, thumbnailUrl?: string) => void; onClose: () => void; onUpload?: () => void; triggerRect?: DOMRect; filterType?: 'image' | 'video' | 'audio' | 'document' | '' }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadedPage, setLoadedPage] = useState(0);
  const [tagFilter, setTagFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState(filterType || '');
  const [tagError, setTagError] = useState('');
  const [mediaTags, setMediaTags] = useState<{ id: string; name: string }[]>([]);
  const pageSize = 30;

  const loadTags = async () => {
    setTagError('');
    try {
      const res = await api.admin.media.tags.list();
      setMediaTags(res.items || []);
    } catch (cause) { setTagError(requestError(cause, '加载媒体标签失败')); }
  };

  useEffect(() => { loadTags(); }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
    if (tagFilter) params.tag = tagFilter;
    if (typeFilter) params.type = typeFilter;
    api.admin.media.list(params).then(res => {
      if (!active) return;
      setItems(previous => page === 1 ? res.items || [] : [...previous, ...(res.items || [])]);
      setTotal(res.total || 0);
      setLoadedPage(page);
    }).catch(err => {
      if (active) setLoadError(err instanceof Error ? err.message : '加载媒体库失败');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, tagFilter, typeFilter, retryKey]);

  const filtered = items;

  const hasMore = loadedPage * pageSize < total;

  const modalContent = (
    <>
      <RequestFeedback error={tagError} onRetry={loadTags} />
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
            <button key={tab.key} onClick={() => { setTypeFilter(tab.key); setPage(1); }}
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
              <button key={id || 'all'} onClick={() => { setTagFilter(id); setPage(1); }}
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
          <Tooltip content={item.original_name || item.filename || ''} key={item.id}><button type="button"

            onClick={() => onSelect(item.url, item.original_name || item.filename || '', item.thumbnail_url || '')}
            className="cursor-pointer rounded-xl overflow-hidden hover:opacity-80 transition-opacity"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}
            aria-label={`选择 ${item.original_name || item.filename || '媒体文件'}`}
            data-tooltip={item.original_name || item.filename || ''}
          >
            {item.thumbnail_url || item.mime_type?.startsWith('image/') ? (
              <ImageWithFallback
                src={item.thumbnail_url || item.url}
                fallbackSrc={item.url}
                loading="lazy"
                decoding="async"
                alt={item.original_name || ''}
                className="w-full h-16 object-cover"
              />
            ) : (
              <div className="w-full h-16 flex items-center justify-center text-xs font-medium" style={{ color: 'var(--text-secondary)', background: 'var(--surface-bg)' }}>
                {item.original_name?.split('.').pop()?.toUpperCase() || 'FILE'}
              </div>
            )}
            <div className="px-1.5 pb-1.5 pt-1 text-[11px] truncate text-center font-medium" style={{ color: 'var(--text-primary)' }}>
              {item.original_name || item.filename || ''}
            </div>
          </button></Tooltip>
        ))}
      </div>
      {loadError && <p role="alert" className="text-center text-sm mt-2" style={{ color: 'var(--color-error)' }}>
        {loadError} <button onClick={() => setRetryKey(key => key + 1)} className="underline">重试</button>
      </p>}
      {loading && (
        <p className="text-center text-sm mt-2" style={{ color: 'var(--text-info)' }}>加载中...</p>
      )}
      {hasMore && !loading && !loadError && (
        <button
          onClick={() => setPage(loadedPage + 1)}
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

  return (
      <Dialog title="从媒体库选择" onClose={onClose} layer={300}
        className="w-full max-w-2xl rounded-2xl p-4 shadow-2xl flex flex-col"
        style={{
          maxHeight: '75vh',
        }}
      >
        {modalContent}
      </Dialog>
  );
}
