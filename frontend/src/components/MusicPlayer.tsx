'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  Music, Play, Pause, SkipForward, SkipBack,
  Volume2, VolumeX, ListMusic, X, ChevronDown
} from 'lucide-react';

interface Track {
  title: string;
  artist?: string;
  url: string;
  cover?: string;
}

interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}

const STORAGE_KEY = 'music_player_state';
const POS_KEY = 'music_player_pos';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { index: 0, volume: 0.5, playlistIndex: 0 };
}

function saveState(state: { index: number; volume: number; playlistIndex: number }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const pos = JSON.parse(raw);
      if (typeof pos.x === 'number' && typeof pos.y === 'number') {
        const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const h = typeof window !== 'undefined' ? window.innerHeight : 800;
        // Reset if off-screen (element is 48x48, add margin)
        if (pos.x + 48 < 0 || pos.x > w - 10 || pos.y + 48 < 0 || pos.y > h - 10) {
          return null;
        }
        return pos;
      }
    }
  } catch {}
  return null;
}

function savePos(pos: { x: number; y: number }) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {}
}

export function MusicPlayer() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [mounted, setMounted] = useState(false);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Dragging state — stores offset from initial mouse/touch to element corner
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef<{ el: HTMLElement; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);

  // Load persistent state
  useEffect(() => {
    setMounted(true);
    const saved = loadState();
    setCurrentIndex(saved.index);
    setVolume(saved.volume);
    setCurrentPlaylistIndex(saved.playlistIndex || 0);
    const savedPos = loadPos();
    if (savedPos) setDragPos(savedPos);

    api.getPublicConfig().then(res => {
      try {
        // Read from music_page_config (new structure) with fallback to music_playlist (old)
        const cfg = JSON.parse(res.config?.music_page_config || '{}');
        if (Array.isArray(cfg.playlists) && cfg.playlists.length > 0) {
          setPlaylists(cfg.playlists);
          return;
        }
      } catch {}
      try {
        const items = JSON.parse(res.config?.music_playlist || '[]');
        if (Array.isArray(items) && items.length > 0) {
          // Convert old single-playlist format
          setPlaylists([{ id: 'default', name: '默认播放列表', tracks: items }]);
        }
      } catch {}
    }).catch(() => {});
  }, []);

  // Persist drag position
  useEffect(() => {
    if (dragPos) savePos(dragPos);
  }, [dragPos]);

  const currentPlaylist = playlists[currentPlaylistIndex];
  const playlist = currentPlaylist?.tracks || [];
  const currentTrack = playlist[currentIndex] || null;

  // Persist playback state
  useEffect(() => {
    if (mounted) saveState({ index: currentIndex, volume, playlistIndex: currentPlaylistIndex });
  }, [currentIndex, volume, currentPlaylistIndex, mounted]);

  // Play when track changes
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    const targetUrl = currentTrack.url;
    if (audioRef.current.getAttribute('data-src') !== targetUrl) {
      audioRef.current.src = targetUrl;
      audioRef.current.setAttribute('data-src', targetUrl);
    }
    audioRef.current.volume = volume;
    if (playing) {
      audioRef.current.play().catch(() => setPlaying(false));
    }
  }, [currentTrack]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !currentTrack) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
    setVisible(true);
  }, [playing, currentTrack]);

  const playTrack = useCallback((index: number) => {
    setCurrentIndex(index);
    setPlaying(true);
    setVisible(true);
    setShowPlaylist(false);
  }, []);

  const startSeek = useCallback((e: React.MouseEvent) => {
    if (!audioRef.current || !duration) return;
    const bar = seekBarRef.current;
    if (!bar) return;
    const seek = (clientX: number) => {
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      if (progressRef.current) {
        progressRef.current.style.transition = 'none';
        progressRef.current.style.width = `${pct * 100}%`;
      }
      setCurrentTime(pct * duration);
    };
    seek(e.clientX);
    const onMove = (me: MouseEvent) => seek(me.clientX);
    const onUp = (me: MouseEvent) => {
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width));
      if (audioRef.current) audioRef.current.currentTime = pct * duration;
      if (progressRef.current) progressRef.current.style.transition = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [duration]);

  const next = useCallback(() => {
    if (playlist.length === 0) return;
    setCurrentIndex(i => (i + 1) % playlist.length);
    setPlaying(true);
  }, [playlist.length]);

  const prev = useCallback(() => {
    if (playlist.length === 0) return;
    setCurrentIndex(i => (i - 1 + playlist.length) % playlist.length);
    setPlaying(true);
  }, [playlist.length]);

  const handleEnded = useCallback(() => {
    if (currentIndex < playlist.length - 1) next();
    else setPlaying(false);
  }, [currentIndex, playlist.length, next]);

  const formatTime = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' && visible) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay, visible]);

  // ── Drag logic ──
  const startDrag = useCallback((e: React.MouseEvent | React.TouchEvent, el: HTMLElement, onTap?: () => void) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const rect = el.getBoundingClientRect();
    const startedAt = Date.now();
    let moved = false;

    draggingRef.current = {
      el,
      startX: clientX,
      startY: clientY,
      origX: dragPos?.x ?? rect.left,
      origY: dragPos?.y ?? rect.top,
    };

    const onMove = (me: MouseEvent | TouchEvent) => {
      if (!draggingRef.current) return;
      const cx = 'touches' in me ? me.touches[0].clientX : me.clientX;
      const cy = 'touches' in me ? me.touches[0].clientY : me.clientY;
      const dx = Math.abs(cx - draggingRef.current.startX);
      const dy = Math.abs(cy - draggingRef.current.startY);
      if (dx > 5 || dy > 5) moved = true;
      setDragPos({
        x: draggingRef.current.origX + cx - draggingRef.current.startX,
        y: draggingRef.current.origY + cy - draggingRef.current.startY,
      });
    };

    const onUp = () => {
      draggingRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      // If barely moved, treat as tap/click
      if (!moved && onTap) onTap();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  }, [dragPos]);

  // Compute position style
  const posStyle: React.CSSProperties = dragPos
    ? { position: 'fixed', left: dragPos.x, top: dragPos.y, right: 'auto', bottom: 'auto' }
    : { position: 'fixed', bottom: '24px', left: '24px', right: 'auto' };

  if (!mounted) return null;

  return (
    <>
      {/* Mini floating button when collapsed */}
      {!visible && (
        <button
          ref={(ref) => { if (ref) ref.dataset.playerBtn = 'true'; }}
          onMouseDown={(e) => startDrag(e, e.currentTarget, () => setVisible(true))}
          onTouchStart={(e) => startDrag(e, e.currentTarget, () => setVisible(true))}
          className="fixed z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110 btn-press animate-fade-in"
          style={{
            ...posStyle,
            background: 'var(--primary)',
            color: '#fff',
            boxShadow: '0 0 20px var(--primary-glow)',
            cursor: 'grab',
          }}
          title="打开音乐播放器"
        >
          <Music className="w-5 h-5" />
        </button>
      )}

      {/* Floating player window */}
      <div
        ref={windowRef}
        className={`fixed z-50 transition-[opacity,transform] duration-300 ease-out ${
          visible ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
        }`}
        style={{
          ...posStyle,
          width: '320px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: showPlaylist ? '480px' : '220px',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: '16px',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          boxShadow: '0 16px 48px -12px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Drag handle */}
        <div
          onMouseDown={(e) => windowRef.current && startDrag(e, windowRef.current)}
          onTouchStart={(e) => windowRef.current && startDrag(e, windowRef.current)}
          className="flex items-center justify-between px-4 pt-3 pb-1 select-none"
          style={{ cursor: 'grab' }}
        >
          <span className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--text-info)' }}>
            <Music className="w-3 h-3" />
            音乐播放器
          </span>
          <button onClick={() => setVisible(false)}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="p-1 rounded-lg transition-all hover:bg-white/10 btn-press"
            style={{ color: 'var(--text-info)' }}
            title="关闭">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar — draggable */}
        <div ref={seekBarRef}
          className="mx-4 mt-1 h-2 rounded-full cursor-pointer relative overflow-hidden group"
          style={{ background: 'var(--btn-card-bg)' }}
          onMouseDown={startSeek}
        >
          <div ref={progressRef}
            className="h-full rounded-full absolute left-0 top-0"
            style={{
              width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
              background: 'var(--primary)',
              boxShadow: '0 0 8px var(--primary-glow)',
            }}
          />
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              left: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
              marginLeft: '-6px',
              background: 'var(--primary)',
              boxShadow: '0 0 8px var(--primary-glow)',
            }}
          />
        </div>

        {/* Main content */}
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0"
              style={{ background: 'var(--btn-card-bg)' }}>
              {currentTrack?.cover ? (
                <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-6 h-6" style={{ color: 'var(--primary)' }} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {currentTrack?.title || '未选择歌曲'}
              </p>
              {currentTrack?.artist && (
                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-info)' }}>
                  {currentTrack.artist}
                </p>
              )}
              {duration > 0 && (
                <p className="text-[10px] mt-1 tabular-nums" style={{ color: 'var(--text-info)' }}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </p>
              )}
            </div>
            <button onClick={togglePlay}
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 btn-press"
              style={{
                background: 'var(--primary)',
                color: '#fff',
                boxShadow: '0 0 16px var(--primary-glow)',
              }}
              title={playing ? '暂停 (Space)' : '播放 (Space)'}>
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button onClick={prev}
              disabled={playlist.length === 0}
              className="p-1.5 rounded-lg transition-all hover:bg-white/10 btn-press disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: 'var(--text-secondary)' }}
              title="上一首">
              <SkipBack className="w-4 h-4" />
            </button>
            <button onClick={next}
              disabled={playlist.length === 0}
              className="p-1.5 rounded-lg transition-all hover:bg-white/10 btn-press disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: 'var(--text-secondary)' }}
              title="下一首">
              <SkipForward className="w-4 h-4" />
            </button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setVolume(v => v > 0 ? 0 : 0.5)}
                className="p-1.5 rounded-lg transition-all hover:bg-white/10 btn-press"
                style={{ color: 'var(--text-secondary)' }}
                title={volume > 0 ? '静音' : '恢复音量'}>
                {volume > 0 ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
              <input type="range" min="0" max="1" step="0.05" value={volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                className="w-16 h-1 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--primary) ${volume * 100}%, var(--btn-card-bg) ${volume * 100}%)`,
                }} />
            </div>
            <button onClick={() => setShowPlaylist(!showPlaylist)}
              className="p-1.5 rounded-lg transition-all hover:bg-white/10 btn-press relative"
              style={{ color: showPlaylist ? 'var(--primary)' : 'var(--text-secondary)' }}
              title="播放列表">
              <ListMusic className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 text-[9px] font-medium min-w-[14px] h-[14px] flex items-center justify-center rounded-full"
                style={{ background: 'var(--primary)', color: '#fff' }}>
                {playlist.length}
              </span>
            </button>
          </div>
        </div>

        {/* Playlist panel */}
        <div className={`transition-all duration-300 ease-out overflow-hidden ${showPlaylist ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-3 pb-3 space-y-0.5 max-h-52 overflow-y-auto"
            style={{ borderTop: showPlaylist ? '1px solid var(--glass-border)' : 'none' }}>
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <ChevronDown className="w-3 h-3" style={{ color: 'var(--text-info)' }} />
              {playlists.length > 1 ? (
                <select
                  value={currentPlaylistIndex}
                  onChange={e => {
                    const idx = parseInt(e.target.value);
                    setCurrentPlaylistIndex(idx);
                    setCurrentIndex(0);
                    setPlaying(false);
                    if (audioRef.current) {
                      audioRef.current.src = '';
                      audioRef.current.removeAttribute('data-src');
                    }
                  }}
                  className="text-[10px] font-medium bg-transparent border-none outline-none appearance-none cursor-pointer"
                  style={{ color: 'var(--text-info)' }}>
                  {playlists.map((pl, i) => (
                    <option key={pl.id} value={i}>{pl.name} ({pl.tracks.length}首)</option>
                  ))}
                </select>
              ) : (
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-info)' }}>
                  {currentPlaylist?.name || '播放列表'}
                </span>
              )}
            </div>
            {playlist.map((track, i) => (
              <button key={i} onClick={() => playTrack(i)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all hover:bg-white/5 group"
                style={{
                  background: i === currentIndex ? 'var(--primary-sub)' : 'transparent',
                  color: i === currentIndex ? 'var(--primary)' : 'var(--text-secondary)',
                }}>
                {track.cover ? (
                  <img src={track.cover} alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--btn-card-bg)' }}>
                    <Music className="w-3.5 h-3.5" />
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <span className="block truncate">{track.title}</span>
                </div>
                {i === currentIndex && playing
                  ? <Pause className="w-3.5 h-3.5 flex-shrink-0" />
                  : <Play className="w-3.5 h-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                }
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={handleEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        preload="none"
      />
    </>
  );
}
