'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Music } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface ArticleAudioPlayerProps {
  src: string | Blob | MediaSource | MediaStream;
  [key: string]: unknown;
}

interface MediaInfo {
  id: string;
  original_name: string;
  thumbnail_url: string;
  filename: string;
  url: string;
  mime_type: string;
  size: number;
  title?: string;
  artist?: string;
  album?: string;
}

function formatTime(s: number): string {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Parse filename like "Artist - Title.mp3" into { artist, title }.
 * Falls back to the whole filename (minus extension) as title.
 */
function parseFilename(name: string): { artist: string; title: string } {
  const cleaned = name.replace(/\.[^.]+$/, '').trim();
  // Try "Artist - Title" or "Artist – Title" (em dash)
  const sepMatch = cleaned.match(/^(.+?)\s*[–-]\s*(.+)$/);
  if (sepMatch) {
    return { artist: sepMatch[1].trim(), title: sepMatch[2].trim() };
  }
  return { artist: '', title: cleaned };
}

export function ArticleAudioPlayer({ src, ..._rest }: ArticleAudioPlayerProps) {
  const srcStr = typeof src === 'string' ? src : '';
  const audioRef = useRef<HTMLAudioElement>(null);
  const seekRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Fetch media metadata from API
  useEffect(() => {
    if (!srcStr) return;
    const encoded = encodeURIComponent(srcStr);

    fetch(`${API_BASE}/api/v1/media/info?url=${encoded}`)
      .then(res => res.ok ? res.json() : null)
      .then((data: { media?: MediaInfo } | null) => {
        if (data?.media) {
          const m = data.media;
          // Use thumbnail from API response directly
          if (m.thumbnail_url) setCoverUrl(m.thumbnail_url);
          // Use metadata fields from API, fall back to filename parsing
          if (m.title || m.artist) {
            setTitle(m.title || '');
            setArtist(m.artist || '');
          } else {
            const { artist: a, title: t } = parseFilename(m.original_name);
            setArtist(a);
            setTitle(t || m.original_name.replace(/\.[^.]+$/, ''));
          }
        }
        setLoaded(true);
      })
      .catch(() => {
        // API failed — fall back to filename parsing
        const fallback = decodeURIComponent(
          srcStr.split('/').pop()?.replace(/\.[^.]+$/, '') || ''
        );
        const { artist: a, title: t } = parseFilename(fallback);
        setArtist(a);
        setTitle(t || fallback);
        setLoaded(true);
      });
  }, [srcStr]);

  // Legacy cover fallback: if API returned no thumbnail, try _thumb.jpg/png
  useEffect(() => {
    if (!loaded || coverUrl) return;
    const dot = srcStr.lastIndexOf('.');
    if (dot === -1) return;
    const base = srcStr.substring(0, dot);
    const tryExt = (ext: string) => {
      const url = base + '_thumb.' + ext;
      const img = new Image();
      img.onload = () => setCoverUrl(url);
      img.onerror = () => { if (ext === 'jpg') tryExt('png'); };
      img.src = url;
    };
    tryExt('jpg');
  }, [loaded, coverUrl, srcStr]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  }, [playing]);

  const handleSeek = useCallback((e: React.MouseEvent) => {
    if (!audioRef.current || !seekRef.current || !duration) return;
    const rect = seekRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  }, [duration]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <span
      className="not-prose"
      style={{
        margin: '16px 0',
        borderRadius: '12px',
        background: 'rgba(0,0,0,0.03)',
        border: '1px solid rgba(128,128,128,0.15)',
        overflow: 'hidden',
        display: 'block',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '14px 18px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
        className="dark-media-player"
      >
        {/* Cover art — 80px */}
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '10px',
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: (loaded && !coverUrl) ? 'rgba(128,128,128,0.08)' : 'transparent',
          }}
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt="cover"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={() => setCoverUrl(null)}
            />
          ) : (
            <Music style={{ width: '30px', height: '30px', opacity: 0.3 }} />
          )}
        </div>

        {/* Info + controls */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Title + play button */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: 'inherit',
                  lineHeight: 1.4,
                }}
              >
                {title || '音频'}
              </div>
              {artist && (
                <div
                  style={{
                    fontSize: '12px',
                    opacity: 0.5,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: 'inherit',
                    marginTop: '1px',
                  }}
                >
                  {artist}
                </div>
              )}
            </div>
            <button
              onClick={togglePlay}
              style={{
                flexShrink: 0,
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(128,128,128,0.12)',
                color: 'inherit',
                padding: 0,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(128,128,128,0.22)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(128,128,128,0.12)')}
              title={playing ? '暂停' : '播放'}
            >
              {playing
                ? <Pause style={{ width: '16px', height: '16px' }} />
                : <Play style={{ width: '16px', height: '16px', marginLeft: 1 }} />}
            </button>
          </div>

          {/* Seek bar + time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              ref={seekRef}
              onClick={handleSeek}
              style={{
                flex: 1,
                height: '5px',
                borderRadius: '3px',
                background: 'rgba(128,128,128,0.15)',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: `${progress}%`,
                  borderRadius: '3px',
                  background: 'rgba(128,128,128,0.45)',
                  transition: 'width 0.1s linear',
                }}
              />
            </div>
            <span
              style={{
                fontSize: '11px',
                opacity: 0.5,
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                color: 'inherit',
              }}
            >
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        style={{ display: 'none' }}
      />

      <style>{`
        .dark .dark-media-player {
          color: #e0e0e0 !important;
        }
        .dark-media-player button:active {
          transform: scale(0.92);
        }
      `}</style>
    </span>
  );
}
