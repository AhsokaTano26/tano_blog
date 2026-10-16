import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planRelease } from '../release-plan.mjs';

function repository(t) {
  const dir = mkdtempSync(join(tmpdir(), 'blog-release-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Release Test');
  git('config', 'user.email', 'release@example.test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  let number = 0;
  const commit = message => {
    writeFileSync(join(dir, 'fixture'), String(++number));
    git('add', '.'); git('commit', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  writeFileSync(join(dir, 'VERSION'), '1.0.0\n');
  commit('feat: initial'); git('tag', 'v1.0.0');
  return { dir, git, commit };
}

test('release uses verified HEAD even when main advances during tests', t => {
  const { dir, git, commit } = repository(t);
  const verified = commit('fix: verified change');
  const untested = commit('feat: later change');
  git('tag', 'v1.1.0');
  git('update-ref', 'refs/remotes/origin/main', untested);
  git('checkout', '--detach', verified);
  const plan = planRelease(dir);
  assert.equal(plan.sha, verified);
  assert.equal(plan.version, '1.0.1');
  assert.equal(plan.publishLatest, false);
  assert.equal(git('rev-parse', 'HEAD'), verified);
});

test('a docs-only main advance still allows the verified release to update latest', t => {
  const { dir, git, commit } = repository(t);
  const verified = commit('fix: verified change');
  const docs = commit('docs: clarify deployment');
  git('update-ref', 'refs/remotes/origin/main', docs);
  git('checkout', '--detach', verified);
  const plan = planRelease(dir);
  assert.equal(plan.release, true);
  assert.equal(plan.version, '1.0.1');
  assert.equal(plan.sha, verified);
  assert.equal(plan.publishLatest, true);
  assert.equal(git('rev-parse', 'HEAD'), verified);
  assert.equal(git('rev-parse', 'refs/remotes/origin/main'), docs);
});

test('a newer reserved version prevents an older retry from replacing latest', t => {
  const { dir, git, commit } = repository(t);
  const verified = commit('fix: older release');
  git('tag', 'v1.0.1');
  commit('fix: newer reserved release');
  git('tag', '-a', 'v1.0.2', '-m', 'Reserve newer release');
  git('update-ref', 'refs/remotes/origin/main', verified);
  git('checkout', '--detach', verified);
  const plan = planRelease(dir);
  assert.equal(plan.release, true);
  assert.equal(plan.version, '1.0.1');
  assert.equal(plan.sha, verified);
  assert.equal(plan.publishLatest, false);
});

test('rerun with an existing tag still repairs missing release artifacts', t => {
  const { dir, git, commit } = repository(t);
  const sha = commit('fix: repair'); git('tag', 'v1.0.1');
  git('update-ref', 'refs/remotes/origin/main', sha);
  const plan = planRelease(dir);
  assert.equal(plan.release, true);
  assert.equal(plan.version, '1.0.1');
  assert.equal(plan.previousTag, 'v1.0.0');
  assert.equal(plan.sha, sha);
  assert.equal(plan.publishLatest, true);
});

test('scoped feature and breaking footer produce correct semver', t => {
  const { dir, commit } = repository(t);
  commit('feat(editor): improve save');
  assert.equal(planRelease(dir).version, '1.1.0');
  commit('fix: update API\n\nBREAKING CHANGE: old endpoint removed');
  assert.equal(planRelease(dir).version, '2.0.0');
});

test('documentation-only changes do not republish an older version', t => {
  const { dir, commit } = repository(t); commit('docs: clarify setup');
  assert.equal(planRelease(dir).release, false);
});

test('a version override is honored without rewriting the tested commit', t => {
  const { dir, git, commit } = repository(t);
  writeFileSync(join(dir, 'VERSION'), '2.3.4\n');
  const sha = commit('chore: request release');
  assert.equal(planRelease(dir).version, '2.3.4');
  assert.equal(git('rev-parse', 'HEAD'), sha);
});

test('a colliding tag on another commit is rejected rather than overwritten', t => {
  const { dir, git, commit } = repository(t);
  git('checkout', '-b', 'other'); commit('fix: other'); git('tag', 'v1.0.1');
  git('checkout', 'main'); commit('fix: main');
  assert.throws(() => planRelease(dir), /already belongs to another commit/);
});
