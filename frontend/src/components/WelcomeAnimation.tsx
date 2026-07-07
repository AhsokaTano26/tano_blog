'use client';

import { useEffect, useRef } from 'react';

interface WelcomeAnimationProps {
  user: { display_name?: string; username: string; avatar_url?: string };
  onEnd: () => void;
}

type Color3 = [number, number, number];

interface BlobCfg {
  color: Color3;
  x: number;
  y: number;
  radius: number;
  speed: number;
  phase: number;
  alpha: number;
}

const BLOBS: BlobCfg[] = [
  { color: [99, 102, 241], x: 0.42, y: 0.38, radius: 0.22, speed: 0.78, phase: 0.1, alpha: 0.85 },
  { color: [168, 85, 247], x: 0.43, y: 0.61, radius: 0.25, speed: 0.66, phase: 1.4, alpha: 0.65 },
  { color: [59, 130, 246], x: 0.62, y: 0.54, radius: 0.28, speed: 0.54, phase: 2.2, alpha: 0.55 },
  { color: [236, 72, 153], x: 0.52, y: 0.48, radius: 0.23, speed: 0.72, phase: 3.0, alpha: 0.50 },
  { color: [251, 146, 60], x: 0.47, y: 0.43, radius: 0.18, speed: 0.60, phase: 4.1, alpha: 0.40 },
];

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number;
  life: number; maxLife: number;
  color: Color3;
}

const DURATION = 3600;

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function easeInOut(v: number) {
  return v < 0.5 ? 2 * v * v : 1 - (-2 * v + 2) ** 2 / 2;
}
function rgba(c: Color3, a: number) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function WelcomeAnimation({ user, onEnd }: WelcomeAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const endedRef = useRef(false);
  const rafRef = useRef(0);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const cw = useRef(0);
  const ch = useRef(0);
  const reduced = useRef(false);
  const startRef = useRef(0);
  const ptsRef = useRef<Particle[]>([]);

  const done = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    requestAnimationFrame(() => requestAnimationFrame(onEnd));
  };

  const resize = () => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    cw.current = Math.max(1, r.width);
    ch.current = Math.max(1, r.height);
    c.width = Math.round(cw.current * dpr);
    c.height = Math.round(ch.current * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctxRef.current = ctx;
  };

  const spawnParticles = (cx: number, cy: number, count: number, colors: Color3[], intensity: number) => {
    if (reduced.current) return;
    const n = Math.floor(count * intensity);
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 1.5;
      const color = colors[Math.floor(Math.random() * colors.length)];
      ptsRef.current.push({
        x: cx + (Math.random() - 0.5) * 30,
        y: cy + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1 + Math.random() * 2.5,
        alpha: 0.5 + Math.random() * 0.5,
        life: 0,
        maxLife: 30 + Math.random() * 60,
        color,
      });
    }
  };

  const drawBlob = (b: BlobCfg, p: number, es: number) => {
    const ctx = ctxRef.current!;
    const t = easeInOut(clamp(p / 0.82, 0, 1));
    const dr = reduced.current ? 0 : es * b.speed;
    const wx = Math.sin(dr + b.phase) * 0.04;
    const wy = Math.cos(dr * 0.88 + b.phase) * 0.032;
    const sw = reduced.current ? 0 : (t - 0.5) * 0.22;
    const sp = reduced.current ? 1 : 1 + Math.sin(dr * 1.2 + b.phase) * 0.05;
    const ms = Math.max(cw.current, ch.current);
    const r = ms * b.radius * (0.78 + t * 0.46) * sp;
    const x = cw.current * (b.x + wx + sw);
    const y = ch.current * (b.y + wy);
    const fi = clamp(p / 0.14, 0, 1);
    const fo = 1 - clamp((p - 0.78) / 0.22, 0, 1);
    const a = b.alpha * easeInOut(fi) * easeInOut(fo);
    const g = ctx.createRadialGradient(x, y, r * 0.05, x, y, r);
    g.addColorStop(0, rgba(b.color, a));
    g.addColorStop(0.38, rgba(b.color, a * 0.62));
    g.addColorStop(0.68, rgba(b.color, a * 0.2));
    g.addColorStop(1, rgba(b.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Occasionally spawn particles from blob centers
    if (p < 0.85 && !reduced.current && Math.random() < 0.2) {
      spawnParticles(x, y, 3, [b.color], clamp(p * 1.5, 0.3, 1));
    }
  };

  const drawParticles = () => {
    const ctx = ctxRef.current!;
    const pts = ptsRef.current;
    for (let i = pts.length - 1; i >= 0; i--) {
      const pt = pts[i];
      pt.life++;
      if (pt.life >= pt.maxLife) { pts.splice(i, 1); continue; }
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vx *= 0.97;
      pt.vy *= 0.97;
      const lr = pt.life / pt.maxLife;
      ctx.globalAlpha = pt.alpha * (1 - lr);
      ctx.fillStyle = rgba(pt.color, 1);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * (1 - lr * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const frame = (now: number) => {
    const ctx = ctxRef.current;
    if (!ctx || endedRef.current) return;
    const elapsed = reduced.current ? DURATION * 0.34 : now - startRef.current;
    const p = clamp(elapsed / DURATION, 0, 1);
    const es = elapsed / 1000;

    ctx.clearRect(0, 0, cw.current, ch.current);
    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(0, 0, cw.current, ch.current);

    BLOBS.forEach(b => drawBlob(b, p, es));
    drawParticles();

    // Subtle scan line overlay
    if (!reduced.current && p < 0.85) {
      const scanY = ((elapsed * 0.08) % (ch.current + 40)) - 20;
      const sg = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.015)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, scanY - 20, cw.current, 40);
    }

    // Vignette
    const vg = ctx.createRadialGradient(
      cw.current * 0.5, ch.current * 0.5, Math.min(cw.current, ch.current) * 0.12,
      cw.current * 0.5, ch.current * 0.5, Math.max(cw.current, ch.current) * 0.72,
    );
    vg.addColorStop(0, 'rgba(12,14,20,0)');
    vg.addColorStop(1, 'rgba(12,14,20,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cw.current, ch.current);

    if (!reduced.current && p < 1) {
      rafRef.current = requestAnimationFrame(frame);
    } else if (p >= 1) {
      done();
    }
  };

  const start = () => {
    cancelAnimationFrame(rafRef.current);
    ptsRef.current = [];
    resize();
    startRef.current = performance.now();
    frame(startRef.current);
    if (!reduced.current) rafRef.current = requestAnimationFrame(frame);
  };

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced.current = mq.matches;
    const onMotion = (e: MediaQueryListEvent) => { reduced.current = e.matches; start(); };
    const onResize = () => start();
    mq.addEventListener('change', onMotion);
    window.addEventListener('resize', onResize);
    start();
    const timer = setTimeout(done, DURATION + 200);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timer);
      mq.removeEventListener('change', onMotion);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] grid place-items-center overflow-hidden"
      style={{ background: '#0c0e14', contain: 'layout paint' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      />

      {/* Avatar with animated rings */}
      <div
        className="relative z-10 mb-10"
        style={{ animation: 'wa-avatar-in 1s cubic-bezier(0.22, 1, 0.36, 1) both', animationDelay: '0.05s' }}
      >
        {/* Pulsing aura */}
        <div
          className="absolute -inset-4 rounded-full animate-ping"
          style={{ background: 'radial-gradient(circle, hsla(225,60%,55%,0.12), transparent 70%)', animationDuration: '2s' }}
        />
        {/* Spinning gradient ring */}
        <div className="absolute -inset-3 rounded-full" style={{
          background: 'conic-gradient(from 0deg, hsl(225,60%,55%), hsl(280,60%,55%), transparent 50%, hsl(225,60%,55%))',
          animation: 'wa-spin 3s linear infinite',
          opacity: 0.5,
          WebkitMaskImage: 'radial-gradient(circle, transparent 38%, black 40%, black 58%, transparent 60%)',
          maskImage: 'radial-gradient(circle, transparent 38%, black 40%, black 58%, transparent 60%)',
        }} />
        <img
          src={user.avatar_url || '/aimi.png'}
          alt=""
          className="w-20 h-20 rounded-full object-cover relative"
          style={{
            border: '2px solid hsla(225,60%,55%,0.25)',
            boxShadow: '0 0 40px hsla(225,60%,55%,0.2), 0 0 80px hsla(225,60%,55%,0.1)',
          }}
        />
      </div>

      {/* Welcome text — concise, single line */}
      <div className="relative z-10 text-center px-6"
        style={{ animation: 'wa-text-in 1s cubic-bezier(0.22, 1, 0.36, 1) both', animationDelay: '0.2s' }}
      >
        <h1
          className="text-[clamp(28px,5vw,52px)] font-black leading-none tracking-tight"
          style={{
            background: 'linear-gradient(135deg, hsl(225,55%,65%), hsl(270,55%,65%), hsl(320,55%,60%))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 30px hsla(225,60%,55%,0.15))',
          }}
        >
          Welcome, {user.display_name || user.username}
        </h1>
      </div>

      {/* Decorative accent line */}
      <div
        className="absolute bottom-[15%] z-10 h-px"
        style={{
          width: 'clamp(60px, 15vw, 120px)',
          background: 'linear-gradient(90deg, transparent, hsla(225,60%,55%,0.35), transparent)',
          animation: 'wa-line-in 1.2s cubic-bezier(0.22, 1, 0.36, 1) both',
          animationDelay: '0.3s',
        }}
      />

      <button
        onClick={done}
        className="absolute z-10 font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          bottom: 34, right: 38,
          padding: '8px 20px',
          borderRadius: 999,
          border: '1px solid hsla(0,0%,100%,0.12)',
          color: 'hsla(0,0%,100%,0.35)',
          fontSize: 13,
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        Skip &rarr;
      </button>

      <style>{`
        @keyframes wa-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes wa-text-in {
          0% { opacity: 0; transform: translate3d(0, 16px, 0) scale(0.95); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes wa-avatar-in {
          0% { opacity: 0; transform: scale(0.6) translateY(20px); }
          70% { transform: scale(1.05) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes wa-line-in {
          0% { opacity: 0; transform: scaleX(0); }
          100% { opacity: 1; transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
