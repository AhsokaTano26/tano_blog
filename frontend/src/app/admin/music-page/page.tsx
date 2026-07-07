'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Save, Music, Plus, Trash2, ArrowUp, ArrowDown, Image, Headphones, X } from 'lucide-react';
import { Loading } from '@/components/Loading';
import { MediaPickerModal } from '@/components/MediaField';

interface Track {
  title: string;
  artist?: string;
  url: string;
  cover?: string;
  background?: string;
}

interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}

interface MusicPageConfig {
  title: string;
  subtitle: string;
  background: string;
  playlists: Playlist[];
}

const defaultConfig: MusicPageConfig = {
  title: '音乐馆',
  subtitle: '享受音乐的时光',
  background: '',
  playlists: [],
};

export default function AdminMusicPage() {
  const [configStr, setConfigStr] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'settings' | 'playlists'>('settings');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  useEffect(() => {
    api.admin.config.get().then(res => {
      setConfigStr(res.config?.music_page_config || '');
    }).finally(() => setLoading(false));
  }, []);

  // Migrate old format (playlist) to new format (playlists)
  const config: MusicPageConfig = (() => {
    try {
      const parsed = JSON.parse(configStr || '{}');
      if (!parsed.playlists && Array.isArray(parsed.playlist)) {
        parsed.playlists = parsed.playlist.length > 0
          ? [{ id: 'default', name: '默认播放列表', tracks: parsed.playlist }]
          : [];
        delete parsed.playlist;
      }
      return { ...defaultConfig, ...parsed };
    } catch { return defaultConfig; }
  })();

  function updateField<K extends keyof MusicPageConfig>(key: K, value: MusicPageConfig[K]) {
    const updated = { ...config, [key]: value };
    setConfigStr(JSON.stringify(updated));
  }

  // Playlist CRUD
  function addPlaylist() {
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const newPl: Playlist = { id, name: `播放列表 ${config.playlists.length + 1}`, tracks: [] };
    updateField('playlists', [...config.playlists, newPl]);
  }

  function renamePlaylist(id: string, name: string) {
    updateField('playlists', config.playlists.map(pl => pl.id === id ? { ...pl, name } : pl));
  }

  function removePlaylist(id: string) {
    if (selectedPlaylistId === id) setSelectedPlaylistId(null);
    updateField('playlists', config.playlists.filter(pl => pl.id !== id));
  }

  // Track CRUD within a playlist
  function addTrackToPlaylist(plId: string) {
    updateField('playlists', config.playlists.map(pl =>
      pl.id === plId ? { ...pl, tracks: [...pl.tracks, { title: '', artist: '', url: '', cover: '', background: '' }] } : pl
    ));
  }

  function updateTrackInPlaylist(plId: string, trackIndex: number, updates: Partial<Track>) {
    updateField('playlists', config.playlists.map(pl =>
      pl.id === plId ? {
        ...pl,
        tracks: pl.tracks.map((t, i) => i === trackIndex ? { ...t, ...updates } : t)
      } : pl
    ));
  }

  function removeTrackFromPlaylist(plId: string, trackIndex: number) {
    updateField('playlists', config.playlists.map(pl =>
      pl.id === plId ? { ...pl, tracks: pl.tracks.filter((_, i) => i !== trackIndex) } : pl
    ));
  }

  function moveTrackInPlaylist(plId: string, trackIndex: number, dir: -1 | 1) {
    updateField('playlists', config.playlists.map(pl => {
      if (pl.id !== plId) return pl;
      const tracks = [...pl.tracks];
      const j = trackIndex + dir;
      if (j < 0 || j >= tracks.length) return pl;
      [tracks[trackIndex], tracks[j]] = [tracks[j], tracks[trackIndex]];
      return { ...pl, tracks };
    }));
  }

  // Parse filename to extract title and artist
  function parseFilename(name: string): { title: string; artist: string } {
    let clean = name.replace(/\.(mp3|wav|ogg|flac|aac|m4a|wma|opus)$/i, '').trim();
    const sepMatch = clean.match(/^(.+?)\s*[–—-]\s*(.+)$/);
    if (sepMatch) {
      return { title: sepMatch[2].trim(), artist: sepMatch[1].trim() };
    }
    return { title: clean, artist: '' };
  }

  function autoFillTrack(plId: string, index: number, url: string, originalName?: string, thumbnailUrl?: string) {
    const pl = config.playlists.find(p => p.id === plId);
    if (!pl) return;
    const track = pl.tracks[index];
    if (!track) return;
    const updates: Partial<Track> = { url };
    if (originalName && !track.title) {
      const { title, artist } = parseFilename(originalName);
      updates.title = title;
      if (artist && !track.artist) updates.artist = artist;
    }
    if (thumbnailUrl && !track.cover) {
      updates.cover = thumbnailUrl;
    }
    updateTrackInPlaylist(plId, index, updates);
  }

  // Media picker state for page settings (background)
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const bgPickerBtnRef = useRef<HTMLButtonElement>(null);

  // Media picker state for track detail dialog
  const [trackPickerTarget, setTrackPickerTarget] = useState<{
    playlistId: string;
    index: number;
    field: 'cover' | 'url' | 'background';
    anchorRect?: DOMRect;
  } | null>(null);

  // Track detail dialog state
  const [editingTrack, setEditingTrack] = useState<{ playlistId: string; index: number } | null>(null);

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

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-0.5 rounded-xl w-fit" style={{ background: 'var(--surface-bg)' }}>
        <button onClick={() => setActiveTab('settings')}
          className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: activeTab === 'settings' ? 'var(--card-bg)' : 'transparent',
            color: activeTab === 'settings' ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: activeTab === 'settings' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
          }}>
          页面设置
        </button>
        <button onClick={() => setActiveTab('playlists')}
          className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: activeTab === 'playlists' ? 'var(--card-bg)' : 'transparent',
            color: activeTab === 'playlists' ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: activeTab === 'playlists' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
          }}>
          播放列表管理
        </button>
      </div>

      {activeTab === 'settings' && (
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
              <button ref={bgPickerBtnRef} onClick={() => setBgPickerOpen(true)}
                className="px-3 py-2 rounded-lg text-sm btn-glass whitespace-nowrap flex-shrink-0"
                style={{ color: 'var(--text-secondary)' }}>
                <Image className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-info)' }}>设置后将作为页面背景，上方叠加渐变色效果。各歌曲可单独设置背景图覆盖此项</p>
          </div>
        </div>
      )}

      {activeTab === 'playlists' && (
        <div className="glass-card rounded-xl p-6 max-w-3xl">
          {/* New playlist button */}
          <button onClick={addPlaylist}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white mb-4 transition-colors hover:opacity-90"
            style={{ background: 'var(--primary)' }}>
            <Plus className="w-4 h-4" />
            新建播放列表
          </button>

          {config.playlists.length === 0 ? (
            <div className="text-center py-14 rounded-xl" style={{ background: 'var(--surface-bg)' }}>
              <Music className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-info)' }} />
              <p className="text-sm" style={{ color: 'var(--text-info)' }}>暂无播放列表</p>
              <button onClick={addPlaylist}
                className="mt-3 px-4 py-2 rounded-lg text-sm transition-colors text-white" style={{ background: 'var(--primary)' }}>
                <Plus className="w-4 h-4 inline mr-1" />创建第一个播放列表
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {config.playlists.map(pl => (
                <div key={pl.id} className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--glass-border)' }}>
                  {/* Playlist header */}
                  <div
                    onClick={() => setSelectedPlaylistId(selectedPlaylistId === pl.id ? null : pl.id)}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer transition-colors"
                    style={{ background: selectedPlaylistId === pl.id ? 'var(--primary-sub)' : 'var(--surface-bg)' }}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Music className="w-4 h-4 flex-shrink-0" style={{ color: selectedPlaylistId === pl.id ? 'var(--primary)' : 'var(--text-info)' }} />
                      <input value={pl.name}
                        onClick={e => e.stopPropagation()}
                        onChange={e => renamePlaylist(pl.id, e.target.value)}
                        className="text-sm font-medium bg-transparent outline-none border-0 flex-1 min-w-0"
                        style={{ color: 'var(--text-primary)' }} />
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs" style={{ color: 'var(--text-info)' }}>
                        {pl.tracks.length} 首
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); removePlaylist(pl.id); }}
                        className="p-1 rounded transition-colors hover:bg-red-500/10"
                        style={{ color: 'var(--color-error)' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded track list */}
                  {selectedPlaylistId === pl.id && (
                    <div style={{ borderTop: '1px solid var(--glass-border)' }}>
                      {/* Table header */}
                      <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium"
                        style={{ color: 'var(--text-info)', background: 'var(--surface-bg)' }}>
                        <span className="w-8 text-center flex-shrink-0">#</span>
                        <span className="flex-1 min-w-0">标题</span>
                        <span className="w-28 hidden sm:block flex-shrink-0">艺术家</span>
                        <span className="w-24 text-right flex-shrink-0">操作</span>
                      </div>

                      {pl.tracks.map((track, ti) => (
                        <div key={ti}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer transition-colors hover:opacity-80"
                          style={{ borderBottom: ti < pl.tracks.length - 1 ? '1px solid var(--glass-border)' : 'none' }}
                          onClick={() => setEditingTrack({ playlistId: pl.id, index: ti })}>
                          <span className="w-8 text-center text-xs flex-shrink-0" style={{ color: 'var(--text-info)' }}>{ti + 1}</span>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            {track.cover ? (
                              <img src={track.cover} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                                style={{ background: 'var(--surface-bg)' }}>
                                <Music className="w-4 h-4" style={{ color: 'var(--text-info)' }} />
                              </div>
                            )}
                            <span className="truncate" style={{ color: track.title ? 'var(--text-primary)' : 'var(--text-info)' }}>
                              {track.title || '(未命名)'}
                            </span>
                          </div>
                          <span className="w-28 hidden sm:block truncate flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                            {track.artist || '-'}
                          </span>
                          <div className="w-24 flex justify-end gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <button onClick={() => moveTrackInPlaylist(pl.id, ti, -1)} disabled={ti === 0}
                              className="p-1 rounded transition-colors disabled:opacity-30 hover:bg-white/10"
                              style={{ color: 'var(--text-info)' }}>
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => moveTrackInPlaylist(pl.id, ti, 1)} disabled={ti === pl.tracks.length - 1}
                              className="p-1 rounded transition-colors disabled:opacity-30 hover:bg-white/10"
                              style={{ color: 'var(--text-info)' }}>
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => removeTrackFromPlaylist(pl.id, ti)}
                              className="p-1 rounded transition-colors hover:bg-red-500/10"
                              style={{ color: 'var(--color-error)' }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Add track button */}
                      <button onClick={() => addTrackToPlaylist(pl.id)}
                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm transition-colors btn-glass hover:bg-white/10"
                        style={{ color: 'var(--text-secondary)' }}>
                        <Plus className="w-4 h-4" />
                        添加歌曲
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save button */}
      <div className="mt-6 pt-4 max-w-3xl" style={{ borderTop: '1px solid var(--glass-border)' }}>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
          style={{ background: 'var(--primary)' }}>
          <Save className="w-4 h-4" />
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>

      {/* Media picker for page background */}
      {bgPickerOpen && (
        <MediaPickerModal
          triggerRect={bgPickerBtnRef.current?.getBoundingClientRect()}
          onSelect={(url) => {
            updateField('background', url);
            setBgPickerOpen(false);
          }}
          onClose={() => setBgPickerOpen(false)}
        />
      )}

      {/* Media picker for track detail dialog */}
      {trackPickerTarget && (
        <MediaPickerModal
          triggerRect={trackPickerTarget.anchorRect}
          onSelect={(url, originalName, thumbnailUrl) => {
            if (trackPickerTarget.field === 'url') {
              autoFillTrack(trackPickerTarget.playlistId, trackPickerTarget.index, url, originalName, thumbnailUrl);
            } else {
              updateTrackInPlaylist(trackPickerTarget.playlistId, trackPickerTarget.index, { [trackPickerTarget.field]: url });
            }
            setTrackPickerTarget(null);
          }}
          onClose={() => setTrackPickerTarget(null)}
        />
      )}

      {/* Track detail dialog */}
      {editingTrack && (() => {
        const pl = config.playlists.find(p => p.id === editingTrack.playlistId);
        const track = pl?.tracks[editingTrack.index];
        if (!track) return null;

        const update = (field: keyof Track, value: string) => {
          updateTrackInPlaylist(editingTrack.playlistId, editingTrack.index, { [field]: value });
        };

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setEditingTrack(null); }}>
            <div className="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col animate-fade-scale-in"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--glass-border)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                maxHeight: '85vh',
              }}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3 flex-shrink-0"
                style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  歌曲详情
                </h2>
                <button onClick={() => setEditingTrack(null)}
                  className="p-1.5 rounded-lg transition-colors btn-glass">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto p-6 space-y-4 flex-1">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>歌曲标题</label>
                  <input type="text" value={track.title || ''}
                    onChange={e => update('title', e.target.value)}
                    placeholder="输入歌曲标题"
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>艺术家</label>
                  <input type="text" value={track.artist || ''}
                    onChange={e => update('artist', e.target.value)}
                    placeholder="选填"
                    className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>封面图</label>
                  <div className="flex items-center gap-2">
                    {track.cover && (
                      <img src={track.cover} alt="cover" className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <input type="text" value={track.cover || ''}
                      onChange={e => update('cover', e.target.value)}
                      placeholder="封面图 URL"
                      className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
                      style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
                    <button onClick={() => setTrackPickerTarget({
                      playlistId: editingTrack.playlistId,
                      index: editingTrack.index,
                      field: 'cover',
                      anchorRect: undefined,
                    })}
                      className="px-3 py-2.5 rounded-lg text-sm btn-glass flex-shrink-0"
                      style={{ color: 'var(--text-secondary)' }}>
                      <Image className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>音频文件</label>
                  <div className="flex items-center gap-2">
                    <input type="text" value={track.url}
                      onChange={e => update('url', e.target.value)}
                      placeholder="音频 URL"
                      className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
                      style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
                    <button onClick={() => setTrackPickerTarget({
                      playlistId: editingTrack.playlistId,
                      index: editingTrack.index,
                      field: 'url',
                      anchorRect: undefined,
                    })}
                      className="px-3 py-2.5 rounded-lg text-sm btn-glass flex-shrink-0"
                      style={{ color: 'var(--text-secondary)' }}>
                      <Headphones className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>单独背景图（选填）</label>
                  <div className="flex items-center gap-2">
                    {track.background && (
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"
                        style={{ border: '1px solid var(--glass-border)' }}>
                        <img src={track.background} alt="bg" className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    )}
                    <input type="text" value={track.background || ''}
                      onChange={e => update('background', e.target.value)}
                      placeholder="播放此曲时显示此背景（选填）"
                      className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
                      style={{ border: '1px solid var(--glass-border)', background: 'var(--surface-bg)', color: 'var(--text-primary)' }} />
                    <button onClick={() => setTrackPickerTarget({
                      playlistId: editingTrack.playlistId,
                      index: editingTrack.index,
                      field: 'background',
                      anchorRect: undefined,
                    })}
                      className="px-3 py-2.5 rounded-lg text-sm btn-glass flex-shrink-0"
                      style={{ color: 'var(--text-secondary)' }}>
                      <Image className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 px-6 py-4 flex-shrink-0"
                style={{ borderTop: '1px solid var(--glass-border)' }}>
                <button onClick={() => setEditingTrack(null)}
                  className="px-4 py-2 rounded-lg text-sm btn-glass"
                  style={{ color: 'var(--text-secondary)' }}>关闭</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
