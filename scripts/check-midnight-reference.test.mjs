import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkMidnightReference } from './check-midnight-reference.mjs';

// Every input is synthetic and confined to temporary directories. No actual
// reference checkout, project lockfile, runtime state or credentials are read.
const BASELINE = 'scripts/midnight-reference-baseline.json';
const REFERENCE = 'Midnight-Skills';
const SKILL = '.agents/skills/testing/SKILL.md';
const LINK = '.claude/skills/testing';
const LINK_TARGET = '../../.agents/skills/testing';
const RUNTIME = '@midnight-ntwrk/onchain-runtime-v3';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function put(root, path, value) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), value);
}

async function json(root, path, value) {
  await put(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

async function temporary(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gasok-reference-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function fixture(t) {
  const root = await temporary(t);
  const reference = join(root, REFERENCE);
  const files = { 'README.md': '# Synthetic reference\n', [SKILL]: '# Synthetic test skill\n' };
  for (const [path, content] of Object.entries(files)) await put(reference, path, content);
  await mkdir(dirname(join(reference, LINK)), { recursive: true });
  await symlink(LINK_TARGET, join(reference, LINK));
  await json(root, 'project/package.json', { dependencies: { [RUNTIME]: '3.0.0' } });
  await json(root, 'project/package-lock.json', {
    lockfileVersion: 3,
    packages: { [`node_modules/${RUNTIME}`]: { version: '3.0.0' } },
  });
  await put(root, 'AGENTS.md', 'Read docs/ai/HARNESS.md before Midnight work.\n');
  await put(root, 'docs/ai/HARNESS.md', '# Offline synthetic harness\n');
  const baseline = {
    schemaVersion: 1,
    reference: {
      directory: REFERENCE,
      commit: '0'.repeat(40),
      files: Object.fromEntries(Object.entries(files).map(([path, content]) => [path, sha256(content)])),
      symlinks: { [LINK]: LINK_TARGET },
    },
    pins: [{ path: 'project/package.json', keys: ['dependencies', RUNTIME], expected: '3.0.0' }],
    singleRuntime: { lockfile: 'project/package-lock.json', package: RUNTIME },
    entrypoints: [
      { path: 'AGENTS.md', contains: ['docs/ai/HARNESS.md'] },
      { path: 'docs/ai/HARNESS.md' },
    ],
  };
  await json(root, BASELINE, baseline);
  return { root, reference, baseline };
}

async function snapshot(root, prefix = '') {
  const records = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const path = join(prefix, name);
    const absolute = join(root, path);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) records.push([path, 'link', await readlink(absolute)]);
    else if (info.isDirectory()) records.push([path, 'directory'], ...await snapshot(root, path));
    else records.push([path, info.mode, info.mtimeMs, sha256(await readFile(absolute))]);
  }
  return records;
}

function git(root, ...args) {
  const environment = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Offline Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Offline Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };
  for (const key of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
    delete environment[key];
  }
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', '-C', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000,
    env: environment,
  }).trim();
}

test('missing or invalid baseline fails without inventing a reference', async (t) => {
  const root = await temporary(t);
  assert.deepEqual((await checkMidnightReference(root)).errors, ['BASELINE_MISSING_OR_INVALID']);
  await put(root, BASELINE, '{ invalid json');
  assert.deepEqual((await checkMidnightReference(root)).errors, ['BASELINE_MISSING_OR_INVALID']);
  await json(root, BASELINE, { schemaVersion: 99 });
  assert.deepEqual((await checkMidnightReference(root)).errors, ['BASELINE_MISSING_OR_INVALID']);
  assert.deepEqual((await readdir(root)).sort(), ['scripts']);
});

test('an exact archived reference passes with an explicit Git-provenance warning and no writes', async (t) => {
  const { root, reference } = await fixture(t);
  const before = await snapshot(root);
  const result = await checkMidnightReference(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.checkedFiles, 3);
  assert.match(result.warnings.join('\n'), /REFERENCE_GIT_UNAVAILABLE/);
  assert.equal(await readlink(join(reference, LINK)), LINK_TARGET);
  assert.deepEqual(await snapshot(root), before);
});

test('missing reference requests review and never downloads or recreates it', async (t) => {
  const { root, reference } = await fixture(t);
  await rm(reference, { recursive: true });
  const before = await snapshot(root);
  const result = await checkMidnightReference(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /REFERENCE_MISSING/);
  assert.deepEqual(await snapshot(root), before);
});

test('changed reference bytes are rejected without rewriting the reference or baseline', async (t) => {
  const { root, reference } = await fixture(t);
  await put(reference, 'README.md', '# Changed synthetic reference\n');
  const before = await snapshot(root);
  const result = await checkMidnightReference(root);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('REFERENCE_CHANGED: README.md'));
  assert.deepEqual(await snapshot(root), before);
});

test('missing reviewed skill and an additional unreviewed skill require inventory review', async (t) => {
  const { root, reference } = await fixture(t);
  await rm(join(reference, SKILL));
  await put(reference, '.agents/skills/new-skill/SKILL.md', '# Unreviewed synthetic skill\n');
  const result = await checkMidnightReference(root);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes(`REFERENCE_FILE_MISSING_OR_INVALID: ${SKILL}`));
  assert.match(result.errors.join('\n'), /SKILL_INVENTORY_CHANGED/);
});

test('an additional skill alone cannot pass merely because old hashes still match', async (t) => {
  const { root, reference } = await fixture(t);
  await put(reference, '.agents/skills/new-skill/SKILL.md', '# Unreviewed synthetic skill\n');
  const result = await checkMidnightReference(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /SKILL_INVENTORY_CHANGED/);
  assert.equal(result.errors.some((error) => error.startsWith('REFERENCE_CHANGED:')), false);
});

test('project package pin drift and nested duplicate WASM runtime are independently detected', async (t) => {
  const { root } = await fixture(t);
  await json(root, 'project/package.json', { dependencies: { [RUNTIME]: '4.0.0' } });
  await json(root, 'project/package-lock.json', { packages: {
    [`node_modules/${RUNTIME}`]: { version: '3.0.0' },
    [`node_modules/other/node_modules/${RUNTIME}`]: { version: '3.0.0' },
  } });
  const result = await checkMidnightReference(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /PROJECT_PIN_CHANGED/);
  assert.match(result.errors.join('\n'), /MULTIPLE_ONCHAIN_RUNTIME_COPIES/);
});

test('a lockfile with no required runtime cannot pass the single-runtime check', async (t) => {
  const { root } = await fixture(t);
  await json(root, 'project/package-lock.json', { packages: {} });
  const result = await checkMidnightReference(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /MULTIPLE_ONCHAIN_RUNTIME_COPIES/);
});

test('broken instruction marker and missing guide are both reported', async (t) => {
  const { root } = await fixture(t);
  await put(root, 'AGENTS.md', 'Read an unrelated guide.\n');
  await rm(join(root, 'docs/ai/HARNESS.md'));
  const result = await checkMidnightReference(root);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('HARNESS_LINK_OR_RUNTIME_PIN_CHANGED: AGENTS.md'));
  assert.ok(result.errors.includes('HARNESS_FILE_MISSING: docs/ai/HARNESS.md'));
});

test('changed reviewed symlink is rejected and neither symlink nor target is rewritten', async (t) => {
  const { root, reference } = await fixture(t);
  await rm(join(reference, LINK));
  await symlink('../../README.md', join(reference, LINK));
  const before = await snapshot(root);
  const result = await checkMidnightReference(root);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes(`REFERENCE_SYMLINK_CHANGED: ${LINK}`));
  assert.equal(await readlink(join(reference, LINK)), '../../README.md');
  assert.deepEqual(await snapshot(root), before);
});

test('an audited regular file cannot be replaced by a symlink to matching bytes', async (t) => {
  const { root, reference } = await fixture(t);
  await put(root, 'external-copy.md', '# Synthetic reference\n');
  await rm(join(reference, 'README.md'));
  await symlink('../external-copy.md', join(reference, 'README.md'));
  const before = await snapshot(root);
  const result = await checkMidnightReference(root);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('REFERENCE_FILE_MISSING_OR_INVALID: README.md'));
  assert.deepEqual(await snapshot(root), before);
});

test('symlink ancestor directories cannot redirect reviewed file reads outside the reference', async (t) => {
  const { root, reference } = await fixture(t);
  await put(root, 'external-agents/skills/testing/SKILL.md', '# Synthetic test skill\n');
  await rm(join(reference, '.agents'), { recursive: true });
  await symlink('../external-agents', join(reference, '.agents'));
  const before = await snapshot(root);
  const result = await checkMidnightReference(root);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes(`REFERENCE_FILE_MISSING_OR_INVALID: ${SKILL}`));
  assert.deepEqual(await snapshot(root), before);
});

test('a clean matching Git checkout passes, but a different commit with identical files requires review', async (t) => {
  const { root, reference, baseline } = await fixture(t);
  git(reference, 'init', '--quiet');
  git(reference, 'add', '.');
  git(reference, 'commit', '--quiet', '-m', 'Synthetic reviewed baseline');
  baseline.reference.commit = git(reference, 'rev-parse', 'HEAD');
  await json(root, BASELINE, baseline);
  const passing = await checkMidnightReference(root);
  assert.equal(passing.ok, true);
  assert.deepEqual(passing.warnings, []);
  git(reference, 'commit', '--quiet', '--allow-empty', '-m', 'Different synthetic provenance');
  const changed = await checkMidnightReference(root);
  assert.equal(changed.ok, false);
  assert.ok(changed.errors.includes('REFERENCE_COMMIT_CHANGED'));
  assert.equal(changed.errors.some((error) => error.startsWith('REFERENCE_CHANGED:')), false);
});

test('unreviewed files in a reference Git checkout are reported as a dirty worktree', async (t) => {
  const { root, reference, baseline } = await fixture(t);
  git(reference, 'init', '--quiet');
  git(reference, 'add', '.');
  git(reference, 'commit', '--quiet', '-m', 'Synthetic reviewed baseline');
  baseline.reference.commit = git(reference, 'rev-parse', 'HEAD');
  await json(root, BASELINE, baseline);
  await put(reference, 'unreviewed-example.mjs', '// Synthetic unreviewed example; never executed.\n');
  const result = await checkMidnightReference(root);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('REFERENCE_WORKTREE_DIRTY'));
});
