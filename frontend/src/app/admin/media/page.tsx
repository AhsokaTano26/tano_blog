'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Image, Upload, Trash2, Copy, Check, Grid, List } from 'lucide-react';

export default function AdminMedia() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  async function load() {
    setLoading(true);
    try { const res = await api.admin.media.list({ page: '1', page_size: '50' }); setItems(res.items); }
    catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.admin.media.upload(file);
      load();
    } catch (err) { console.error(err); }
    setUploading(false);
    e.target.value = '';
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除此文件？')) return;
    await api.admin.media.delete(id);
    load();
  }

  function copyUrl(url: string, id: string) {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>附件</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg p-0.5" style={{ background: 'var(--surface-bg)' }}>
            <button onClick={() => setViewMode('grid')}
              className="p-1.5 rounded transition-colors"
              style={{
                background: viewMode === 'grid' ? 'var(--card-bg)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}>
              <Grid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')}
              className="p-1.5 rounded transition-colors"
              style={{
                background: viewMode === 'list' ? 'var(--card-bg)' : 'transparent',
                color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}>
              <List className="w-4 h-4" />
            </button>
          </div>
          <label className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer transition-colors ${uploading ? 'opacity-50' : ''}`}
            style={{ background: 'var(--primary)' }}>
            <Upload className="w-4 h-4" />
            {uploading ? '上传中...' : '上传'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
          <div className="animate-spin w-8 h-8 border-4 rounded-full mx-auto mb-4" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
          加载中...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 glass-card rounded-xl" style={{ color: 'var(--text-secondary)' }}>
          <Image className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-info)' }} />
          <p>暂无文件</p>
          <label className="mt-3 inline-flex items-center gap-1.5 hover:underline text-sm cursor-pointer" style={{ color: 'var(--primary)' }}>
            <Upload className="w-4 h-4" />
            上传第一个文件
            <input type="file" className="hidden" onChange={handleUpload} />
          </label>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {items.map((item) => (
            <div key={item.id} className="glass-card rounded-xl overflow-hidden group">
              <div className="relative aspect-square" style={{ background: 'var(--surface-bg)' }}>
                {item.mime_type?.startsWith('image/') ? (
                  <img src={item.url} alt={item.original_name || item.filename}
                    className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--text-info)' }}>
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <button onClick={() => copyUrl(item.url, item.id)}
                    className="p-1.5 rounded-full transition-colors" style={{ background: 'var(--card-bg)', color: 'var(--text-primary)' }} title="复制 URL">
                    {copiedId === item.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded-full transition-colors" style={{ background: 'var(--card-bg)', color: 'var(--text-primary)' }} title="删除">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-2.5">
                <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }} title={item.original_name || item.filename}>
                  {item.original_name || item.filename}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-info)' }}>{item.size ? formatSize(item.size) : ''}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-12" style={{ color: 'var(--text-secondary)' }}></th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>文件名</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-32" style={{ color: 'var(--text-secondary)' }}>类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider w-24" style={{ color: 'var(--text-secondary)' }}>大小</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider w-32" style={{ color: 'var(--text-secondary)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="transition-colors" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td className="px-4 py-3">
                    {item.mime_type?.startsWith('image/') ? (
                      <img src={item.url} alt="" className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: 'var(--surface-bg)' }}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-info)' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }} title={item.original_name || item.filename}>
                    {item.original_name || item.filename}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{item.mime_type || '-'}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{item.size ? formatSize(item.size) : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => copyUrl(item.url, item.id)}
                        className="btn-glass p-1.5 rounded transition-colors" title="复制 URL">
                        {copiedId === item.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDelete(item.id)}
                        className="btn-glass p-1.5 rounded transition-colors" title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
