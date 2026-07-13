'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Loading } from '@/components/Loading';
import { MediaPickerModal } from '@/components/MediaField';
import { Plus, Trash2, ArrowUp, ArrowDown, X } from 'lucide-react';

interface GalleryImage {
  id: string;
  url: string;
  title: string;
  description: string;
  width: number;
  height: number;
  sort_order: number;
}

export default function AdminGalleryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formUrl, setFormUrl] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const mediaBtnRef = useRef<HTMLButtonElement>(null);

  async function loadImages() {
    try {
      const res = await api.admin.gallery.list();
      setImages(res.items || []);
    } catch {} finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadImages(); }, []);

  function openCreate() {
    setEditingId(null);
    setFormUrl('');
    setFormTitle('');
    setFormDescription('');
    setShowDialog(true);
  }

  function openEdit(img: GalleryImage) {
    setEditingId(img.id);
    setFormUrl(img.url);
    setFormTitle(img.title || '');
    setFormDescription(img.description || '');
    setShowDialog(true);
  }

  async function handleSave() {
    if (!formUrl) return;
    try {
      if (editingId) {
        await api.admin.gallery.update(editingId, { url: formUrl, title: formTitle, description: formDescription });
      } else {
        // 从媒体库选取时自动获取宽高
        const isUpload = formUrl.startsWith('/uploads/');
        let width = 0, height = 0;
        if (isUpload || formUrl.includes('/api/v1/admin/media/')) {
          // 前端无法直接获取服务端文件宽高，设为 0 由前端 CSS 处理
        }
        await api.admin.gallery.create({ url: formUrl, title: formTitle, description: formDescription, width, height });
      }
      setShowDialog(false);
      loadImages();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除这张图片？')) return;
    try {
      await api.admin.gallery.delete(id);
      loadImages();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= images.length) return;
    const items = images.map((img, i) => ({
      id: img.id,
      sort_order: i === index ? images[newIndex].sort_order : i === newIndex ? images[index].sort_order : img.sort_order,
    }));
    // 先交换内存中的 sort_order
    const updated = [...images];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setImages(updated);
    try {
      await api.admin.gallery.reorder(items);
    } catch {
      loadImages();
    }
  }

  if (loading) return <Loading />;

  const inputStyle: React.CSSProperties = {
    background: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="page-transition">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>图片馆</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-info)' }}>共 {images.length} 张图片</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ background: 'var(--primary)', boxShadow: '0 0 12px var(--primary-glow)' }}>
          <Plus className="w-4 h-4" />
          添加图片
        </button>
      </div>

      {images.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--text-info)' }}>
          还没有图片，点击右上角添加
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {images.map((img, index) => (
            <div key={img.id}
              className="rounded-xl overflow-hidden card-base group"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)' }}>
              <div className="aspect-[4/3] overflow-hidden cursor-pointer" onClick={() => openEdit(img)}>
                <img src={img.url} alt={img.title || '图片'}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
              </div>
              <div className="p-3">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {img.title || '无标题'}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex gap-1">
                    <button onClick={() => handleMove(index, -1)}
                      className="p-1 rounded-lg btn-glass transition-colors disabled:opacity-30"
                      disabled={index === 0}
                      style={{ color: 'var(--text-info)' }}>
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleMove(index, 1)}
                      className="p-1 rounded-lg btn-glass transition-colors disabled:opacity-30"
                      disabled={index === images.length - 1}
                      style={{ color: 'var(--text-info)' }}>
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button onClick={() => handleDelete(img.id)}
                    className="p-1 rounded-lg btn-glass transition-colors hover:bg-red-500/20"
                    style={{ color: 'var(--color-error)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {showDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDialog(false); }}>
          <div className="rounded-2xl w-full max-w-lg p-6 animate-fade-scale-in"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--glass-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                {editingId ? '编辑图片' : '添加图片'}
              </h2>
              <button onClick={() => setShowDialog(false)}
                className="p-1.5 rounded-lg btn-glass" style={{ color: 'var(--text-info)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-info)' }}>图片 URL</label>
                <div className="flex gap-2">
                  <input type="text" value={formUrl} onChange={e => setFormUrl(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                    style={inputStyle}
                    placeholder="输入图片地址" />
                  <button ref={mediaBtnRef} onClick={() => setShowMediaPicker(true)}
                    className="px-3 py-2 rounded-xl btn-glass text-sm whitespace-nowrap"
                    style={{ color: 'var(--text-secondary)' }}>
                    媒体库
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-info)' }}>标题</label>
                <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                  style={inputStyle}
                  placeholder="图片标题（可选）" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-info)' }}>描述</label>
                <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={3}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                  style={inputStyle}
                  placeholder="图片描述（可选）" />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowDialog(false)}
                className="px-4 py-2 rounded-xl text-sm btn-glass" style={{ color: 'var(--text-secondary)' }}>
                取消
              </button>
              <button onClick={handleSave}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--primary)', boxShadow: '0 0 12px var(--primary-glow)' }}
                disabled={!formUrl}>
                {editingId ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 媒体库选择器 */}
      {showMediaPicker && (
        <MediaPickerModal
          filterType="image"
          triggerRect={mediaBtnRef.current?.getBoundingClientRect()}
          onSelect={(url: string) => {
            setFormUrl(url);
            setShowMediaPicker(false);
          }}
          onClose={() => setShowMediaPicker(false)}
        />
      )}
    </div>
  );
}
