'use client';

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { Image, Upload, Trash2, Copy, Check, Grid, List, Search, X, FileText, Video, Music, File, Tag, Plus, Settings, Play, ExternalLink } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { useConfirm, Checkbox } from '@/components/ConfirmDialog';
import { MediaField } from '@/components/MediaField';

const SITE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://tano.asia';

type MediaTag = { id: string; name: string };
type MediaItem = {
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
};

function getMediaType(mime: string): 'image' | 'video' | 'audio' | 'document' {
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  return 'document';
}

function getMediaIcon(mime: string) {
  const type = getMediaType(mime);
  switch (type) {
    case 'image': return Image;
    case 'video': return Video;
    case 'audio': return Music;
    default: return FileText;
  }
}

function buildLinks(item: MediaItem) {
  const url = item.url;
  const fullUrl = `${SITE_URL}${url}`;
  const name = item.original_name || item.filename;
  const type = getMediaType(item.mime_type);

  let htmlRel = '', htmlFull = '', mdRel = '', mdFull = '';
  if (type === 'image') {
    htmlRel = `<img src="${url}" alt="${name}" />`;
    htmlFull = `<img src="${fullUrl}" alt="${name}" />`;
    mdRel = `![${name}](${url})`;
    mdFull = `![${name}](${fullUrl})`;
  } else if (type === 'video') {
    htmlRel = `<video src="${url}" controls></video>`;
    htmlFull = `<video src="${fullUrl}" controls></video>`;
    mdRel = `<video src="${url}" controls></video>`;
    mdFull = `<video src="${fullUrl}" controls></video>`;
  } else if (type === 'audio') {
    htmlRel = `<audio src="${url}" controls></audio>`;
    htmlFull = `<audio src="${fullUrl}" controls></audio>`;
    mdRel = `<audio src="${url}" controls></audio>`;
    mdFull = `<audio src="${fullUrl}" controls></audio>`;
  } else {
    htmlRel = `<a href="${url}">${name}</a>`;
    htmlFull = `<a href="${fullUrl}">${name}</a>`;
    mdRel = `[${name}](${url})`;
    mdFull = `[${name}](${fullUrl})`;
  }

  return [
    { label: '相对路径', items: [
      { fmt: 'URL', value: url },
      { fmt: 'HTML', value: htmlRel },
      { fmt: 'Markdown', value: mdRel },
    ]},
    { label: '完整路径', items: [
      { fmt: 'URL', value: fullUrl },
      { fmt: 'HTML', value: htmlFull },
      { fmt: 'Markdown', value: mdFull },
    ]},
  ];
}

const typeTabs = [
  { key: '', label: '全部', icon: File },
  { key: 'image', label: '图片', icon: Image },
  { key: 'video', label: '视频', icon: Video },
  { key: 'audio', label: '音频', icon: Music },
  { key: 'document', label: '文档', icon: FileText },
];

export default function AdminMedia() {
  const { confirm } = useConfirm();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [openLinksId, setOpenLinksId] = useState<string | null>(null);
  const [openLinksEl, setOpenLinksEl] = useState<HTMLElement | null>(null);
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [editingTagsEl, setEditingTagsEl] = useState<HTMLElement | null>(null);
  const linksAnchorRef = useRef<HTMLElement | null>(openLinksEl);
  const tagsAnchorRef = useRef<HTMLElement | null>(editingTagsEl);
  linksAnchorRef.current = openLinksEl;
  tagsAnchorRef.current = editingTagsEl;

  // Tag state
  const [mediaTags, setMediaTags] = useState<MediaTag[]>([]);
  const [tagFilter, setTagFilter] = useState('');
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [uploadTagIds, setUploadTagIds] = useState<string[]>([]);

  const [galleryUrls, setGalleryUrls] = useState(new Set<string>());
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [showBatchTag, setShowBatchTag] = useState(false);
  const [pendingBatchTagIds, setPendingBatchTagIds] = useState<string[]>([]);
  const batchTagBtnRef = useRef<HTMLButtonElement>(null);

  // Media viewer
  const [viewerItem, setViewerItem] = useState<MediaItem | null>(null);

  // Metadata editor
  const [editingMetadataItem, setEditingMetadataItem] = useState<MediaItem | null>(null);
  const [metadataForm, setMetadataForm] = useState({ title: '', artist: '', album: '', description: '', thumbnail_url: '' });

  // Close viewer on Escape
  useEffect(() => {
    if (!viewerItem) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setViewerItem(null);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [viewerItem]);

  const load = useCallback(async () => {
    setSelectedIds(new Set());
    setLoading(true);
    try {
      const params: Record<string, string> = { page: '1', page_size: '100' };
      if (search) params.search = search;
      if (tagFilter) params.tag = tagFilter;
      const res = await api.admin.media.list(params);
      setItems(res.items || []);
      // Load gallery URLs for toggle display
      try {
        const galleryRes = await api.admin.gallery.list();
        const urls = (galleryRes.items || []).map((img: any) => img.url);
        setGalleryUrls(new Set(urls));
      } catch { /* empty */ }
    } catch { /* empty */ }
    setLoading(false);
  }, [search, tagFilter]);

  const loadTags = useCallback(async () => {
    try {
      const res = await api.admin.media.tags.list();
      setMediaTags(res.items || []);
    } catch { /* empty */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadTags(); }, [loadTags]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress('');
    setUploadError('');
    const tagIds = uploadTagIds.length > 0 ? uploadTagIds : undefined;
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(`${i + 1}/${files.length}`);
        await api.admin.media.upload(files[i], tagIds);
      }
      load();
    } catch (err: any) {
      setUploadError(err.message || '上传失败');
    }
    setUploadProgress('');
    setUploading(false);
    e.target.value = '';
  }

  async function handleDelete(id: string, anchorEl?: HTMLElement | null) {
    if (!await confirm('确定删除此文件？', anchorEl)) return;
    try { await api.admin.media.delete(id); load(); } catch { /* empty */ }
  }

  function copyValue(value: string, key: string) {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  const filtered = typeFilter
    ? items.filter(item => getMediaType(item.mime_type) === typeFilter)
    : items;

  function handleSearch() { load(); }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(i => i.id)));
    }
  }

  async function handleBatchDelete() {
    if (!await confirm(`确定删除选中的 ${selectedIds.size} 个文件？`)) return;
    try {
      await api.admin.media.batchDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      load();
    } catch { /* empty */ }
  }

  // Tag management
  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    try {
      await api.admin.media.tags.create(name);
      setNewTagName('');
      loadTags();
    } catch { /* empty */ }
  }

  async function handleDeleteTag(id: string) {
    if (!await confirm('确定删除此标签？')) return;
    try {
      await api.admin.media.tags.delete(id);
      if (tagFilter === id) setTagFilter('');
      loadTags();
    } catch { /* empty */ }
  }

  async function handleToggleMediaTag(mediaId: string, tagId: string) {
    const item = items.find(i => i.id === mediaId);
    if (!item) return;
    const current = item.tags.map(t => t.id);
    const next = current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId];
    try {
      const res = await api.admin.media.updateTags(mediaId, next) as { media: MediaItem };
      setItems(prev => prev.map(i => i.id === mediaId ? { ...i, tags: res.media.tags || [] } : i));
    } catch { /* empty */ }
  }

  function openMetadataEditor(item: MediaItem) {
    setEditingMetadataItem(item);
    setMetadataForm({
      title: item.title || '',
      artist: item.artist || '',
      album: item.album || '',
      description: item.description || '',
      thumbnail_url: item.thumbnail_url || '',
    });
  }

  async function handleSaveMetadata() {
    if (!editingMetadataItem) return;
    try {
      const res = await api.admin.media.updateMetadata(editingMetadataItem.id, {
        title: metadataForm.title,
        artist: metadataForm.artist,
        album: metadataForm.album,
        description: metadataForm.description,
        thumbnail_url: metadataForm.thumbnail_url,
      }) as { media: MediaItem };
      setItems(prev => prev.map(i => i.id === editingMetadataItem.id ? { ...i, ...res.media } : i));
      setEditingMetadataItem(null);
    } catch { /* empty */ }
  }

  function toggleUploadTag(tagId: string) {
    setUploadTagIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  }

  function FloatingPopover({ anchorRef, onClose, width, children }: {
    anchorRef: React.RefObject<HTMLElement | null>;
    onClose: () => void;
    width: number;
    children: React.ReactNode;
  }) {
    const popRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useLayoutEffect(() => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let left = rect.right - width;
      if (left < 8) left = 8;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
      let top = rect.bottom + 6;
      if (top + 300 > window.innerHeight) {
        top = rect.top - 6;
        // Will be adjusted with translateY below
      }
      setPos({ top, left });
    }, [anchorRef, width]);

    useEffect(() => {
      function handleClick(e: MouseEvent) {
        if (popRef.current && !popRef.current.contains(e.target as Node) &&
            anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
          onClose();
        }
      }
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose, anchorRef]);

    return createPortal(
      <div ref={popRef} className="fixed z-[100] rounded-xl shadow-2xl"
        style={{
          top: pos.top,
          left: pos.left,
          width,
          background: 'var(--card-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          maxHeight: '70vh',
          overflowY: 'auto',
        }}>
        {children}
      </div>,
      document.body
    );
  }

  function CopyPopoverContent({ item }: { item: MediaItem }) {
    const groups = buildLinks(item);
    return (
      <div className="p-3 space-y-3">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-info)' }}>{group.label}</div>
            <div className="space-y-1">
              {group.items.map((link) => {
                const copyKey = `${item.id}-${link.fmt}-${group.label}`;
                return (
                  <div key={link.fmt} className="flex items-center gap-2">
                    <span className="w-16 text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{link.fmt}</span>
                    <code className="flex-1 text-xs truncate px-2 py-1 rounded" style={{ background: 'var(--surface-bg)', color: 'var(--text-primary)' }}>
                      {link.value}
                    </code>
                    <button onClick={() => copyValue(link.value, copyKey)}
                      className="p-1 rounded transition-colors btn-glass flex-shrink-0"
                      title={`复制${link.fmt}`}>
                      {copiedKey === copyKey ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} /> : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--text-info)' }} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function TagEditorContent({ item }: { item: MediaItem }) {
    return (
      <div className="p-3">
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-info)' }}>编辑标签</div>
        {mediaTags.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>暂无标签，请先创建</p>
        ) : (
          <div className="space-y-1.5">
            {mediaTags.map(tag => {
              const active = item.tags.some(t => t.id === tag.id);
              return (
                <button key={tag.id} onClick={() => handleToggleMediaTag(item.id, tag.id)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs transition-colors text-left"
                  style={{
                    background: active ? 'var(--primary-sub)' : 'transparent',
                    color: active ? 'var(--primary)' : 'var(--text-secondary)',
                  }}>
                  <div className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: active ? 'var(--primary)' : 'var(--border-color)', background: active ? 'var(--primary)' : 'transparent' }}>
                    {active && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>附件</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg p-0.5" style={{ background: 'var(--surface-bg)' }}>
            <button onClick={() => setViewMode('grid')} aria-label="网格视图"
              className="p-1.5 rounded transition-colors"
              style={{ background: viewMode === 'grid' ? 'var(--card-bg)' : 'transparent', color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              <Grid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} aria-label="列表视图"
              className="p-1.5 rounded transition-colors"
              style={{ background: viewMode === 'list' ? 'var(--card-bg)' : 'transparent', color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              <List className="w-4 h-4" />
            </button>
          </div>
          <label className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer transition-colors ${uploading ? 'opacity-50' : ''}`}
            style={{ background: 'var(--primary)' }}>
            <Upload className="w-4 h-4" />
            {uploading ? `上传中${uploadProgress ? ` (${uploadProgress})` : '...'}` : '上传'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} multiple />
          </label>
        </div>
      </div>

      {/* Upload error */}
      {uploadError && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center justify-between" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
          <span>{uploadError}</span>
          <button onClick={() => setUploadError('')} className="ml-3 p-0.5 rounded hover:bg-white/10" aria-label="关闭">
            <X className="w-4 h-4" />
          </button>
        </div>)}

      {/* Upload tag selector */}
      {mediaTags.length > 0 && (
        <div className="glass-card rounded-xl mb-4 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--text-info)' }}>上传时添加标签：</span>
            {mediaTags.map(tag => (
              <button key={tag.id} onClick={() => toggleUploadTag(tag.id)}
                className="px-2 py-1 rounded-lg text-xs transition-colors"
                style={{
                  background: uploadTagIds.includes(tag.id) ? 'var(--primary-sub)' : 'var(--surface-bg)',
                  color: uploadTagIds.includes(tag.id) ? 'var(--primary)' : 'var(--text-secondary)',
                  border: `1px solid ${uploadTagIds.includes(tag.id) ? 'var(--primary)' : 'var(--glass-border)'}`,
                }}>
                {tag.name}
              </button>
            ))}
            {uploadTagIds.length > 0 && (
              <button onClick={() => setUploadTagIds([])} className="text-xs" style={{ color: 'var(--text-info)' }}>
                清除
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search + Type filter + Tag filter */}
      <div className="glass-card rounded-xl mb-4">
        <div className="flex items-center gap-3 p-4 flex-wrap" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-info)' }} />
            <input type="text" placeholder="搜索文件名..." value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-8 py-2 rounded-xl text-sm outline-none glass-card"
              style={{ color: 'var(--text-primary)' }} />
            {search && (
              <button onClick={() => { setSearch(''); setTimeout(load, 0); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors"
                style={{ color: 'var(--text-info)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {typeTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.key} onClick={() => setTypeFilter(tab.key)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: typeFilter === tab.key ? 'var(--primary-sub)' : 'transparent',
                    color: typeFilter === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
                  }}>
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <button onClick={() => setShowTagManager(!showTagManager)}
            className="p-1.5 rounded-lg transition-colors btn-glass ml-auto"
            title="管理标签">
            <Settings className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Tag filter row */}
        {mediaTags.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap" style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <Tag className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-info)' }} />
            <button onClick={() => setTagFilter('')}
              className="px-2.5 py-1 rounded-lg text-xs transition-colors"
              style={{
                background: !tagFilter ? 'var(--primary-sub)' : 'transparent',
                color: !tagFilter ? 'var(--primary)' : 'var(--text-secondary)',
              }}>
              全部
            </button>
            {mediaTags.map(tag => (
              <button key={tag.id} onClick={() => setTagFilter(tagFilter === tag.id ? '' : tag.id)}
                className="px-2.5 py-1 rounded-lg text-xs transition-colors"
                style={{
                  background: tagFilter === tag.id ? 'var(--primary-sub)' : 'transparent',
                  color: tagFilter === tag.id ? 'var(--primary)' : 'var(--text-secondary)',
                }}>
                {tag.name}
              </button>
            ))}
          </div>
        )}

        {/* Tag Manager */}
        {showTagManager && (
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <input type="text" placeholder="新标签名称..." value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
                className="flex-1 max-w-xs px-3 py-1.5 rounded-lg text-sm outline-none glass-card"
                style={{ color: 'var(--text-primary)' }} />
              <button onClick={handleCreateTag}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--primary)' }}>
                <Plus className="w-3.5 h-3.5" />
                创建
              </button>
            </div>
            {mediaTags.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {mediaTags.map(tag => (
                  <div key={tag.id} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs"
                    style={{ background: 'var(--surface-bg)', color: 'var(--text-secondary)' }}>
                    {tag.name}
                    <button onClick={() => handleDeleteTag(tag.id)} className="ml-1 hover:opacity-70">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: '1px solid var(--glass-border)', background: 'var(--primary-sub)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
              已选择 {selectedIds.size} 项
            </span>
            <div className="flex items-center gap-2">
              <button ref={batchTagBtnRef} onClick={() => setShowBatchTag(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium btn-glass"
                style={{ color: 'var(--text-secondary)' }}>
                <Tag className="w-3.5 h-3.5" />
                批量打标签
              </button>
              <button onClick={handleBatchDelete}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: '#ef4444' }}>
                <Trash2 className="w-3.5 h-3.5" />
                批量删除
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 rounded-lg text-xs btn-glass"
                style={{ color: 'var(--text-info)' }}>
                取消选择
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <Image className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-info)' }} />
            <p>{search || tagFilter ? '未找到匹配文件' : '暂无文件'}</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filtered.map((item) => {
              const Icon = getMediaIcon(item.mime_type);
              return (
                <div key={item.id} className="glass-card rounded-xl overflow-hidden group">
                  <div className="relative aspect-square cursor-pointer" style={{ background: 'var(--surface-bg)' }}
                    onClick={() => setViewerItem(item)}>
                    {item.mime_type?.startsWith('image/') ? (
                      <img src={item.url} alt={item.original_name || item.filename} className="w-full h-full object-cover" />
                    ) : item.mime_type?.startsWith('video/') ? (
                      <div className="w-full h-full relative bg-black/20">
                        <video src={item.url} preload="metadata"
                          className="w-full h-full object-contain" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(0,0,0,0.6)' }}>
                            <Play className="w-6 h-6 text-white ml-0.5" />
                          </div>
                        </div>
                      </div>
                    ) : item.thumbnail_url ? (
                      <img src={item.thumbnail_url} alt={item.original_name || item.filename} className="w-full h-full object-cover" />
                    ) : item.mime_type?.startsWith('audio/') ? (
                      <div className="w-full h-full flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}>
                        <div className="flex flex-col items-center gap-2 pointer-events-none">
                          <div className="w-12 h-12 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(255,255,255,0.1)' }}>
                            <Music className="w-6 h-6" style={{ color: 'var(--primary)' }} />
                          </div>
                          <Play className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.6)' }} />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileText className="w-10 h-10" style={{ color: 'var(--text-info)' }} />
                      </div>
                    )}
                    <div className="absolute top-2 left-2 z-10">
                      <Checkbox checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} />
                    </div>
                    {galleryUrls.has(item.url) && (
                      <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{ background: 'rgba(34,197,94,0.85)', color: '#fff' }}>
                        图片馆
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-none">
                      <button onClick={(e) => {
                        e.stopPropagation();
                        if (openLinksId === item.id) { setOpenLinksId(null); setOpenLinksEl(null); }
                        else { setOpenLinksId(item.id); setOpenLinksEl(e.currentTarget); setEditingTagsId(null); }
                      }}
                        className="p-1.5 rounded-full transition-colors pointer-events-auto" style={{ background: 'var(--card-bg)', color: 'var(--text-primary)' }} title="复制链接">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        if (editingTagsId === item.id) { setEditingTagsId(null); setEditingTagsEl(null); }
                        else { setEditingTagsId(item.id); setEditingTagsEl(e.currentTarget); setOpenLinksId(null); }
                      }}
                        className="p-1.5 rounded-full transition-colors pointer-events-auto" style={{ background: 'var(--card-bg)', color: 'var(--text-primary)' }} title="编辑标签">
                        <Tag className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        openMetadataEditor(item);
                      }}
                        className="p-1.5 rounded-full transition-colors pointer-events-auto" style={{ background: 'var(--card-bg)', color: 'var(--text-primary)' }} title="编辑元信息">
                        <FileText className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id, e.currentTarget);
                      }}
                        className="p-1.5 rounded-full transition-colors pointer-events-auto" style={{ background: 'var(--card-bg)', color: 'var(--color-error)' }} title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }} title={item.original_name || item.filename}>
                      {item.mime_type?.startsWith('audio/') && (item.title || item.artist)
                        ? [item.title, item.artist].filter(Boolean).join(' — ') || item.original_name || item.filename
                        : item.original_name || item.filename}
                    </p>
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {item.tags.map(tag => (
                          <span key={tag.id} className="px-1.5 py-0.5 rounded text-[10px]"
                            style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-info)' }}>{item.size ? formatSize(item.size) : ''}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-10" style={{ color: 'var(--text-secondary)' }}>
                    <Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-12" style={{ color: 'var(--text-secondary)' }}></th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>文件名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-32" style={{ color: 'var(--text-secondary)' }}>类型</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-24" style={{ color: 'var(--text-secondary)' }}>大小</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>标签</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider w-32" style={{ color: 'var(--text-secondary)' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const Icon = getMediaIcon(item.mime_type);
                  return (
                    <tr key={item.id} className="transition-colors" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <td className="px-4 py-3">
                        <Checkbox checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="cursor-pointer" onClick={() => setViewerItem(item)}>
                          {item.mime_type?.startsWith('image/') ? (
                            <img src={item.url} alt={item.original_name || item.filename} className="w-10 h-10 rounded object-cover" />
                          ) : item.mime_type?.startsWith('video/') ? (
                            <div className="relative w-20 h-12 rounded bg-black/20 flex items-center justify-center overflow-hidden">
                              <video src={item.url} preload="metadata" className="w-full h-full object-contain" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center"
                                  style={{ background: 'rgba(0,0,0,0.6)' }}>
                                  <Play className="w-3.5 h-3.5 text-white ml-0.5" />
                                </div>
                              </div>
                            </div>
                          ) : item.thumbnail_url ? (
                            <img src={item.thumbnail_url} alt={item.original_name || item.filename} className="w-14 h-12 rounded object-cover" />
                          ) : item.mime_type?.startsWith('audio/') ? (
                            <div className="w-14 h-12 rounded flex items-center justify-center"
                              style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}>
                              <Music className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: 'var(--surface-bg)' }}>
                              <Icon className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }} title={item.original_name || item.filename}>
                        {item.mime_type?.startsWith('audio/') && (item.title || item.artist)
                          ? [item.title, item.artist].filter(Boolean).join(' — ') || item.original_name || item.filename
                          : item.original_name || item.filename}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{item.mime_type || '-'}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{item.size ? formatSize(item.size) : '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {item.tags && item.tags.length > 0 ? item.tags.map(tag => (
                            <span key={tag.id} className="px-1.5 py-0.5 rounded text-[10px]"
                              style={{ background: 'var(--primary-sub)', color: 'var(--primary)' }}>
                              {tag.name}
                            </span>
                          )) : (
                            <span className="text-xs" style={{ color: 'var(--text-info)' }}>-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={(e) => {
                            if (openLinksId === item.id) { setOpenLinksId(null); setOpenLinksEl(null); }
                            else { setOpenLinksId(item.id); setOpenLinksEl(e.currentTarget); setEditingTagsId(null); }
                          }}
                            className="btn-glass p-1.5 rounded transition-colors" title="复制链接">
                            <Copy className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                          </button>
                          <button onClick={(e) => {
                            if (editingTagsId === item.id) { setEditingTagsId(null); setEditingTagsEl(null); }
                            else { setEditingTagsId(item.id); setEditingTagsEl(e.currentTarget); setOpenLinksId(null); }
                          }}
                            className="btn-glass p-1.5 rounded transition-colors" title="编辑标签">
                            <Tag className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                          </button>
                          <button onClick={() => openMetadataEditor(item)}
                            className="btn-glass p-1.5 rounded transition-colors" title="编辑元信息">
                            <FileText className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                          </button>
                          <button onClick={() => handleDelete(item.id)}
                            className="btn-glass p-1.5 rounded transition-colors" title="删除">
                            <Trash2 className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Count */}
      <div className="text-sm" style={{ color: 'var(--text-info)' }}>
        共 {filtered.length} 个文件
        {(typeFilter || tagFilter) && ` (筛选自 ${items.length} 个)`}
      </div>

      {/* Media viewer modal */}
      {viewerItem && (() => {
        const item = viewerItem;
        const type = getMediaType(item.mime_type);
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
            style={{ background: 'rgba(0,0,0,0.85)' }}
            onClick={() => setViewerItem(null)}>
            <div className="relative max-w-5xl w-full max-h-full flex flex-col items-center"
              onClick={e => e.stopPropagation()}>
              {/* Close button */}
              <button onClick={() => setViewerItem(null)}
                className="absolute -top-10 right-0 sm:-right-10 sm:-top-10 p-2 rounded-full transition-colors hover:bg-white/10 z-10 cursor-pointer"
                style={{ color: '#fff' }}>
                <X className="w-6 h-6" />
              </button>

              {/* Media display */}
              <div className="w-full flex items-center justify-center rounded-xl overflow-hidden"
                style={{ background: 'var(--surface-bg)', minHeight: type === 'audio' ? '200px' : 'auto' }}>
                {type === 'image' ? (
                  <img src={item.url} alt={item.original_name || item.filename}
                    className="max-w-full max-h-[70vh] object-contain"
                    style={{ background: 'var(--surface-bg)' }} />
                ) : type === 'video' ? (
                  <video src={item.url} controls autoPlay
                    className="max-w-full max-h-[70vh] w-full"
                    style={{ background: '#000' }} />
                ) : type === 'audio' ? (
                  <div className="w-full p-8 sm:p-12 flex flex-col items-center gap-6 relative"
                    style={{
                      background: item.thumbnail_url
                        ? `linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)`
                        : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                      minHeight: '280px',
                    }}>
                    {item.thumbnail_url && (
                      <img src={item.thumbnail_url} alt=""
                        className="absolute inset-0 w-full h-full object-contain opacity-30 pointer-events-none" />
                    )}
                    <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center relative z-10"
                      style={{ background: 'var(--glass-bg)', border: '2px solid var(--glass-border)' }}>
                      {item.thumbnail_url ? (
                        <img src={item.thumbnail_url} alt={item.original_name || item.filename} className="w-full h-full object-cover" />
                      ) : (
                        <Music className="w-10 h-10" style={{ color: 'var(--primary)' }} />
                      )}
                    </div>
                    <audio src={item.url} controls autoPlay
                      className="w-full max-w-md relative z-10" />
                  </div>
                ) : (
                  <div className="p-12 flex flex-col items-center gap-4">
                    <FileText className="w-16 h-16" style={{ color: 'var(--text-info)' }} />
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-sm underline" style={{ color: 'var(--primary)' }}>
                      打开文件
                    </a>
                  </div>
                )}
              </div>

              {/* Info bar */}
              <div className="w-full mt-3 flex items-center justify-between px-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium truncate" style={{ color: '#e5e7eb' }}>
                    {item.original_name || item.filename}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: '#9ca3af' }}>
                    {formatSize(item.size)}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: '#9ca3af' }}>
                    {item.mime_type}
                  </span>
                </div>
                <a href={item.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs p-1.5 rounded transition-colors hover:bg-white/10 flex-shrink-0"
                  style={{ color: '#9ca3af' }}>
                  <ExternalLink className="w-3.5 h-3.5" />
                  {SITE_URL}{item.url}
                </a>
              </div>
            </div>
          </div>
        );
      })()}
      {openLinksId && (() => {
        const item = items.find(i => i.id === openLinksId);
        if (!item) return null;
        return (
          <FloatingPopover anchorRef={linksAnchorRef} width={320}
            onClose={() => { setOpenLinksId(null); setOpenLinksEl(null); }}>
            <CopyPopoverContent item={item} />
          </FloatingPopover>
        );
      })()}
      {editingTagsId && (() => {
        const item = items.find(i => i.id === editingTagsId);
        if (!item) return null;
        return (
          <FloatingPopover anchorRef={tagsAnchorRef} width={240}
            onClose={() => { setEditingTagsId(null); setEditingTagsEl(null); }}>
            <TagEditorContent item={item} />
          </FloatingPopover>
        );
      })()}
      {showBatchTag && (() => {
        return (
          <FloatingPopover anchorRef={batchTagBtnRef} width={240}
            onClose={() => { setShowBatchTag(false); setPendingBatchTagIds([]); }}>
            <div className="p-3">
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-info)' }}>批量添加标签</div>
              {mediaTags.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>暂无标签</p>
              ) : (
                <div className="space-y-1.5">
                  {mediaTags.map(tag => {
                    const active = pendingBatchTagIds.includes(tag.id);
                    return (
                      <button key={tag.id} onClick={() => setPendingBatchTagIds(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs transition-colors text-left"
                        style={{
                          background: active ? 'var(--primary-sub)' : 'transparent',
                          color: active ? 'var(--primary)' : 'var(--text-secondary)',
                        }}>
                        <div className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0"
                          style={{ borderColor: active ? 'var(--primary)' : 'var(--border-color)', background: active ? 'var(--primary)' : 'transparent' }}>
                          {active && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-end gap-2 mt-3 pt-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
                <button onClick={() => { setShowBatchTag(false); setPendingBatchTagIds([]); }}
                  className="px-3 py-1.5 rounded-lg text-xs btn-glass" style={{ color: 'var(--text-secondary)' }}>取消</button>
                <button onClick={async () => {
                  try {
                    await api.admin.media.batchUpdateTags(Array.from(selectedIds), pendingBatchTagIds);
                    setSelectedIds(new Set());
                    setShowBatchTag(false);
                    setPendingBatchTagIds([]);
                    load();
                  } catch { /* empty */ }
                }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--primary)' }}>确认</button>
              </div>
            </div>
          </FloatingPopover>
        );
      })()}

      {/* Metadata editor modal */}
      {editingMetadataItem && (() => {
        const item = editingMetadataItem;
        const type = getMediaType(item.mime_type);
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setEditingMetadataItem(null)}>
            <div className="w-full max-w-lg rounded-xl p-5 space-y-4 glass-card"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>编辑元信息</h3>
                <button onClick={() => setEditingMetadataItem(null)} className="p-1 rounded hover:bg-white/10">
                  <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>

              <div className="space-y-3">
                {/* Cover image */}
                <div className="pb-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>封面图</label>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0"
                      style={{ background: 'var(--surface-bg)', border: '1px dashed var(--glass-border)' }}>
                      {metadataForm.thumbnail_url ? (
                        <img key={metadataForm.thumbnail_url} src={metadataForm.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Image className="w-7 h-7" style={{ color: 'var(--text-info)' }} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.original_name || item.filename}</p>
                      <p className="text-xs" style={{ color: 'var(--text-info)' }}>{item.mime_type} · {formatSize(item.size)}</p>
                      <div className="pt-1">
                        <MediaField
                          value={metadataForm.thumbnail_url}
                          onChange={(url) => setMetadataForm(p => ({ ...p, thumbnail_url: url }))}
                          filterType="image"
                          previewSize={0}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>标题</label>
                  <input type="text" value={metadataForm.title}
                    onChange={e => setMetadataForm(p => ({ ...p, title: e.target.value }))}
                    placeholder={type === 'audio' ? '歌曲名' : type === 'video' ? '视频标题' : '标题'}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none glass-card"
                    style={{ color: 'var(--text-primary)' }} />
                </div>

                {/* Artist */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>作者</label>
                  <input type="text" value={metadataForm.artist}
                    onChange={e => setMetadataForm(p => ({ ...p, artist: e.target.value }))}
                    placeholder={type === 'audio' ? '歌手/乐队名' : '视频作者'}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none glass-card"
                    style={{ color: 'var(--text-primary)' }} />
                </div>

                {/* Album */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>专辑</label>
                  <input type="text" value={metadataForm.album}
                    onChange={e => setMetadataForm(p => ({ ...p, album: e.target.value }))}
                    placeholder="专辑名"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none glass-card"
                    style={{ color: 'var(--text-primary)' }} />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>描述</label>
                  <textarea value={metadataForm.description}
                    onChange={e => setMetadataForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="简要描述"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none glass-card resize-none"
                    style={{ color: 'var(--text-primary)' }} />
                </div>

                {/* Gallery toggle */}
                {item.mime_type?.startsWith('image/') && (
                  <div className="flex items-center justify-between py-2" style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <div>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>图片馆展示</span>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-info)' }}>关闭则不在图片馆中显示此图</p>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const res = await api.admin.gallery.toggle(item.url, item.original_name || item.filename);
                          setGalleryUrls(prev => {
                            const next = new Set(prev);
                            if (res.in_gallery) next.add(item.url);
                            else next.delete(item.url);
                            return next;
                          });
                        } catch { /* empty */ }
                      }}
                      className={`relative w-11 h-6 rounded-full transition-colors ${galleryUrls.has(item.url) ? 'bg-green-500' : 'bg-gray-600'}`}
                      role="switch"
                      aria-checked={galleryUrls.has(item.url)}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${galleryUrls.has(item.url) ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditingMetadataItem(null)}
                  className="px-4 py-2 rounded-lg text-sm btn-glass" style={{ color: 'var(--text-secondary)' }}>取消</button>
                <button onClick={handleSaveMetadata}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>保存</button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
