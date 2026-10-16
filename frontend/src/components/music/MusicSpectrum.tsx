'use client';

import { memo, useEffect, useRef, type RefObject } from 'react';

export const MUSIC_BAR_COUNT = 128;

function createSampler(bins: number, bars: number) {
  const input = new Uint8Array(bins);
  const smoothed = new Float32Array(bars);
  // Multiple low-frequency bars may share a bin. Clamp each range so the
  // logarithmic map never reads beyond the analyser's frequencyBinCount.
  const ranges = Array.from({ length: bars }, (_, index) => {
    const start = Math.min(bins - 1, Math.floor(Math.exp(index / bars * Math.log(bins)) - 1));
    const end = Math.min(bins - 1, Math.max(start, Math.ceil(Math.exp((index + 1) / bars * Math.log(bins)) - 1)));
    return { start, end };
  });
  return { input, smoothed, ranges };
}

interface MusicSpectrumProps {
  analyserRef: RefObject<AnalyserNode | null>;
  frequenciesRef: RefObject<Uint8Array>;
  active: boolean;
  mobile: boolean;
}

export const MusicSpectrum = memo(function MusicSpectrum({ analyserRef, frequenciesRef, active, mobile }: MusicSpectrumProps) {
  const barsRef = useRef<HTMLDivElement>(null);
  const samplerRef = useRef<ReturnType<typeof createSampler> | null>(null);

  useEffect(() => {
    const bars = barsRef.current?.children;
    if (!bars) return;
    const reset = () => {
      frequenciesRef.current.fill(0);
      samplerRef.current?.smoothed.fill(0);
      for (const bar of bars) {
        const element = bar as HTMLElement;
        element.style.height = '3px';
        element.style.opacity = '0.2';
        element.style.boxShadow = 'none';
      }
    };
    const analyser = analyserRef.current;
    if (!active || !analyser) {
      reset();
      return;
    }
    if (samplerRef.current?.input.length !== analyser.frequencyBinCount) {
      samplerRef.current = createSampler(analyser.frequencyBinCount, MUSIC_BAR_COUNT);
    }
    const { input, smoothed, ranges } = samplerRef.current;
    const frequencies = frequenciesRef.current;
    let frame: number;
    const draw = () => {
      analyser.getByteFrequencyData(input);
      for (let i = 0; i < MUSIC_BAR_COUNT; i++) {
        const { start, end } = ranges[i];
        let sum = 0;
        for (let bin = start; bin <= end; bin++) sum += input[bin];
        smoothed[i] = smoothed[i] * 0.65 + sum / (end - start + 1) * 0.35;
        frequencies[i] = Math.round(smoothed[i]);
        const value = Math.pow(frequencies[i] / 255, 0.6);
        const element = bars[i] as HTMLElement;
        element.style.height = `${Math.max(3, value * (mobile ? 80 : 60))}px`;
        element.style.opacity = String(0.7 + value * 0.3);
        element.style.boxShadow = '0 0 4px currentColor';
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active, mobile, analyserRef, frequenciesRef]);

  return (
    <div ref={barsRef} aria-hidden="true" className={`flex items-end h-14 w-full max-w-[300px] ${mobile ? 'gap-0' : 'gap-px'}`}>
      {Array.from({ length: MUSIC_BAR_COUNT }, (_, index) => (
        <div key={index} className="flex-1 rounded-full" style={{
          height: '3px', opacity: 0.2,
          color: `hsl(calc(var(--music-hue, 225) + ${index * 2.8}), 90%, 70%)`,
          background: 'currentColor',
        }} />
      ))}
    </div>
  );
});
