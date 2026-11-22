'use client';

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from 'react';
import { ArrowUp, List, X } from 'lucide-react';
import styles from './ArticleToc.module.css';

const READING_OFFSET = 112;
const RAIL_HEIGHT = 320;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

interface Heading {
  id: string;
  text: string;
  level: number;
  position: number;
  element: HTMLElement;
}

interface Outline {
  headings: Heading[];
  activeId: string;
  visibleIds: string[];
  progress: number;
}

const EMPTY_OUTLINE: Outline = { headings: [], activeId: '', visibleIds: [], progress: 0 };

function useArticleOutline(contentRef: RefObject<HTMLDivElement | null>, contentKey: string) {
  const [outline, setOutline] = useState<Outline>(EMPTY_OUTLINE);
  const speed = useRef(0);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    let frame = 0;
    let disposed = false;
    let headings: Heading[] = [];
    let positions: number[] = [];
    let top = 0;
    let height = 1;
    let previousY = window.scrollY;
    let previousTime = performance.now();

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const now = performance.now();
      speed.current = Math.min(14, Math.abs(y - previousY) / Math.max(16, now - previousTime) * 10);
      previousY = y;
      previousTime = now;
      const readingLine = y + READING_OFFSET;
      let activeId = '';
      const visibleIds: string[] = [];
      headings.forEach((heading, index) => {
        if (positions[index] <= readingLine + 1) activeId = heading.id;
        if (positions[index] >= readingLine && positions[index] < y + window.innerHeight - 100) visibleIds.push(heading.id);
      });
      // Prefer the first heading in view; keep the previous section between headings.
      activeId = visibleIds[0] || activeId;
      // Match the reference's viewport-based article progress, excluding comments.
      const progress = Math.floor(clamp((y + Math.min(y, window.innerHeight) - top) / height) * 100);
      setOutline(previous => previous.headings === headings && previous.activeId === activeId && previous.progress === progress
        && previous.visibleIds.join('\0') === visibleIds.join('\0') ? previous : { headings, activeId, visibleIds, progress });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const measure = () => {
      const bounds = content.getBoundingClientRect();
      top = bounds.top + window.scrollY;
      height = Math.max(1, bounds.height);
      const elements = [...content.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')]
        .filter(element => element.id && !element.closest('[data-footnotes]'));
      positions = elements.map(element => element.getBoundingClientRect().top + window.scrollY);
      headings = elements.map((element, index) => ({
        id: element.id, text: element.textContent || '', level: Number(element.tagName[1]),
        position: clamp((positions[index] - top) / height), element,
      }));
      schedule();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(document.documentElement);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(() => { if (!disposed) measure(); });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', measure);
    };
  }, [contentRef, contentKey]);

  return { ...outline, speed };
}

function ReadingRail({ headings, activeId, progress, rootLevel, speed }: {
  headings: Heading[];
  activeId: string;
  progress: number;
  rootLevel: number;
  speed: RefObject<number>;
}) {
  const railRef = useRef<SVGSVGElement>(null);
  const [railHeight, setRailHeight] = useState(RAIL_HEIGHT);
  const trackRef = useRef<SVGPathElement>(null);
  const accentRef = useRef<SVGPathElement>(null);
  const dotsRef = useRef<(SVGCircleElement | null)[]>([]);
  const motion = useRef({ y: progress / 100 * RAIL_HEIGHT, bend: 0, velocity: 0 });

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const observer = new ResizeObserver(entries => {
      const height = Math.round(entries[0]?.contentRect.height || 0);
      if (height > 0) setRailHeight(previous => previous === height ? previous : height);
    });
    observer.observe(rail);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let previousTime = 0;
    let elapsed = 0;
    const target = progress / 100 * railHeight;
    const animate = (time: number) => {
      const dt = Math.min(32, previousTime ? time - previousTime : 16);
      elapsed += dt;
      previousTime = time;
      const state = motion.current;
      state.y += (target - state.y) * (1 - Math.exp(-dt / 100));
      const impulse = elapsed < 100 ? speed.current : 0;
      state.velocity += (90 * (impulse - state.bend) - 15 * state.velocity) * dt / 1000;
      state.bend += state.velocity * dt / 1000;
      if (reduced) { state.y = target; state.bend = 0; }
      const y = clamp(state.y, 5, railHeight - 5);
      const radius = 52;
      const bend = (10 + clamp(state.bend, -3, 14)) * Math.min(1, y / radius, (railHeight - y) / radius);
      const start = Math.max(0, y - radius);
      const end = Math.min(railHeight, y + radius);
      const path = `M8 0 L8 ${start} C8 ${y - radius * .45},${8 + bend} ${y - radius * .3},${8 + bend} ${y} C${8 + bend} ${y + radius * .3},8 ${y + radius * .45},8 ${end} L8 ${railHeight}`;
      trackRef.current?.setAttribute('d', path);
      accentRef.current?.setAttribute('d', path);
      accentRef.current?.setAttribute('stroke-dashoffset', String(.06 - y / railHeight));
      headings.forEach((heading, index) => {
        const distance = Math.abs(heading.position * railHeight - y) / radius;
        const x = 8 + (distance >= 1 ? 0 : bend * Math.cos(distance * Math.PI / 2) ** 2);
        dotsRef.current[index]?.setAttribute('cx', String(x));
      });
      if (!reduced && (Math.abs(target - state.y) > .05 || Math.abs(state.bend) > .02 || Math.abs(state.velocity) > .02)) {
        frame = requestAnimationFrame(animate);
      }
    };
    animate(performance.now());
    return () => cancelAnimationFrame(frame);
  }, [progress, headings, speed, railHeight]);

  return <svg ref={railRef} className={styles.rail} viewBox={`0 0 48 ${railHeight}`} preserveAspectRatio="none" aria-hidden="true">
    <path ref={trackRef} className={styles.track} d={`M8 0 V${railHeight}`} />
    <path ref={accentRef} className={styles.accent} pathLength="1" strokeDasharray="0.12 1" d={`M8 0 V${railHeight}`} />
    {headings.map((heading, index) => <circle key={heading.id} ref={element => { dotsRef.current[index] = element; }}
      cx="8" cy={heading.position * railHeight} r={heading.id === activeId ? 2.7 : heading.level === rootLevel ? 1.8 : 1.2}
      className={heading.id === activeId ? styles.activeDot : heading.level === rootLevel ? styles.rootDot : styles.dot} />)}
  </svg>;
}

export function ArticleToc({ contentRef, contentKey }: { contentRef: RefObject<HTMLDivElement | null>; contentKey: string }) {
  const { headings, activeId, visibleIds, progress, speed } = useArticleOutline(contentRef, contentKey);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [reading, setReading] = useState(false);
  const [range, setRange] = useState({ top: 0, height: 0 });
  const shellRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const treeRef = useRef<HTMLUListElement>(null);
  const navigationFrame = useRef(0);
  const panelId = useId();
  const expanded = (desktop && !reading) || hovered || focused || pinned;
  const rootLevel = headings.reduce((level, heading) => Math.min(level, heading.level), 6);
  const activeIndex = Math.max(0, headings.findIndex(heading => heading.id === activeId));
  const groups = useMemo(() => {
    const result: { heading: Heading; children: Heading[] }[] = [];
    for (const heading of headings) {
      if (heading.level === rootLevel || !result.length) result.push({ heading, children: [] });
      else result[result.length - 1].children.push(heading);
    }
    return result;
  }, [headings, rootLevel]);
  const currentGroup = groups.find(group => group.heading.id === activeId || group.children.some(heading => heading.id === activeId));

  const close = () => { setHovered(false); setFocused(false); setPinned(false); };
  const dismiss = () => { close(); shellRef.current?.focus({ preventScroll: true }); };

  useEffect(() => () => cancelAnimationFrame(navigationFrame.current), []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const media = window.matchMedia?.('(min-width: 1024px)');
    const resize = () => setDesktop(media?.matches ?? window.innerWidth >= 1024);
    const enter = (event: PointerEvent) => { if (event.pointerType !== 'touch') setReading(true); };
    const leave = () => setReading(false);
    resize();
    media?.addEventListener('change', resize);
    if (!media) window.addEventListener('resize', resize);
    content.addEventListener('pointerenter', enter);
    content.addEventListener('pointerleave', leave);
    return () => {
      media?.removeEventListener('change', resize);
      if (!media) window.removeEventListener('resize', resize);
      content.removeEventListener('pointerenter', enter);
      content.removeEventListener('pointerleave', leave);
    };
  }, [contentRef, contentKey]);

  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) { setHovered(false); setFocused(false); setPinned(false); }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !treeRef.current || !navRef.current) return;
    const tree = treeRef.current;
    const nav = navRef.current;
    const active = tree.querySelector<HTMLElement>('[aria-current="location"]');
    if (active && (active.offsetTop < nav.scrollTop || active.offsetTop + active.offsetHeight > nav.scrollTop + nav.clientHeight)) {
      nav.scrollTop = Math.max(0, active.offsetTop - nav.clientHeight / 2);
    }
    const measure = () => {
      const links = [...tree.querySelectorAll<HTMLElement>('[data-visible="true"], [aria-current="location"]')];
      const first = links[0];
      const last = links.at(-1);
      if (!first || !last) return;
      const top = first.offsetTop;
      const height = last.offsetTop + last.offsetHeight - top;
      setRange(previous => previous.top === top && previous.height === height ? previous : { top, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tree);
    return () => observer.disconnect();
  }, [expanded, activeId, visibleIds, groups]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, heading: Heading) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    window.history.pushState(window.history.state, '', `#${encodeURIComponent(heading.id)}`);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    cancelAnimationFrame(navigationFrame.current);
    // Let a pending smooth-scroll frame and the closing mobile panel settle first.
    navigationFrame.current = requestAnimationFrame(() => {
      heading.element.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
    });
    heading.element.setAttribute('tabindex', '-1');
    heading.element.focus({ preventScroll: true });
    close();
  };

  const renderHeading = (heading: Heading) => {
    const index = headings.indexOf(heading);
    return <a key={heading.id} href={`#${encodeURIComponent(heading.id)}`} title={heading.text}
      aria-current={heading.id === activeId ? 'location' : undefined}
      data-visible={visibleIds.includes(heading.id)} data-root={heading.level === rootLevel}
      className={styles.link} onClick={event => navigate(event, heading)}
      style={{ '--toc-indent': Math.max(0, heading.level - rootLevel), '--toc-delay': `${Math.min(300, Math.abs(index - activeIndex) * 45)}ms` } as CSSProperties}>
      {heading.text}
    </a>;
  };

  if (!headings.length) return null;

  return <aside ref={shellRef} className={styles.shell} data-expanded={expanded} tabIndex={-1} aria-label="文章阅读导航"
    onPointerEnter={event => { if (event.pointerType !== 'touch') setHovered(true); }} onPointerLeave={() => setHovered(false)}
    onFocus={event => { if (event.target !== event.currentTarget) setFocused(true); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); dismiss(); } }}>
    <div className={styles.sticky}>
      <button type="button" className={styles.toggle} aria-label="文章目录" aria-controls={panelId} aria-expanded={expanded}
        onClick={() => { if (pinned) dismiss(); else setPinned(true); }}>
        <List size={15} aria-hidden="true" /><span>目录</span>
        <span className={styles.toggleProgress}>{progress}%</span>
      </button>
      <div className={styles.overview} role="progressbar" aria-label="正文阅读进度" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <ReadingRail headings={headings} activeId={activeId} progress={progress} rootLevel={rootLevel} speed={speed} />
        <div className={styles.position} style={{ top: `${clamp(progress, 5, 93)}%` }} aria-hidden="true">
          {currentGroup && <span className={styles.chapter}>{currentGroup.heading.text}</span>}
          <span className={styles.percentage}>{progress}<span>%</span></span>
        </div>
      </div>
      <div className={styles.panel} id={panelId} inert={!expanded}>
        <div className={styles.mobileHeading}><span>本文目录</span><button type="button" aria-label="收起文章目录" onClick={dismiss}><X size={18} /></button></div>
        <nav ref={navRef} className={styles.nav} aria-label="文章目录">
          <ul ref={treeRef} className={styles.tree}>
            <li aria-hidden="true" className={styles.range} style={{ top: range.top, height: activeId ? range.height : 0 }} />
            {groups.map(group => {
              const open = group === currentGroup || visibleIds.includes(group.heading.id) || group.children.some(heading => visibleIds.includes(heading.id));
              return <li key={group.heading.id} className={styles.group}>
                {renderHeading(group.heading)}
                {group.children.length > 0 && <div className={styles.children} data-open={open} inert={!open}>
                  <ul>{group.children.map(heading => <li key={heading.id}>{renderHeading(heading)}</li>)}</ul>
                </div>}
              </li>;
            })}
          </ul>
        </nav>
        <div className={styles.footer}>
          <svg viewBox="0 0 100 12" fill="none" aria-hidden="true"><path d="M2 7C12 1 19 2 28 6S44 10 54 5 70 2 78 6 89 9 98 4" /></svg>
          <div><span className={styles.progressValue}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle className={styles.progressTrack} cx="8" cy="8" r="6" /><circle className={styles.progressArc} cx="8" cy="8" r="6" pathLength="100" strokeDasharray={`${Math.max(2, progress)} 100`} transform="rotate(-90 8 8)" /></svg>
            {progress}%
          </span>
            <button type="button" className={styles.backToTop} data-visible={progress > 10} tabIndex={progress > 10 ? 0 : -1} aria-hidden={progress <= 10} onClick={() => { window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); dismiss(); }} aria-label="回到顶部"><ArrowUp size={14} /><span>回到顶部</span></button>
          </div>
        </div>
      </div>
    </div>
  </aside>;
}
