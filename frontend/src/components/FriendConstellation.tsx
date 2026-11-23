'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type RefObject } from 'react';
import { ArrowUpRight, RotateCw, Search, X } from 'lucide-react';
import type { FriendLinkItem } from '@/lib/admin-types';
import { createConstellationGrid, createFriendConstellation, friendRandom, friendSeed, type FriendPoint } from '@/lib/friend-constellation';
import styles from './FriendDirectory.module.css';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const ease = (value: number) => 1 - (1 - value) ** 3;
const domain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const matches = (link: FriendLinkItem, query: string) => !query.trim() || `${link.name} ${link.url} ${link.description || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

export function FriendConstellation({ links, query, onQueryChange, searchRef, Avatar }: {
  links: FriendLinkItem[];
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  Avatar: ComponentType<{ link: Pick<FriendLinkItem, 'name' | 'avatar'> }>;
}) {
  const mapRef = useRef<HTMLElement>(null);
  const skyRef = useRef<SVGGElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const starRefs = useRef(new Map<string, HTMLDivElement>());
  const lastPositions = useRef(new Map<string, { x: number; y: number }>());
  const angleRef = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointer = useRef({ type: 'mouse', active: false });
  const [size, setSize] = useState({ width: 960, height: 520, ready: false });
  const [inView, setInView] = useState(false);
  const [phase, setPhase] = useState<'waiting' | 'moving' | 'settled'>('waiting');
  const [initial, setInitial] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [leaving, setLeaving] = useState<FriendPoint[]>([]);
  const ids = useMemo(() => links.map(link => link.id), [links]);
  const baseSeed = useMemo(() => friendSeed(ids.join('|')), [ids]);
  const graph = useMemo(() => createFriendConstellation(ids, size.width, size.height, baseSeed + generation * 7919), [ids, size.width, size.height, baseSeed, generation]);
  const displayedPoints = phase === 'settled' ? graph.points : [...leaving, ...graph.points];
  const byId = useMemo(() => new Map(links.map(link => [link.id, link])), [links]);
  const activePoint = graph.points.find(point => point.id === activeId);
  const activeLink = activeId ? byId.get(activeId) : undefined;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const measure = () => {
      const { width, height } = map.getBoundingClientRect();
      if (!width || !height) return;
      setLeaving(current => current.length ? [] : current);
      setSize(previous => {
        const next = { width: map.clientWidth || width, height: map.clientHeight || height, ready: true };
        return previous.ready && previous.width === next.width && previous.height === next.height ? previous : next;
      });
    };
    const frame = requestAnimationFrame(measure);
    const resize = new ResizeObserver(measure);
    resize.observe(map);
    const intersection = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setInView(true); intersection.disconnect(); }
    }, { threshold: .2 });
    intersection.observe(map);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect(); clearTimeout(closeTimer.current); };
  }, []);

  useLayoutEffect(() => {
    if (!size.ready || !inView) return;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const random = friendRandom(graph.seed);
    const radius = Math.min(size.width, size.height) * .08;
    const firstVisit = lastPositions.current.size === 0;
    const timing = firstVisit
      ? { chaos: 170, decay: 300, fadeStart: 40, fade: 240, pullStart: 70, pullRamp: 190, settle: 480 }
      : { chaos: 720, decay: 520, fadeStart: 160, fade: 560, pullStart: 640, pullRamp: 340, settle: 1080 };
    const targetIds = new Set(graph.points.map(point => point.id));
    const bodies = [...leaving, ...graph.points].map(point => {
      const previous = lastPositions.current.get(point.id);
      const spawnX = firstVisit ? size.width / 2 + (random() - .5) * radius : 36 + random() * (size.width - 72);
      const spawnY = firstVisit ? size.height / 2 + (random() - .5) * radius : 70 + random() * (size.height - 162);
      return { ...point, tx: point.x, ty: point.y, x: previous?.x ?? spawnX, y: previous?.y ?? spawnY, vx: 0, vy: 0, entering: !previous, leaving: !targetIds.has(point.id) };
    });
    let frame = 0, start = 0, previousTime = 0;
    const originalAngle = angleRef.current;
    const render = (elapsed: number) => {
      for (const body of bodies) {
        const node = starRefs.current.get(body.id);
        if (!node) continue;
        node.style.translate = `${body.x}px ${body.y}px`;
        node.style.opacity = body.leaving ? String(1 - clamp(elapsed / 620, 0, 1)) : body.entering ? String(clamp((elapsed - timing.fadeStart) / timing.fade, 0, 1)) : '1';
        node.style.scale = body.leaving ? String(1 - .6 * clamp(elapsed / 620, 0, 1)) : body.entering ? String(.4 + .6 * ease(clamp((elapsed - timing.fadeStart) / timing.fade, 0, 1))) : '1';
        lastPositions.current.set(body.id, { x: body.x, y: body.y });
      }
    };
    const finish = () => {
      cancelAnimationFrame(frame);
      for (const body of bodies) { body.x = body.tx; body.y = body.ty; body.entering = false; }
      render(1000);
      for (const body of bodies) {
        if (body.leaving) { lastPositions.current.delete(body.id); continue; }
        const node = starRefs.current.get(body.id); node?.style.removeProperty('opacity'); node?.style.removeProperty('scale');
      }
      setPhase('settled');
      setInitial(false);
    };
    const tick = (now: number) => {
      if (!start) { start = now; previousTime = now; setPhase('moving'); }
      const elapsed = now - start;
      const dt = Math.min(32, now - previousTime) / 1000;
      previousTime = now;
      const heat = elapsed < timing.chaos ? ease(elapsed / timing.chaos) : Math.max(0, 1 - (elapsed - timing.chaos) / timing.decay);
      const pull = clamp((elapsed - timing.pullStart) / timing.pullRamp, 0, 1);
      let unsettled = elapsed < timing.settle;
      for (const body of bodies) {
        const fx = (random() - .5) * 10400 * heat - (body.y - size.height / 2) * 1.6 * heat + (body.leaving ? 0 : (body.tx - body.x) * 150 * pull);
        const fy = (random() - .5) * 10400 * heat + (body.x - size.width / 2) * 1.6 * heat + (body.leaving ? 0 : (body.ty - body.y) * 150 * pull);
        const damping = 1.5 + 15 * pull;
        body.vx += (fx - damping * body.vx) * dt;
        body.vy += (fy - damping * body.vy) * dt;
        body.x = clamp(body.x + body.vx * dt, 20, size.width - 20);
        body.y = clamp(body.y + body.vy * dt, 20, size.height - 20);
        if (!body.leaving && (Math.hypot(body.tx - body.x, body.ty - body.y) > .6 || Math.hypot(body.vx, body.vy) > 6)) unsettled = true;
      }
      angleRef.current = originalAngle + 7 * ease(Math.min(1, elapsed / 1500));
      skyRef.current?.setAttribute('transform', `rotate(${angleRef.current} ${size.width / 2} ${size.height / 2})`);
      if (unsettled && elapsed < 2600) { render(elapsed); frame = requestAnimationFrame(tick); } else finish();
    };
    const handlePreference = () => { if (media?.matches || document.hidden) finish(); };
    if (media?.matches || document.hidden) frame = requestAnimationFrame(finish);
    else { render(0); frame = requestAnimationFrame(tick); }
    media?.addEventListener('change', handlePreference);
    document.addEventListener('visibilitychange', handlePreference);
    return () => { cancelAnimationFrame(frame); media?.removeEventListener('change', handlePreference); document.removeEventListener('visibilitychange', handlePreference); };
  }, [graph, size.ready, size.width, size.height, inView, leaving]);

  function shuffleSky() {
    const previousIds = new Set(graph.points.map(point => point.id));
    let nextGeneration = generation + 1;
    let next = createFriendConstellation(ids, size.width, size.height, baseSeed + nextGeneration * 7919);
    for (let attempt = 0; attempt < 32 && ids.length > graph.points.length && next.points.every(point => previousIds.has(point.id)); attempt++) {
      nextGeneration++;
      next = createFriendConstellation(ids, size.width, size.height, baseSeed + nextGeneration * 7919);
    }
    const nextIds = new Set(next.points.map(point => point.id));
    setLeaving(graph.points.filter(point => !nextIds.has(point.id)));
    setActiveId(null);
    setPhase('moving');
    setGeneration(nextGeneration);
  }

  function show(id: string) { clearTimeout(closeTimer.current); setActiveId(id); }
  function closeSoon() { closeTimer.current = setTimeout(() => setActiveId(null), 150); }
  function changeQuery(value: string) { setActiveId(null); onQueryChange(value); }
  const popupStyle: CSSProperties | undefined = activePoint && !graph.compact ? {
    left: activePoint.x + 294 > size.width - 16 ? Math.max(16, activePoint.x - 294) : Math.min(activePoint.x + 34, size.width - 276),
    top: clamp(activePoint.y - 40, 64, size.height - 190),
  } : undefined;
  useLayoutEffect(() => {
    if (!activePoint || graph.compact || !previewRef.current) return;
    const height = previewRef.current.getBoundingClientRect().height;
    previewRef.current.style.top = `${clamp(activePoint.y - 40, 64, size.height - height - 64)}px`;
  }, [activePoint, graph.compact, size.height]);
  const dust = useMemo(() => {
    const random = friendRandom(31);
    return Array.from({ length: graph.compact ? 90 : 240 }, () => ({ x: random() * size.width, y: random() * size.height, opacity: .2 + random() * .45 }));
  }, [size.width, size.height, graph.compact]);
  const grid = useMemo(() => createConstellationGrid(size.width, size.height), [size.width, size.height]);

  return <section ref={mapRef} className={styles.map} aria-label="友邻星图" data-phase={phase} data-compact={graph.compact || undefined}
    onKeyDown={event => { if (event.key === 'Escape') setActiveId(null); }}
    onPointerDown={event => { if (!(event.target as Element).closest('[data-friend-star], [data-friend-preview]')) setActiveId(null); }}>
    <svg className={styles.chart} viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
      <g ref={skyRef} data-sky-grid>
        {grid.radii.map(radius => <circle key={`ring-${radius}`} cx={grid.cx} cy={grid.cy} r={radius} fill="none" />)}
        {grid.rays.map((ray, index) => <line key={`line-${index}`} {...ray} />)}
        {dust.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={index % 8 ? .6 : 1.1} style={{ opacity: point.opacity }} data-dust />)}
      </g>
      <g className={styles.connections} key={graph.seed} data-constellation-lines>
        {graph.edges.map((edge, index) => <path key={`${edge.from}:${edge.to}`} d={edge.path} fill="none" pathLength={edge.faint ? undefined : 1}
          data-faint={edge.faint || undefined} data-constellation-edge vectorEffect="non-scaling-stroke" style={{ '--line-delay': `${80 + index * 45}ms` } as CSSProperties} />)}
      </g>
    </svg>
    {initial && <div className={styles.burst} aria-hidden="true"><i /><i /><i /></div>}
    {displayedPoints.map((point, index) => {
      const link = byId.get(point.id)!;
      const match = matches(link, query);
      const active = activeId === link.id;
      return <div key={link.id} ref={node => { if (node) starRefs.current.set(link.id, node); else starRefs.current.delete(link.id); }}
        className={styles.star} data-friend-star={link.id} data-match={String(match)} data-active={active || undefined} data-leaving={leaving.some(old => old.id === link.id) && phase !== 'settled' || undefined}
        style={{ translate: `${point.x}px ${point.y}px` }}
        onPointerEnter={event => { if (event.pointerType === 'mouse' && phase === 'settled') show(link.id); }}
        onPointerLeave={event => { if (!event.currentTarget.contains(document.activeElement) && !previewRef.current?.contains(document.activeElement)) closeSoon(); }}>
        <a href={link.url} target="_blank" rel="noopener noreferrer" className={styles.starButton} aria-label={`查看 ${link.name} 的简介`} aria-expanded={active} aria-controls="friend-star-preview"
          onPointerDown={event => { pointer.current = { type: event.pointerType, active }; }}
          onClick={event => { if (event.detail > 0 && pointer.current.type !== 'mouse' && !pointer.current.active) { event.preventDefault(); show(link.id); } }} onFocus={() => show(link.id)}
          onBlur={event => { if (!mapRef.current?.contains(event.relatedTarget)) setActiveId(null); }}>
          <Avatar link={link} />
        </a>
        <div className={styles.starLabel} style={{ '--label-delay': `${120 + index * 30}ms`, marginLeft: clamp(point.x, graph.compact ? 52 : 74, size.width - (graph.compact ? 52 : 74)) - point.x } as CSSProperties}>
          <span className={styles.starName}>{link.name}</span><span className={styles.domain}>{domain(link.url)}</span>
        </div>
      </div>;
    })}
    <div ref={previewRef} id="friend-star-preview" className={`${styles.preview} ${graph.compact ? styles.docked : ''}`} data-friend-preview hidden={!activeLink} style={popupStyle}
      onPointerEnter={() => clearTimeout(closeTimer.current)} onPointerLeave={event => { if (!event.currentTarget.contains(document.activeElement)) closeSoon(); }}>
      {activeLink && <div className={styles.previewBody}><div className={styles.previewHeading}><Avatar link={activeLink} /><div><strong>{activeLink.name}</strong><span className={styles.domain}>{domain(activeLink.url)}</span></div></div>
        <p>{activeLink.description || '去朋友的站点逛逛，读一读最近的故事。'}</p><a href={activeLink.url} target="_blank" rel="noopener noreferrer">去拜访 <ArrowUpRight size={14} aria-hidden="true" /></a></div>}
    </div>
    <div className={styles.mapToolbar}><span className={styles.eyebrow}>THE FRIENDS MAP / 友邻星图</span><label className={styles.search}>
      <Search size={15} aria-hidden="true" /><input ref={searchRef} type="search" aria-label="找一位朋友" placeholder="找一位朋友" value={query} onChange={event => changeQuery(event.target.value)} />
      {query && <button type="button" aria-label="清除搜索" onClick={() => { changeQuery(''); searchRef.current?.focus(); }}><X size={15} /></button>}
    </label></div>
    <div className={styles.mapFooter}><span><span className={styles.desktopHint}>悬停一颗星</span><span className={styles.mobileHint}>轻触一颗星</span>，读一句自述</span>
      <button type="button" disabled={phase === 'moving' || links.length < 2} onClick={shuffleSky}>换一片星空 <RotateCw size={13} aria-hidden="true" /></button></div>
  </section>;
}
