/* eslint-disable @typescript-eslint/no-require-imports -- Node tests reuse the TypeScript loader. */
require('./load-typescript.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFriendConstellation, createConstellationGrid } = require('../src/lib/friend-constellation.ts');

test('the constellation connects all friends once before adding short secondary arcs', () => {
  for (const [width, height, count] of [[280, 460, 9], [350, 460, 9], [720, 520, 18], [960, 520, 18]]) {
    const graph = createFriendConstellation(Array.from({ length: count }, (_, i) => String(i)), width, height);
    assert.equal(graph.points.length, count);
    const tree = graph.edges.filter(edge => !edge.faint);
    assert.equal(tree.length, count - 1);
    const visited = new Set([0]);
    const unique = new Set();
    for (const edge of graph.edges) {
      assert.match(edge.path, /^M[\d. -]+ Q/);
      assert.equal(/NaN|Infinity/.test(edge.path), false);
      const key = [edge.from, edge.to].sort((a, b) => a - b).join(':');
      assert.equal(unique.has(key), false);
      unique.add(key);
      if (!edge.faint) { assert.equal(visited.has(edge.from), true); assert.equal(visited.has(edge.to), false); visited.add(edge.to); }
    }
    assert.equal(visited.size, count);
  }
});

test('sampling is repeatable, stays clear of controls, and changes when friends are shuffled', () => {
  const ids = Array.from({ length: 18 }, (_, i) => String(i));
  const graph = createFriendConstellation(ids, 960, 520);
  assert.deepEqual(graph, createFriendConstellation(ids, 960, 520));
  assert.notDeepEqual(graph.points, createFriendConstellation([...ids].reverse(), 960, 520).points);
  for (const point of graph.points) { assert.ok(point.x >= 70 && point.x <= 890); assert.ok(point.y >= 84 && point.y <= 420); }
  assert.equal(createFriendConstellation(ids, 350, 460).points.length, 9);
  assert.equal(createFriendConstellation([], 350, 460).edges.length, 0);
  assert.equal(createFriendConstellation(['a'], 350, 460).edges.length, 0);
});

test('changing the sky samples new friends from the whole pool rather than moving the same avatars', () => {
  const ids = Array.from({ length: 48 }, (_, index) => `friend-${index}`);
  const seen = new Set();
  let previous = '';
  for (let seed = 10; seed < 15; seed++) {
    const graph = createFriendConstellation(ids, 960, 520, seed);
    assert.equal(graph.points.length, 18);
    const selected = graph.points.map(point => point.id);
    assert.equal(new Set(selected).size, 18);
    assert.notEqual([...selected].sort().join(','), previous);
    previous = [...selected].sort().join(',');
    selected.forEach(id => { assert.equal(ids.includes(id), true); seen.add(id); });
  }
  assert.ok(seen.size > 30);
});

test('the sky grid extends beyond every viewport corner throughout a full rotation', () => {
  for (const [width, height] of [[280, 460], [350, 460], [720, 520], [960, 520], [1600, 520]]) {
    const grid = createConstellationGrid(width, height);
    const outer = grid.radii.at(-1);
    for (let degrees = 0; degrees < 360; degrees += 15) {
      const angle = degrees * Math.PI / 180;
      for (const [x, y] of [[0, 0], [width, 0], [width, height], [0, height]]) {
        const dx = x - width / 2, dy = y - height / 2;
        const rotatedX = width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle);
        const rotatedY = height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle);
        assert.ok(Math.hypot(rotatedX - grid.cx, rotatedY - grid.cy) < outer - grid.spacing);
      }
    }
    for (const ray of grid.rays) {
      assert.equal(ray.x1, grid.cx); assert.equal(ray.y1, grid.cy);
      assert.ok(Math.hypot(ray.x2 - grid.cx, ray.y2 - grid.cy) >= outer - 1);
    }
  }
});
