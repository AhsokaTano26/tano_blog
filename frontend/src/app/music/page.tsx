'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, ListMusic, Music, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

interface Track {
  title: string;
  artist?: string;
  url: string;
  cover?: string;
  background?: string;
}

interface MusicPageConfig {
  title: string;
  subtitle: string;
  background: string;
  playlist: Track[];
}

const barCount = 64;
const bars = Array.from({ length: barCount }).map((_, i) => {
  // Simulate frequency bands — lower index = bass, higher = treble
  const freq = i / barCount;
  return {
    // Base height varies by frequency zone
    base: 6 + Math.sin(freq * Math.PI) * 20,
    // Speed factor — mid frequencies move fastest
    speed: 0.8 + Math.sin(freq * Math.PI * 3) * 0.6 + Math.random() * 0.3,
    // Phase offset so bars don't move in sync
    phase: Math.random() * Math.PI * 2,
    // Color hue offset
    hueOff: i * 2.8,
  };
});

export default function MusicPage() {
  const [config, setConfig] = useState<MusicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Player state
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [showPlaylist, setShowPlaylist] = useState(true);
  const [bgHue, setBgHue] = useState(225);
  const [trackTransition, setTrackTransition] = useState(false);
  const prevIndexRef = useRef(currentIndex);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Track change animation
  useEffect(() => {
    if (prevIndexRef.current !== currentIndex) {
      setTrackTransition(true);
      const timer = setTimeout(() => setTrackTransition(false), 400);
      prevIndexRef.current = currentIndex;
      return () => clearTimeout(timer);
    }
  }, [currentIndex]);

  // Load config
  useEffect(() => {
    api.getPublicConfig().then(res => {
      try {
        const cfg = JSON.parse(res.config?.music_page_config || '{}');
        setConfig({
          title: cfg.title || '音乐馆',
          subtitle: cfg.subtitle || '',
          background: cfg.background || '',
          playlist: Array.isArray(cfg.playlist) ? cfg.playlist : [],
        });
      } catch {
        setConfig({ title: '音乐馆', subtitle: '', background: '', playlist: [] });
      }
    }).catch(() => {
      setConfig({ title: '音乐馆', subtitle: '', background: '', playlist: [] });
    }).finally(() => setLoading(false));
  }, []);

  // Animated background hue shift
  useEffect(() => {
    if (!loading) {
      const interval = setInterval(() => {
        setBgHue(h => (h + 0.3) % 360);
      }, 50);
      return () => clearInterval(interval);
    }
  }, [loading]);

  const currentTrack = config?.playlist[currentIndex] || null;

  // Sync audio src when track changes
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentTrack?.url]);

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
  }, [playing, currentTrack]);

  const playTrack = useCallback((index: number) => {
    setCurrentIndex(index);
    setPlaying(true);
  }, []);

  const next = useCallback(() => {
    if (!config?.playlist.length) return;
    // Loop within playlist
    setCurrentIndex(i => (i + 1) % config.playlist.length);
    setPlaying(true);
  }, [config?.playlist.length]);

  const prev = useCallback(() => {
    if (!config?.playlist.length) return;
    setCurrentIndex(i => (i - 1 + config.playlist.length) % config.playlist.length);
    setPlaying(true);
  }, [config?.playlist.length]);

  const handleEnded = useCallback(() => {
    if (currentIndex < (config?.playlist.length || 0) - 1) next();
    else setPlaying(false);
  }, [currentIndex, config?.playlist.length, next]);

  const formatTime = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Background image — per-track first, then global, then gradient only
  const bgImageUrl = currentTrack?.background || config?.background || '';
  const bgStyle: React.CSSProperties = bgImageUrl
    ? {
        backgroundImage: `
          linear-gradient(135deg,
            hsla(${bgHue}, 60%, 8%, 0.75) 0%,
            hsla(${(bgHue + 30) % 360}, 50%, 12%, 0.70) 25%,
            hsla(${(bgHue + 60) % 360}, 40%, 10%, 0.75) 50%,
            hsla(${(bgHue + 90) % 360}, 50%, 14%, 0.70) 75%,
            hsla(${(bgHue + 120) % 360}, 60%, 8%, 0.75) 100%
          ),
          url(${JSON.stringify(bgImageUrl)})
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {
        backgroundImage: `
          linear-gradient(135deg,
            hsl(${bgHue}, 60%, 8%) 0%,
            hsl(${(bgHue + 30) % 360}, 50%, 12%) 25%,
            hsl(${(bgHue + 60) % 360}, 40%, 10%) 50%,
            hsl(${(bgHue + 90) % 360}, 50%, 14%) 75%,
            hsl(${(bgHue + 120) % 360}, 60%, 8%) 100%
          )
        `,
      };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bgStyle}>
        <Link href="/" className="absolute top-5 left-5 p-2 rounded-xl transition-all hover:bg-white/10 text-white/50 hover:text-white z-20">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex flex-col items-center gap-4">
          <Music className="w-12 h-12 animate-pulse" style={{ color: 'var(--primary)' }} />
          <span className="text-sm" style={{ color: 'var(--text-info)' }}>加载中...</span>
        </div>
      </div>
    );
  }

  if (!config || config.playlist.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bgStyle}>
        <Link href="/" className="absolute top-5 left-5 p-2 rounded-xl transition-all hover:bg-white/10 text-white/50 hover:text-white z-20">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="text-center">
          <Music className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--text-info)' }} />
          <p className="text-lg mb-2" style={{ color: 'var(--text-secondary)' }}>暂无音乐</p>
          <p className="text-sm" style={{ color: 'var(--text-info)' }}>管理员还没有添加任何歌曲</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-1000"
      style={{ ...bgStyle, color: 'var(--text-primary)' }}>

      {/* Header */}
      <header className="flex items-center justify-between px-2 sm:px-6 py-4 z-10">
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/"
            className="p-2 rounded-xl transition-all hover:bg-white/10 text-white/50 hover:text-white"
            title="返回首页">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold tracking-wide" style={{ color: '#fff' }}>
              {config.title}
            </h1>
            {config.subtitle && (
              <p className="text-xs mt-0.5 opacity-60" style={{ color: '#fff' }}>{config.subtitle}</p>
            )}
          </div>
        </div>
        <button onClick={() => setShowPlaylist(!showPlaylist)}
          className="p-2.5 rounded-xl transition-all hover:bg-white/10 md:hidden"
          style={{ color: showPlaylist ? 'var(--primary)' : 'rgba(255,255,255,0.6)' }}>
          <ListMusic className="w-5 h-5" />
        </button>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-8 px-6 pb-6 z-10">
        {/* Left: Album art + controls */}
        <div className="flex flex-col items-center gap-5 w-full max-w-sm md:max-w-md">
          {/* CD Disc */}
          <div className="relative group">
            {/* Glow */}
            <div className="absolute -inset-8 rounded-full opacity-30 blur-3xl animate-pulse"
              style={{
                background: `radial-gradient(circle, hsl(${bgHue}, 70%, 60%) 0%, transparent 70%)`,
                animationDuration: '4s',
              }}
            />
            <div className="absolute -inset-4 rounded-full opacity-20 blur-xl"
              style={{ background: `radial-gradient(circle, hsl(${(bgHue + 60) % 360}, 70%, 60%) 0%, transparent 60%)` }}
            />

            {/* CD body */}
            <div className={`relative w-56 h-56 sm:w-72 sm:h-72 rounded-full shadow-2xl ${playing ? 'cd-spinning' : 'cd-spinning cd-paused'} ${trackTransition ? 'track-changing' : ''}`}
              style={{
                boxShadow: `0 0 60px hsl(${bgHue}, 70%, 50%, 0.3), 0 20px 60px rgba(0,0,0,0.5),
                            inset 0 -20px 40px rgba(0,0,0,0.3)`,
              }}>
              {/* Vinyl grooves (concentric rings) */}
              <div className="absolute inset-0 rounded-full" style={{
                background: `
                  radial-gradient(circle at center,
                    transparent 38%,
                    rgba(0,0,0,0.06) 38.5%, transparent 39%,
                    rgba(0,0,0,0.04) 44%, transparent 44.5%,
                    rgba(0,0,0,0.06) 50%, transparent 50.5%,
                    rgba(0,0,0,0.04) 56%, transparent 56.5%,
                    rgba(0,0,0,0.06) 62%, transparent 62.5%,
                    rgba(0,0,0,0.04) 68%, transparent 68.5%
                  )
                `,
                pointerEvents: 'none',
              }} />

              {/* Album art (clipped to circle) */}
              {currentTrack?.cover ? (
                <img src={currentTrack.cover} alt={currentTrack.title}
                  className="w-full h-full rounded-full object-cover"
                  style={{ clipPath: 'circle(42% at center)' }} />
              ) : (
                <div className="w-full h-full rounded-full flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, hsl(${bgHue}, 50%, 20%), hsl(${(bgHue + 60) % 360}, 40%, 15%))`,
                    clipPath: 'circle(42% at center)',
                  }}>
                  <Music className="w-16 h-16 opacity-30" style={{ color: '#fff' }} />
                </div>
              )}

              {/* Center hub */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center"
                  style={{
                    background: `radial-gradient(circle, hsl(${bgHue}, 50%, 30%), hsl(${bgHue}, 50%, 15%))`,
                    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.4)',
                  }}>
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full"
                    style={{ background: `hsl(${bgHue}, 60%, 55%)` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Track info */}
          <div className={`text-center w-full max-w-xs ${trackTransition ? 'track-changing-fade' : ''}`}>
            <h2 className="text-xl font-bold truncate text-white drop-shadow-lg">
              {currentTrack?.title || '未选择歌曲'}
            </h2>
            {currentTrack?.artist && (
              <p className="text-sm mt-1 opacity-70 truncate text-white/70">
                {currentTrack.artist}
              </p>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-xs">
            <div className="relative h-1.5 rounded-full overflow-hidden cursor-pointer bg-white/10"
              onClick={(e) => {
                if (!audioRef.current || !duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                audioRef.current.currentTime = pct * duration;
              }}>
              <div className="h-full rounded-full transition-all duration-200"
                style={{
                  width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
                  background: `linear-gradient(90deg, hsl(${bgHue}, 80%, 65%), hsl(${(bgHue + 60) % 360}, 80%, 65%))`,
                  boxShadow: `0 0 12px hsl(${bgHue}, 80%, 65%, 0.5)`,
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[11px] tabular-nums opacity-60 text-white/60">{formatTime(currentTime)}</span>
              <span className="text-[11px] tabular-nums opacity-60 text-white/60">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-5">
            <button onClick={prev}
              className="p-2.5 rounded-full transition-all hover:bg-white/10 hover:scale-110 text-white/70 hover:text-white">
              <SkipBack className="w-5 h-5" />
            </button>
            <button onClick={togglePlay}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-xl"
              style={{
                background: `linear-gradient(135deg, hsl(${bgHue}, 80%, 60%), hsl(${(bgHue + 60) % 360}, 80%, 60%))`,
                color: '#fff',
                boxShadow: `0 0 30px hsl(${bgHue}, 80%, 60%, 0.4)`,
              }}>
              {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </button>
            <button onClick={next}
              className="p-2.5 rounded-full transition-all hover:bg-white/10 hover:scale-110 text-white/70 hover:text-white">
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 w-full max-w-[200px]">
            <button onClick={() => setVolume(v => v > 0 ? 0 : 0.5)}
              className="text-white/50 hover:text-white/80 transition-colors">
              {volume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <input type="range" min="0" max="1" step="0.05" value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, hsl(${bgHue}, 80%, 65%) ${volume * 100}%, rgba(255,255,255,0.15) ${volume * 100}%)`,
                accentColor: `hsl(${bgHue}, 80%, 65%)`,
              }} />
          </div>

          {/* Decorative visualizer bars — animated equalizer */}
          <div className="flex items-end gap-[2px] h-14 w-full max-w-[300px] opacity-50">
            {bars.map((bar, i) => {
              const t = Date.now() / 1000;
              const dynamic = playing
                ? bar.base
                  + Math.sin(t * bar.speed + bar.phase) * 8
                  + Math.sin(t * bar.speed * 1.7 + bar.phase * 1.3) * 5
                  + Math.sin(t * bar.speed * 3.1 + bar.phase * 2.7) * 3
                  + (Math.sin(t * 2.3 + i * 0.7) * 0.5 + 0.5) * 6
                : 0;
              const height = Math.max(3, playing ? dynamic + 2 : 3);
              return (
                <div key={i} className="flex-1 rounded-full"
                  style={{
                    height: `${height}px`,
                    background: `hsl(${(bgHue + bar.hueOff) % 360}, 70%, 60%)`,
                    opacity: playing ? 0.5 + Math.random() * 0.2 : 0.15,
                    transition: playing
                      ? `height ${60 + Math.random() * 80}ms linear, opacity 150ms ease`
                      : 'height 300ms ease, opacity 300ms ease',
                  }} />
              );
            })}
          </div>
        </div>

        {/* Right: Playlist */}
        <div className={`${showPlaylist ? 'flex' : 'hidden'} md:flex flex-col w-full max-w-sm md:max-w-xs lg:max-w-sm transition-all`}>
          <div className="flex items-center gap-2 mb-3 px-1">
            <ListMusic className="w-4 h-4 text-white/50" />
            <span className="text-xs font-medium text-white/50 uppercase tracking-wider">播放列表</span>
            <span className="text-xs text-white/30 ml-auto">{config.playlist.length} 首</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 max-h-[50vh] md:max-h-[60vh] pr-1 music-scrollbar">
            {config.playlist.map((track, i) => (
              <button key={i} onClick={() => playTrack(i)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all group"
                style={{
                  background: i === currentIndex ? 'rgba(255,255,255,0.1)' : 'transparent',
                  backdropFilter: i === currentIndex ? 'blur(10px)' : 'none',
                  border: i === currentIndex ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
                }}>
                {track.cover ? (
                  <img src={track.cover} alt=""
                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/5">
                    <Music className="w-4 h-4 text-white/30" />
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <span className="block truncate font-medium"
                    style={{ color: i === currentIndex ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                    {track.title}
                  </span>
                  {track.artist && (
                    <span className="block truncate text-[11px] mt-0.5 text-white/40">
                      {track.artist}
                    </span>
                  )}
                </div>
                {i === currentIndex && playing ? (
                  <Pause className="w-4 h-4 flex-shrink-0 text-white" />
                ) : (
                  <Play className="w-4 h-4 flex-shrink-0 text-white/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audio element */}
      <audio ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={handleEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        preload="none"
      />
    </div>
  );
}
