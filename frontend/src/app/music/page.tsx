'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, ListMusic, Music, ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

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

const barCount = 64;
const barHues = Array.from({ length: barCount }).map((_, i) => i * 2.8);

export default function MusicPage() {
  const router = useRouter();
  const [config, setConfig] = useState<MusicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [splashDone, setSplashDone] = useState(false);
  const [exiting, setExiting] = useState(false);
  const splashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Player state
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [showPlaylist, setShowPlaylist] = useState(true);
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(0);
  const [bgHue, setBgHue] = useState(225);
  const [trackTransition, setTrackTransition] = useState(false);
  const prevIndexRef = useRef(currentIndex);
  const [freqData, setFreqData] = useState<Uint8Array>(new Uint8Array(barCount));
  const animFrameRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Particle system refs (no re-renders)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgHueRef = useRef(bgHue);
  const freqDataRef = useRef(freqData);
  const playingRef = useRef(playing);

  // Keep animation refs in sync with state
  useEffect(() => { bgHueRef.current = bgHue; }, [bgHue]);
  useEffect(() => { freqDataRef.current = freqData; }, [freqData]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Transition refs for particle entrance/exit
  const splashDoneRef = useRef(false);
  const exitingRef = useRef(false);
  useEffect(() => { splashDoneRef.current = splashDone; }, [splashDone]);
  useEffect(() => { exitingRef.current = exiting; }, [exiting]);

  const currentPlaylist = config?.playlists[currentPlaylistIndex];
  const currentTracks = currentPlaylist?.tracks || [];
  const currentTrack = currentTracks[currentIndex] || null;

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
        // Migrate old format (playlist) to new format (playlists)
        if (!cfg.playlists && Array.isArray(cfg.playlist)) {
          cfg.playlists = cfg.playlist.length > 0
            ? [{ id: 'default', name: '默认播放列表', tracks: cfg.playlist }]
            : [];
        }
        setConfig({
          title: cfg.title || '音乐馆',
          subtitle: cfg.subtitle || '',
          background: cfg.background || '',
          playlists: Array.isArray(cfg.playlists) ? cfg.playlists : [],
        });
      } catch {
        setConfig({ title: '音乐馆', subtitle: '', background: '', playlists: [] });
      }
    }).catch(() => {
      setConfig({ title: '音乐馆', subtitle: '', background: '', playlists: [] });
    }).finally(() => setLoading(false));
  }, []);

  // Splash screen timing — wait for config then show splash for 2s
  useEffect(() => {
    if (!loading) {
      splashTimerRef.current = setTimeout(() => setSplashDone(true), 2000);
      return () => clearTimeout(splashTimerRef.current);
    }
  }, [loading]);

  // Setup Web Audio API analyser (once, on first user interaction)
  const setupAnalyser = useCallback(() => {
    if (analyserRef.current || !audioRef.current) return;
    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyserRef.current = analyser;
      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      sourceNodeRef.current = source;
    } catch (e) {
      // AudioContext unavailable (e.g. already connected, or not supported)
    }
  }, []);

  // Read frequency data from analyser when playing
  useEffect(() => {
    if (!playing || !analyserRef.current) return;

    audioContextRef.current?.resume();

    const update = () => {
      if (!analyserRef.current) return;
      const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(buf);
      setFreqData(buf);
      animFrameRef.current = requestAnimationFrame(update);
    };
    animFrameRef.current = requestAnimationFrame(update);

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [playing]);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      audioContextRef.current?.close();
    };
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

  // Particle canvas animation with entrance burst & exit explosion
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mouse = { x: -9999, y: -9999 };
    const onMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);

    let animId: number;
    let w = 0, h = 0;
    const cx = () => w / 2;
    const cy = () => h / 2;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w;
      canvas!.height = h;
    };
    window.addEventListener('resize', resize);
    resize();

    // ─── Particles — 1500, larger, no constellation lines ───
    const particles: {
      x: number; y: number; size: number; baseSize: number;
      homeX: number; homeY: number;
      speedX: number; speedY: number; hueOff: number; opacity: number;
      phase: number; twinkleSpeed: number;
      exitVX: number; exitVY: number;
    }[] = [];

    const count = 1500;
    const maxRadius = Math.min(w, h) * 0.15;
    for (let i = 0; i < count; i++) {
      const homeX = Math.random() * (w + 400) - 200;
      const homeY = Math.random() * (h + 400) - 200;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * maxRadius;
      particles.push({
        x: cx() + Math.cos(angle) * radius,
        y: cy() + Math.sin(angle) * radius,
        size: Math.random() * 2.5 + 1.5,
        baseSize: 0,
        homeX, homeY,
        speedY: -(Math.random() * 0.4 + 0.1),
        speedX: (Math.random() - 0.5) * 0.25,
        hueOff: Math.random() * 120 - 60,
        opacity: Math.random() * 0.4 + 0.12,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.025 + 0.005,
        exitVX: 0, exitVY: 0,
      });
    }
    for (const p of particles) p.baseSize = p.size;

    let time = 0;
    let prevSplashDone = false;
    let burstStart = -1;
    let exitStart = -1;

    const animate = () => {
      const now = performance.now();
      ctx!.clearRect(0, 0, w, h);
      const hue = bgHueRef.current;
      const splash = splashDoneRef.current;
      const exiting = exitingRef.current;

      const avgFreq = playingRef.current
        ? Array.from(freqDataRef.current).reduce((a, b) => a + b, 0) / freqDataRef.current.length / 255
        : 0;
      const pulse = 1 + avgFreq * 0.5;
      time += 1;

      // ─── Detect state transitions ───
      if (splash && !prevSplashDone) burstStart = now;
      prevSplashDone = splash;

      if (exiting && exitStart < 0) {
        exitStart = now;
        for (const p of particles) {
          const dx = p.x - cx();
          const dy = p.y - cy();
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const strength = 5 + Math.random() * 8;
          p.exitVX = (dx / dist) * strength + (Math.random() - 0.5) * 4;
          p.exitVY = (dy / dist) * strength + (Math.random() - 0.5) * 4;
        }
      }

      const burstElapsed = burstStart > 0 ? (now - burstStart) / 1200 : 0;
      const burstProgress = Math.min(burstElapsed, 1);
      const burstEased = 1 - Math.pow(1 - burstProgress, 3);

      const exitElapsed = exitStart > 0 ? (now - exitStart) / 1000 : 0;
      const exitProgress = Math.min(exitElapsed, 1);
      const exitEased = exitProgress;

      // ─── Update & draw ───
      for (const p of particles) {
        if (exitStart > 0) {
          p.x += p.exitVX;
          p.y += p.exitVY;
          const scale = 1 + exitEased * 4;
          const fade = 1 - exitEased;
          const r = p.size * scale;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
          ctx!.fillStyle = `hsla(${(hue + p.hueOff + 360) % 360}, 80%, 70%, ${fade * 0.08})`;
          ctx!.fill();
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx!.fillStyle = `hsla(${(hue + p.hueOff + 360) % 360}, 90%, 80%, ${fade * p.opacity})`;
          ctx!.fill();
          continue;
        }

        // Mouse repulsion
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          const force = (120 - dist) / 120 * 1.2;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }

        if (burstStart > 0 && burstProgress < 1) {
          const startX = cx();
          const startY = cy();
          const jitter = (Math.random() - 0.5) * 3 * (1 - burstEased);
          p.x = startX + (p.homeX - startX) * burstEased + jitter;
          p.y = startY + (p.homeY - startY) * burstEased + jitter;
        } else {
          p.x += p.speedX;
          p.y += p.speedY;
          if (p.y < -50) { p.y = h + 50; p.x = Math.random() * w; }
          if (p.x < -50) p.x = w + 50;
          if (p.x > w + 50) p.x = -50;
        }

        const twinkle = 0.6 + 0.4 * Math.sin(time * p.twinkleSpeed + p.phase);
        const sizePulse = p.baseSize * pulse;
        const displayOpacity = p.opacity * twinkle;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, sizePulse * 4, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(${(hue + p.hueOff + 360) % 360}, 65%, 60%, ${displayOpacity * 0.06})`;
        ctx!.fill();
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, sizePulse, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(${(hue + p.hueOff + 360) % 360}, 80%, 75%, ${displayOpacity})`;
        ctx!.fill();
      }

      animId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, []);

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
      setupAnalyser();
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [playing, currentTrack, setupAnalyser]);

  const playTrack = useCallback((index: number) => {
    setupAnalyser();
    setCurrentIndex(index);
    setPlaying(true);
  }, [setupAnalyser]);

  const next = useCallback(() => {
    if (!currentTracks.length) return;
    setCurrentIndex(i => (i + 1) % currentTracks.length);
    setPlaying(true);
  }, [currentTracks.length]);

  const prev = useCallback(() => {
    if (!currentTracks.length) return;
    setCurrentIndex(i => (i - 1 + currentTracks.length) % currentTracks.length);
    setPlaying(true);
  }, [currentTracks.length]);

  const handleEnded = useCallback(() => {
    if (currentIndex < currentTracks.length - 1) next();
    else setPlaying(false);
  }, [currentIndex, currentTracks.length, next]);

  const handleBack = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => router.push('/'), 900);
  }, [exiting, router]);

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

  const hasAnyTracks = config?.playlists.some(p => p.tracks.length > 0);
  const showPlayer = splashDone && config && hasAnyTracks;
  const playerConfig = config!; // non-null: only used when showPlayer is true

  // Shared background for splash/exit overlays — dark gradient + optional bg image
  const overlayBg = (bgUrl: string | undefined): React.CSSProperties => bgUrl
    ? {
        backgroundImage: `
          linear-gradient(135deg,
            hsla(${bgHue}, 60%, 5%, 0.65) 0%,
            hsla(${(bgHue + 30) % 360}, 50%, 8%, 0.60) 100%
          ),
          url(${JSON.stringify(bgUrl)})
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: `hsla(${bgHue}, 60%, 5%, 0.7)` };

  return (
    <div className="min-h-screen flex flex-col overflow-hidden"
      style={{ ...bgStyle, color: 'var(--text-primary)' }}>
      {/* Particle canvas background */}
      <canvas ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 199 }} />

      {/* ─── Splash Screen ─── */}
      {!splashDone && (
        <div className={`fixed inset-0 z-[200] flex flex-col items-center justify-center transition-all duration-1000 ${splashDone ? 'opacity-0 scale-110' : 'opacity-100'}`}
          style={overlayBg(config?.background)}>
          {/* Expanding light rings */}
          <div className="absolute inset-0 flex items-center justify-center">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="absolute rounded-full animate-pulse"
                style={{
                  width: `${120 + i * 80}px`,
                  height: `${120 + i * 80}px`,
                  border: `1px solid hsla(${(bgHue + i * 30) % 360}, 80%, 60%, ${0.3 - i * 0.06})`,
                  animationDelay: `${i * 0.4}s`,
                  animationDuration: '3s',
                  opacity: 0,
                }} />
            ))}
          </div>

          {/* Spinning record */}
          <div className="relative mb-8">
            <div className="w-40 h-40 rounded-full animate-spin-slow"
              style={{
                background: `linear-gradient(135deg, #1a1a2e, #16213e)`,
                boxShadow: `0 0 80px hsl(${bgHue}, 70%, 50%, 0.3), 0 0 160px hsl(${(bgHue + 60) % 360}, 70%, 50%, 0.15)`,
              }}>
              <div className="w-full h-full rounded-full flex items-center justify-center relative"
                style={{
                  background: `
                    radial-gradient(circle at center,
                      transparent 38%,
                      hsla(${bgHue}, 70%, 50%, 0.15) 38.5%, transparent 39%,
                      hsla(${(bgHue + 60) % 360}, 60%, 50%, 0.1) 45%, transparent 45.5%,
                      hsla(${(bgHue + 30) % 360}, 70%, 50%, 0.12) 52%, transparent 52.5%,
                      hsla(${(bgHue + 90) % 360}, 60%, 50%, 0.08) 60%, transparent 60.5%
                    )
                  `,
                }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: `radial-gradient(circle, hsl(${bgHue}, 70%, 60%), hsl(${bgHue}, 50%, 25%))` }}>
                  <Music className="w-5 h-5 text-white/80" />
                </div>
              </div>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold tracking-widest animate-fade-in-up"
            style={{ color: '#fff', animationDelay: '0.5s', animationFillMode: 'both' }}>
            {config?.title || '音乐馆'}
          </h1>
          {config?.subtitle && (
            <p className="text-sm mt-3 tracking-wide animate-fade-in-up"
              style={{ color: 'rgba(255,255,255,0.5)', animationDelay: '0.8s', animationFillMode: 'both' }}>
              {config.subtitle}
            </p>
          )}
        </div>
      )}

      {/* ─── Exit Overlay ─── */}
      {exiting && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center animate-fade-in"
          style={overlayBg(config?.background)}>
          {/* Contracting light rings */}
          <div className="absolute inset-0 flex items-center justify-center">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="absolute rounded-full"
                style={{
                  width: `${200 - i * 40}px`,
                  height: `${200 - i * 40}px`,
                  border: `1px solid hsla(${(bgHue + i * 30) % 360}, 80%, 60%, ${0.2 - i * 0.04})`,
                  animation: 'ping 1s ease-out infinite',
                  animationDelay: `${i * 0.15}s`,
                }} />
            ))}
          </div>

          {/* Slowing spinning record */}
          <div className="relative mb-8">
            <div className="w-32 h-32 rounded-full animate-spin-slow"
              style={{
                background: `linear-gradient(135deg, #1a1a2e, #16213e)`,
                boxShadow: `0 0 60px hsl(${bgHue}, 70%, 50%, 0.25), 0 0 120px hsl(${(bgHue + 60) % 360}, 70%, 50%, 0.1)`,
                animationDuration: '3s',
              }}>
              <div className="w-full h-full rounded-full flex items-center justify-center relative"
                style={{
                  background: `
                    radial-gradient(circle at center,
                      transparent 38%,
                      hsla(${bgHue}, 70%, 50%, 0.12) 38.5%, transparent 39%,
                      hsla(${(bgHue + 60) % 360}, 60%, 50%, 0.08) 45%, transparent 45.5%,
                      hsla(${(bgHue + 30) % 360}, 70%, 50%, 0.1) 52%, transparent 52.5%
                    )
                  `,
                }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: `radial-gradient(circle, hsl(${bgHue}, 70%, 60%), hsl(${bgHue}, 50%, 25%))` }}>
                  <Music className="w-4 h-4 text-white/80" />
                </div>
              </div>
            </div>
          </div>

          {/* Farewell text */}
          <h1 className="text-3xl font-bold tracking-widest animate-fade-in-up"
            style={{ color: '#fff', animationDelay: '0.3s', animationFillMode: 'both' }}>
            再见
          </h1>
          <p className="text-sm mt-3 tracking-wide animate-fade-in-up"
            style={{ color: 'rgba(255,255,255,0.5)', animationDelay: '0.6s', animationFillMode: 'both' }}>
            期待下次相遇
          </p>
        </div>
      )}

      {/* ─── Loading State ─── */}
      {loading && !config && (
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full animate-spin-slow"
              style={{ border: '2px solid hsla(var(--primary-hsl), 0.2)', borderTopColor: 'var(--primary)', boxShadow: '0 0 30px hsla(var(--primary-hsl), 0.2)' }} />
            <span className="text-sm" style={{ color: 'var(--text-info)' }}>加载中...</span>
          </div>
        </div>
      )}

      {/* ─── Empty State ─── */}
      {!loading && (!config || !hasAnyTracks) && (
        <div className="min-h-screen flex items-center justify-center">
          <button onClick={handleBack} className="absolute top-5 left-5 p-2 rounded-xl transition-all hover:bg-white/10 text-white/50 hover:text-white z-20">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <Music className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--text-info)' }} />
            <p className="text-lg mb-2" style={{ color: 'var(--text-secondary)' }}>暂无音乐</p>
            <p className="text-sm" style={{ color: 'var(--text-info)' }}>管理员还没有添加任何歌曲</p>
          </div>
        </div>
      )}

      {/* ─── Player UI ─── */}
      {showPlayer && (
      <div className={`flex-1 flex flex-col transition-all duration-700 ${exiting ? 'opacity-0 scale-95 translate-y-4 !duration-500' : 'opacity-100 translate-y-0'}`}>

      {/* Header */}
      <header className="flex items-center justify-between px-2 sm:px-6 py-4 z-10">
        <div className="flex items-center gap-2 sm:gap-4">
          <button onClick={handleBack}
            className="p-2 rounded-xl transition-all hover:bg-white/10 text-white/50 hover:text-white"
            title="返回首页">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-wide" style={{ color: '#fff' }}>
              {playerConfig.title}
            </h1>
            {playerConfig.subtitle && (
              <p className="text-xs mt-0.5 opacity-60" style={{ color: '#fff' }}>{playerConfig.subtitle}</p>
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
            <div className="absolute -inset-8 rounded-full opacity-30 blur-3xl animate-pulse"
              style={{
                background: `radial-gradient(circle, hsl(${bgHue}, 70%, 60%) 0%, transparent 70%)`,
                animationDuration: '4s',
              }}
            />
            <div className="absolute -inset-4 rounded-full opacity-20 blur-xl"
              style={{ background: `radial-gradient(circle, hsl(${(bgHue + 60) % 360}, 70%, 60%) 0%, transparent 60%)` }}
            />

            <div className={`relative w-56 h-56 sm:w-72 sm:h-72 rounded-full shadow-2xl ${playing ? 'cd-spinning' : 'cd-spinning cd-paused'} ${trackTransition ? 'track-changing' : ''}`}
              style={{
                boxShadow: `0 0 60px hsl(${bgHue}, 70%, 50%, 0.3), 0 20px 60px rgba(0,0,0,0.5),
                            inset 0 -20px 40px rgba(0,0,0,0.3)`,
              }}>
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

          {/* Frequency visualizer bars */}
          <div className="flex items-end gap-[2px] h-14 w-full max-w-[300px] opacity-50">
            {Array.from({ length: barCount }).map((_, i) => {
              const val = freqData[i] / 255;
              const height = playing ? Math.max(3, val * 55) : 3;
              // Smooth the height using CSS transition
              const smoothTransition = playing
                ? 'height 80ms ease-out'
                : 'height 300ms ease, opacity 300ms ease';
              return (
                <div key={i} className="flex-1 rounded-full"
                  style={{
                    height: `${height}px`,
                    background: `hsl(${(bgHue + barHues[i]) % 360}, 70%, 60%)`,
                    opacity: playing ? 0.35 + val * 0.5 : 0.15,
                    transition: smoothTransition,
                  }} />
              );
            })}
          </div>
        </div>

        {/* Right: Playlist */}
        <div className={`${showPlaylist ? 'flex' : 'hidden'} md:flex flex-col w-full max-w-sm md:max-w-xs lg:max-w-sm transition-all`}>
          {/* Playlist dropdown */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <ListMusic className="w-4 h-4 text-white/50 flex-shrink-0" />
            {playerConfig.playlists.length > 1 ? (
              <select value={currentPlaylistIndex} onChange={e => {
                const pi = Number(e.target.value);
                if (pi !== currentPlaylistIndex) {
                  setCurrentPlaylistIndex(pi);
                  setCurrentIndex(0);
                  setPlaying(false);
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.src = '';
                  }
                }
              }}
                className="flex-1 text-xs font-medium bg-transparent outline-none cursor-pointer"
                style={{ color: 'rgba(255,255,255,0.7)' }}>
                {playerConfig.playlists.map((pl, pi) => (
                  <option key={pl.id} value={pi} style={{ background: '#222', color: '#fff' }}>
                    {pl.name} ({pl.tracks.length} 首)
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {currentPlaylist?.name || '播放列表'}
              </span>
            )}
            <span className="text-xs text-white/30">{currentTracks.length} 首</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 max-h-[50vh] md:max-h-[60vh] pr-1 music-scrollbar">
            {currentTracks.map((track, i) => (
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
      )}
    </div>
  );
}
