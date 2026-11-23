export interface FriendPoint { id: string; x: number; y: number; }
export interface FriendEdge { from: number; to: number; path: string; faint: boolean; }

/** Cover the viewport's circumcircle at any rotation, including the off-screen
 * pole. The map clips a small window out of this continuous polar grid. */
export function createConstellationGrid(width: number, height: number) {
  const cx = width / 2, cy = height * 1.9;
  const spacing = height / 7;
  const radius = Math.ceil((height * 1.4 + Math.hypot(width, height) / 2 + spacing * 2) / spacing) * spacing;
  const radii = Array.from({ length: Math.round(radius / spacing) }, (_, index) => (index + 1) * spacing);
  const rays = Array.from({ length: 64 }, (_, index) => {
    const angle = index / 64 * Math.PI * 2;
    return { x1: cx, y1: cy, x2: cx + Math.cos(angle) * radius, y2: cy + Math.sin(angle) * radius };
  });
  return { cx, cy, spacing, radii, rays };
}

export function friendSeed(text: string): number {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return hash >>> 0;
}

export function friendRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Best-candidate sampling spreads stars over the map. Prim's tree connects
 * every friend; a few short secondary edges complete the constellation. */
export function createFriendConstellation(ids: string[], width: number, height: number, seed = friendSeed(ids.join('|'))) {
  const compact = width < 640;
  const horizontal = compact ? 36 : 70;
  const top = compact ? 70 : 84;
  const bottom = compact ? 92 : 100;
  const randomOrder = friendRandom(seed);
  const shuffled = ids.map(id => ({ id, rank: (friendSeed(id) ^ Math.floor(randomOrder() * 4294967296)) >>> 0 }))
    .sort((a, b) => a.rank - b.rank).map(item => item.id);
  const points: FriendPoint[] = [];
  for (const id of shuffled.slice(0, compact ? 9 : 18)) {
    const random = friendRandom(seed ^ friendSeed(id));
    let chosen = { x: width / 2, y: height / 2 }, best = -1;
    for (let attempt = 0; attempt < 24; attempt++) {
      const candidate = { x: horizontal + random() * Math.max(0, width - horizontal * 2), y: top + random() * Math.max(0, height - top - bottom) };
      const nearest = points.reduce((minimum, point) => Math.min(minimum, Math.hypot(point.x - candidate.x, (point.y - candidate.y) * (compact ? 1.4 : 1.7))), Infinity);
      if (nearest > best) { best = nearest; chosen = candidate; }
    }
    points.push({ id, ...chosen });
  }
  const edges: FriendEdge[] = [];
  const visited = new Set(points.length ? [0] : []);
  const distance = (a: number, b: number) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
  const edgeKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  const connected = new Set<string>();
  function edge(from: number, to: number, faint: boolean): FriendEdge {
    const a = points[from], b = points[to];
    const cx = (a.x + b.x) / 2 + (a.y - b.y) * .08;
    const cy = (a.y + b.y) / 2 + (b.x - a.x) * .08;
    return { from, to, faint, path: `M${a.x.toFixed(2)} ${a.y.toFixed(2)} Q${cx.toFixed(2)} ${cy.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}` };
  }
  while (visited.size < points.length) {
    let from = 0, to = -1, shortest = Infinity;
    for (const source of visited) for (let target = 0; target < points.length; target++) {
      if (!visited.has(target) && distance(source, target) < shortest) { from = source; to = target; shortest = distance(source, target); }
    }
    visited.add(to);
    connected.add(edgeKey(from, to));
    edges.push(edge(from, to, false));
  }
  for (let source = 0; source < points.length && edges.length < points.length * 1.3; source++) {
    const neighbor = points.map((_, target) => ({ target, distance: distance(source, target) })).filter(item => item.target !== source).sort((a, b) => a.distance - b.distance)[1];
    if (neighbor && neighbor.distance < (compact ? 150 : 240) && !connected.has(edgeKey(source, neighbor.target))) {
      connected.add(edgeKey(source, neighbor.target));
      edges.push(edge(source, neighbor.target, true));
    }
  }
  return { points, edges, compact, seed };
}
