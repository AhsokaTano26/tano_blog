import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const validVersion = /^\d+\.\d+\.\d+$/;
const compare = (a, b) => {
  const left = a.replace(/^v/, '').split('.').map(Number);
  const right = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
};

// Planning never changes HEAD, VERSION, tags or the remote. Every output is
// derived from the same commit that passed verification.
export function planRelease(cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const sha = git('rev-parse', 'HEAD');
  const tags = git('tag', '--merged', 'HEAD', '--list', 'v*').split('\n')
    .filter(tag => validVersion.test(tag.slice(1))).sort(compare);
  const exact = tags.filter(tag => git('rev-list', '-n', '1', tag) === sha);
  const previousTag = tags.filter(tag => !exact.includes(tag)).at(-1) || '';
  let version = exact.at(-1)?.slice(1);
  let release = true;
  if (!version) {
    const base = (previousTag || 'v0.0.0').slice(1);
    const messages = git('log', '--format=%B', previousTag ? `${previousTag}..HEAD` : 'HEAD');
    let [major, minor, patch] = base.split('.').map(Number);
    if (/^\w+(?:\([^\n)]*\))?!:|^BREAKING[ -]CHANGE:/m.test(messages)) { major++; minor = 0; patch = 0; }
    else if (/^feat(?:\([^\n)]*\))?:/m.test(messages)) { minor++; patch = 0; }
    else if (/^fix(?:\([^\n)]*\))?:/m.test(messages)) { patch++; }
    version = `${major}.${minor}.${patch}`;
    let requested = '';
    try { requested = readFileSync(resolve(cwd, 'VERSION'), 'utf8').trim(); } catch { /* optional for first release */ }
    if (requested && !validVersion.test(requested)) throw new Error('VERSION must be a stable major.minor.patch version');
    if (requested && compare(requested, version) > 0) version = requested;
    release = compare(version, base) > 0;
  }
  if (release) {
    let target;
    try { target = git('rev-list', '-n', '1', `v${version}`); } catch { /* not tagged yet */ }
    if (target && target !== sha) throw new Error(`v${version} already belongs to another commit`);
  }
  // The publish lock protects this tag snapshot through the image push. A main
  // advance may contain only docs and never run the workflow; only a newer
  // reserved or published version must prevent an older retry moving latest.
  const reservedTags = git('tag', '--list', 'v*').split('\n')
    .filter(tag => validVersion.test(tag.slice(1)));
  const publishLatest = release && !reservedTags.some(tag => compare(tag, version) > 0);
  return { release, version, previousTag, sha, publishLatest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = planRelease();
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(plan).map(([key, value]) => `${key}=${value}\n`).join(''));
  }
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}
