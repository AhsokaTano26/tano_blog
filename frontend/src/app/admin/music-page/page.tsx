'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Save, Music, Plus, Trash2, ArrowUp, ArrowDown, Image, Headphones } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { MediaPickerModal } from '@/components/MediaField';

interface MusicPageConfig {
  title: string;
  subtitle: string;
  background: string;
  playlist: Track[];
}

interface Track {
  title: string;
  artist?: string;
  url: string;
  cover?: string;
  background?: string;
}

const defaultConfig: MusicPageConfig = {
  title: '音乐馆',
  subtitle: '享受音乐的时光',
  background: '',
  playlist: [],
};

export default function AdminMusicPage() {
  const [configStr, setConfigStr] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.admin.config.get().then(res => {
      setConfigStr(res.config?.music_page_config || '');
    }).finally(() => setLoading(false));
  }, []);

  const config: MusicPageConfig = (() => {
    try { return { ...defaultConfig, ...JSON.parse(configStr || '{}') }; } catch { return defaultConfig; }
  })();

  function updateField<K extends keyof MusicPageConfig>(key: K, value: MusicPageConfig[K]) {
    const updated = { ...config, [key]: value };
    setConfigStr(JSON.stringify(updated));
  }

  function updateTrack(i: number, field: keyof Track, val: string) {
    const p = [...config.playlist];
    p[i] = { ...p[i], [field]: val };
    updateField('playlist', p);
  }

  function addTrack() {
    updateField('playlist', [...config.playlist, { title: '', artist: '', url: '', cover: '', background: '' }]);
  }

  // Parse filename to extract title and artist
  // Supported formats: "Artist - Title.mp3", "Artist – Title.mp3", "Title.mp3"
  function parseFilename(name: string): { title: string; artist: string } {
    let clean = name.replace(/\.(mp3|wav|ogg|flac|aac|m4a|wma|opus)$/i, '').trim();
    // Try "Artist - Title" or "Artist – Title" (em dash, en dash)
    const sepMatch = clean.match(/^(.+?)\s*[–—-]\s*(.+)$/);
    if (sepMatch) {
      return { title: sepMatch[2].trim(), artist: sepMatch[1].trim() };
    }
    return { title: clean, artist: '' };
  }

  function autoFillTrack(i: number, url: string, originalName?: string, thumbnailUrl?: string) {
    const p = [...config.playlist];
    p[i] = { ...p[i], url };
    // Only auto-fill if title is empty (don't overwrite user input)
    if (originalName && !p[i].title) {
      const { title, artist } = parseFilename(originalName);
      p[i].title = title;
      if (artist && !p[i].artist) p[i].artist = artist;
    }
    // Auto-fill cover from audio thumbnail if cover not already set
    if (thumbnailUrl && !p[i].cover) {
      p[i].cover = thumbnailUrl;
    }
    updateField('playlist', p);
  }

  function removeTrack(i: number) {
    updateField('playlist', config.playlist.filter((_, idx) => idx !== i));
  }

  function moveTrack(i: number, dir: -1 | 1) {
    const next = [...config.playlist];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    updateField('playlist', next);
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      await api.admin.config.update({ music_page_config: configStr });
      const res = await api.admin.config.get();
      setConfigStr(res.config?.music_page_config || '');
      setMessage('已保存');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('保存失败');
    }
    setSaving(false);
  }

  // Media picker state
  const [pickerTarget, setPickerTarget] = useState<{ index: number; field: 'url' | 'cover' | 'background' } | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{ index: number; field: 'url' | 'cover' | 'background' } | null>(null);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    const { index, field } = uploadTarget;
    try {
      const res = await api.admin.media.upload(file);
      const url = res.media?.url;
      if (url) updateTrack(index, field, url);
    } catch (err) {
      console.error('Upload failed', err);
    }
    setUploadTarget(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const inputClass = "w-full px-3 py-2.5 rounded-lg text-sm outline-none";
  const inputStyle = { border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' };

  if (loading) return <Loading />;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Music className="w-5 h-5" style={{ color: 'var(--primary)' }} />
          音乐馆
        </h1>
      </div>

      {message && (
        <div className="mb-4 px-4 py-2.5 rounded-lg text-sm glass-card"
          style={{ color: message.includes('失败') ? 'hsl(0, 60%, 55%)' : 'hsl(142, 60%, 50%)' }}>
          {message}
        </div>
      )}

      <div className="glass-card rounded-xl p-6 space-y-6 max-w-3xl">
        {/* Page title */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>页面标题</label>
          <input type="text" value={config.title}
            onChange={e => updateField('title', e.target.value)}
            placeholder="音乐馆"
            className={inputClass} style={inputStyle} />
        </div>

        {/* Page subtitle */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>页面副标题</label>
          <input type="text" value={config.subtitle}
            onChange={e => updateField('subtitle', e.target.value)}
            placeholder="享受音乐的时光"
            className={inputClass} style={inputStyle} />
          <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>显示在音乐馆页面顶部</p>
        </div>

        {/* Page background */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>页面背景图</label>
          <div className="flex items-center gap-2">
            {config.background && (
              <div className="w-16 h-10 rounded-lg overflow-hidden flex-shrink-0"
                style={{ border: '1px solid var(--glass-border)' }}>
                <img src={config.background} alt="bg"
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            )}
            <input type="text" value={config.background}
              onChange={e => updateField('background', e.target.value)}
              placeholder="背景图片 URL（选填）"
              className={`${inputClass} flex-1`} style={inputStyle} />
            <button onClick={() => setBgPickerOpen(true)}
              className="px-3 py-2 rounded-lg text-sm btn-glass whitespace-nowrap flex-shrink-0"
              style={{ color: 'var(--text-secondary)' }}>
              <Image className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>设置后将作为页面背景，上方叠加渐变色效果。各歌曲可单独设置背景图覆盖此项</p>
        </div>

        {/* Playlist */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>播放列表</label>
            <span className="text-xs" style={{ color: 'var(--text-info)' }}>{config.playlist.length} 首歌曲</span>
          </div>

          {config.playlist.length === 0 && (
            <div className="text-center py-10 rounded-xl" style={{ background: 'var(--surface-bg)' }}>
              <Music className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-info)' }} />
              <p className="text-sm" style={{ color: 'var(--text-info)' }}>暂无歌曲</p>
              <button onClick={addTrack} className="mt-3 px-4 py-2 rounded-lg text-sm transition-colors text-white" style={{ background: 'var(--primary)' }}>
                <Plus className="w-4 h-4 inline mr-1" />添加第一首歌
              </button>
            </div>
          )}

          <div className="space-y-3">
            {config.playlist.map((track, i) => (
              <div key={i} className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--surface-bg)', border: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium w-6 text-center flex-shrink-0" style={{ color: 'var(--text-info)' }}>
                    #{i + 1}
                  </span>
                  <input type="text" value={track.title}
                    onChange={e => updateTrack(i, 'title', e.target.value)}
                    placeholder="歌曲标题"
                    className={`${inputClass} flex-1`} style={inputStyle} />
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => moveTrack(i, -1)} disabled={i === 0}
                      className="p-1.5 rounded-lg transition-colors disabled:opacity-30 hover:bg-white/10"
                      style={{ color: 'var(--text-info)' }} title="上移">
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button onClick={() => moveTrack(i, 1)} disabled={i === config.playlist.length - 1}
                      className="p-1.5 rounded-lg transition-colors disabled:opacity-30 hover:bg-white/10"
                      style={{ color: 'var(--text-info)' }} title="下移">
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button onClick={() => removeTrack(i)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                      style={{ color: 'var(--color-error)' }} title="删除">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <input type="text" value={track.artist || ''}
                  onChange={e => updateTrack(i, 'artist', e.target.value)}
                  placeholder="艺术家（选填）"
                  className={inputClass} style={inputStyle} />

                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-info)' }}>封面图</label>
                  <div className="flex items-center gap-2">
                    {track.cover && (
                      <img src={track.cover} alt="cover"
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <input type="text" value={track.cover || ''}
                      onChange={e => updateTrack(i, 'cover', e.target.value)}
                      placeholder="封面图 URL（选填）"
                      className={`${inputClass} flex-1`} style={inputStyle} />
                    <button onClick={() => setPickerTarget({ index: i, field: 'cover' })}
                      className="px-3 py-2 rounded-lg text-sm btn-glass whitespace-nowrap flex-shrink-0"
                      style={{ color: 'var(--text-secondary)' }}>
                      <Image className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setUploadTarget({ index: i, field: 'cover' }); fileInputRef.current?.click(); }}
                      className="px-3 py-2 rounded-lg text-sm text-white whitespace-nowrap flex-shrink-0"
                      style={{ background: 'var(--primary)' }}>
                      上传
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-info)' }}>音频文件</label>
                  <div className="flex items-center gap-2">
                    <input type="text" value={track.url}
                      onChange={e => updateTrack(i, 'url', e.target.value)}
                      placeholder="音频 URL（支持 mp3/wav/ogg）"
                      className={`${inputClass} flex-1`} style={inputStyle} />
                    <button onClick={() => setPickerTarget({ index: i, field: 'url' })}
                      className="px-3 py-2 rounded-lg text-sm btn-glass whitespace-nowrap flex-shrink-0"
                      style={{ color: 'var(--text-secondary)' }}>
                      <Headphones className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setUploadTarget({ index: i, field: 'url' }); fileInputRef.current?.click(); }}
                      className="px-3 py-2 rounded-lg text-sm text-white whitespace-nowrap flex-shrink-0"
                      style={{ background: 'var(--primary)' }}>
                      上传
                    </button>
                  </div>
                </div>

                {/* Per-track background */}
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-info)' }}>单独背景图（选填）</label>
                  <div className="flex items-center gap-2">
                    {track.background && (
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"
                        style={{ border: '1px solid var(--glass-border)' }}>
                        <img src={track.background} alt="bg"
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    )}
                    <input type="text" value={track.background || ''}
                      onChange={e => updateTrack(i, 'background', e.target.value)}
                      placeholder="播放此曲时显示此背景（选填）"
                      className={`${inputClass} flex-1`} style={inputStyle} />
                    <button onClick={() => setPickerTarget({ index: i, field: 'background' })}
                      className="px-3 py-2 rounded-lg text-sm btn-glass whitespace-nowrap flex-shrink-0"
                      style={{ color: 'var(--text-secondary)' }}>
                      <Image className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setUploadTarget({ index: i, field: 'background' }); fileInputRef.current?.click(); }}
                      className="px-3 py-2 rounded-lg text-sm text-white whitespace-nowrap flex-shrink-0"
                      style={{ background: 'var(--primary)' }}>
                      上传
                    </button>
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-info)' }}>留空则使用全局背景图</p>
                </div>
              </div>
            ))}
          </div>

          {config.playlist.length > 0 && (
            <button onClick={addTrack}
              className="w-full mt-3 flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-sm transition-all btn-glass hover:bg-white/10"
              style={{ color: 'var(--text-secondary)' }}>
              <Plus className="w-4 h-4" />
              添加歌曲
            </button>
          )}
        </div>

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept="audio/*,image/*"
          onChange={handleUpload} style={{ display: 'none' }} />

        {/* Media picker for tracks */}
        {pickerTarget && (
          <MediaPickerModal
            onSelect={(url, originalName, thumbnailUrl) => {
              if (pickerTarget.field === 'url') {
                autoFillTrack(pickerTarget.index, url, originalName, thumbnailUrl);
              } else {
                updateTrack(pickerTarget.index, pickerTarget.field, url);
              }
              setPickerTarget(null);
            }}
            onClose={() => setPickerTarget(null)}
          />
        )}

        {/* Media picker for global background */}
        {bgPickerOpen && (
          <MediaPickerModal
            onSelect={(url) => {
              updateField('background', url);
              setBgPickerOpen(false);
            }}
            onClose={() => setBgPickerOpen(false)}
          />
        )}

        {/* Save */}
        <div className="pt-4" style={{ borderTop: '1px solid var(--glass-border)' }}>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
            style={{ background: 'var(--primary)' }}>
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
