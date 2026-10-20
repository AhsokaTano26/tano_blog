'use client';

import { Tooltip } from './Tooltip';
import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { LoaderCircle, Maximize, Minimize, Music, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { Slider } from './Slider';

interface MediaPreviewProps {
  src: string;
  type: 'audio' | 'video';
  title?: string;
  className?: string;
  style?: CSSProperties;
}

function usableSource(src: string) {
  const value = src.trim();
  if (!value) return '';
  try {
    const url = new URL(value, 'https://media-preview.invalid');
    if (!['http:', 'https:', 'blob:', 'data:'].includes(url.protocol)) return '';
    if (url.protocol === 'data:' && !/^data:(audio|video)\//i.test(value)) return '';
    return value;
  } catch {
    return '';
  }
}

function formatTime(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

export function MediaPreview(props: MediaPreviewProps) {
  const source = usableSource(props.src);
  // A replacement source receives fresh playback state, including pending promises.
  return <MediaPreviewPlayer key={`${props.type}:${source}`} {...props} source={source} />;
}

function MediaPreviewPlayer({ src, source, type, title, className = '', style }: MediaPreviewProps & { source: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const mountedRef = useRef(false);
  const playRequestRef = useRef(0);
  const playIntentRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [requestingPlay, setRequestingPlay] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [fullscreenError, setFullscreenError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const mediaName = type === 'video' ? '视频' : '音频';
  const invalidMessage = src.trim() ? `${mediaName}地址无效` : `暂无${mediaName}地址`;
  const pending = requestingPlay || buffering;

  useEffect(() => {
    mountedRef.current = true;
    const media = mediaRef.current;
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => {
      mountedRef.current = false;
      playRequestRef.current++;
      playIntentRef.current = false;
      document.removeEventListener('fullscreenchange', updateFullscreen);
      if (media && !media.paused) media.pause();
    };
  }, []);

  async function togglePlayback() {
    const media = mediaRef.current;
    if (!media || !source) return;
    if (playIntentRef.current || !media.paused) {
      playRequestRef.current++;
      playIntentRef.current = false;
      media.pause();
      setPlaying(false);
      setRequestingPlay(false);
      setBuffering(false);
      return;
    }

    const request = ++playRequestRef.current;
    playIntentRef.current = true;
    setRequestingPlay(true);
    setMediaError('');
    try {
      if (media.error || mediaError) media.load();
      await media.play();
      if (!mountedRef.current || request !== playRequestRef.current) {
        if (!playIntentRef.current) media.pause();
        return;
      }
      setPlaying(true);
      setRequestingPlay(false);
      setBuffering(false);
    } catch {
      if (!mountedRef.current || request !== playRequestRef.current) return;
      playIntentRef.current = false;
      setPlaying(false);
      setRequestingPlay(false);
      setBuffering(false);
      setMediaError(`${mediaName}播放失败，请重试`);
    }
  }

  function updateDuration(event: SyntheticEvent<HTMLMediaElement>) {
    const value = event.currentTarget.duration;
    setDuration(Number.isFinite(value) && value > 0 ? value : 0);
  }

  function seek(value: string) {
    const media = mediaRef.current;
    const requestedTime = Number(value);
    if (!media || !duration || !Number.isFinite(requestedTime)) return;
    const time = Math.min(duration, Math.max(0, requestedTime));
    try {
      media.currentTime = time;
      setCurrentTime(time);
    } catch {
      setMediaError('暂时无法定位，请等待媒体加载后重试');
    }
  }

  function changeVolume(value: string) {
    const media = mediaRef.current;
    if (!media) return;
    const next = Math.min(1, Math.max(0, Number(value)));
    if (!Number.isFinite(next)) return;
    media.volume = next;
    media.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
  }

  function toggleMute() {
    const media = mediaRef.current;
    if (!media) return;
    const next = !(media.muted || media.volume === 0);
    if (!next && media.volume === 0) {
      media.volume = 1;
      setVolume(1);
    }
    media.muted = next;
    setMuted(next);
  }

  async function toggleFullscreen() {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === frameRef.current) {
        await document.exitFullscreen();
      } else if (frameRef.current?.requestFullscreen) {
        await frameRef.current.requestFullscreen();
      } else {
        const video = mediaRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
        if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
        else setFullscreenError('当前浏览器不支持全屏预览');
      }
    } catch {
      if (mountedRef.current) setFullscreenError('无法打开全屏预览，请重试');
    }
  }

  const mediaEvents = {
    onLoadedMetadata: updateDuration,
    onDurationChange: updateDuration,
    onTimeUpdate: (event: SyntheticEvent<HTMLMediaElement>) => {
      const time = event.currentTarget.currentTime;
      setCurrentTime(Number.isFinite(time) ? time : 0);
    },
    onPlay: () => { playIntentRef.current = true; setPlaying(true); },
    onPlaying: () => { setPlaying(true); setBuffering(false); },
    onPause: () => {
      playIntentRef.current = false;
      playRequestRef.current++;
      setPlaying(false);
      setRequestingPlay(false);
      setBuffering(false);
    },
    onWaiting: () => { if (playIntentRef.current) setBuffering(true); },
    onCanPlay: () => setBuffering(false),
    onEnded: () => {
      playIntentRef.current = false;
      playRequestRef.current++;
      setPlaying(false);
      setRequestingPlay(false);
      setBuffering(false);
    },
    onVolumeChange: (event: SyntheticEvent<HTMLMediaElement>) => {
      setVolume(event.currentTarget.volume);
      setMuted(event.currentTarget.muted);
    },
    onError: () => {
      playIntentRef.current = false;
      playRequestRef.current++;
      setPlaying(false);
      setRequestingPlay(false);
      setBuffering(false);
      setMediaError(`${mediaName}加载失败，请重试`);
    },
  };

  return (
    <div ref={frameRef} role="group" aria-label={title ? `${title} ${mediaName}预览` : `${mediaName}预览`}
      className={`admin-ui-media-preview ${className}`} style={style}>
      {type === 'video' ? (
        <video ref={node => { mediaRef.current = node; }} src={source || undefined} preload="metadata" playsInline
          {...mediaEvents} aria-label={title || '视频预览画面'}
          className="admin-ui-media-visual block w-full aspect-video object-contain" />
      ) : (
        <audio ref={node => { mediaRef.current = node; }} src={source || undefined} preload="metadata" {...mediaEvents} aria-hidden="true" />
      )}
      <div className="admin-ui-media-controls">
        {title && <Tooltip content={title}><p className="admin-ui-media-title truncate" data-tooltip={title}>{type === 'audio' && <Music aria-hidden="true" className="w-4 h-4 flex-shrink-0" />}{title}</p></Tooltip>}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { void togglePlayback(); }} disabled={!source}
            className="admin-ui-media-button" aria-label={playing || pending ? `暂停${mediaName}` : `播放${mediaName}`}
            aria-pressed={playing || pending}>
            {pending ? <LoaderCircle aria-hidden="true" className="w-4 h-4 animate-spin" />
              : playing ? <Pause aria-hidden="true" className="w-4 h-4" /> : <Play aria-hidden="true" className="w-4 h-4" />}
          </button>
          <span className="admin-ui-media-time whitespace-nowrap text-xs tabular-nums" aria-live="off">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div className="admin-ui-media-volume flex items-center gap-2 ml-auto">
            <button type="button" className="admin-ui-media-button" disabled={!source} onClick={toggleMute}
              aria-label={muted || volume === 0 ? '取消静音' : '静音'} aria-pressed={muted || volume === 0}>
              {muted || volume === 0 ? <VolumeX aria-hidden="true" className="w-4 h-4" /> : <Volume2 aria-hidden="true" className="w-4 h-4" />}
            </button>
            <Slider aria-label={`${mediaName}音量`} min={0} max={1} step={0.01} value={muted ? 0 : volume}
              aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`} disabled={!source}
              onChange={event => changeVolume(event.currentTarget.value)} className="w-16" />
          </div>
          {type === 'video' && <button type="button" className="admin-ui-media-button" onClick={() => { void toggleFullscreen(); }}
            disabled={!source} aria-label={fullscreen ? '退出全屏' : '全屏预览'} aria-pressed={fullscreen}>
            {fullscreen ? <Minimize aria-hidden="true" className="w-4 h-4" /> : <Maximize aria-hidden="true" className="w-4 h-4" />}
          </button>}
        </div>
        <Slider className="admin-ui-media-timeline w-full" aria-label={`${mediaName}播放进度`}
          aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
          min={0} max={duration || 1} step={0.1} value={Math.min(currentTime, duration || 0)}
          disabled={!source || !duration} onChange={event => seek(event.currentTarget.value)} />
        {!source ? <p role="status" className="admin-ui-media-status">{invalidMessage}</p>
          : (mediaError || fullscreenError) ? <p role="alert" className="admin-ui-media-status">{mediaError || fullscreenError}</p>
            : pending ? <p role="status" className="admin-ui-media-status">正在加载{mediaName}…</p> : null}
      </div>
    </div>
  );
}
