#!/usr/bin/env node
// Offline, read-only reference checks. Never install, fetch, start services or
// open runtime state. A passing result is not a security or live-proof audit.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir, readlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = 'scripts/midnight-reference-baseline.json';

function inside(root, path) {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('UNSAFE_BASELINE_PATH');
  return target;
}

async function regularFile(root, path) {
  const target = await withoutSymlinkParents(root, path);
  if (!(await lstat(target)).isFile()) throw new Error('REGULAR_FILE_REQUIRED');
  return readFile(target);
}

async function withoutSymlinkParents(root, path, allowSymlinkLeaf = false) {
  const target = inside(root, path);
  const parts = relative(root, target).split(/[\\/]/);
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = resolve(current, parts[index]);
    if (allowSymlinkLeaf && index === parts.length - 1) break;
    if ((await lstat(current)).isSymbolicLink()) throw new Error('REFERENCE_SYMLINK');
  }
  return target;
}

function git(dir, args) {
  return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', dir, ...args], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function skillFiles(root, prefix = '.agents/skills') {
  const files = [];
  for (const entry of await readdir(await withoutSymlinkParents(root, prefix), { withFileTypes: true })) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error('REFERENCE_SYMLINK');
    if (entry.isDirectory()) files.push(...await skillFiles(root, path));
    else if (entry.name === 'SKILL.md') files.push(path);
  }
  return files.sort();
}

export async function checkMidnightReference(root = ROOT) {
  const errors = [];
  const warnings = [];
  let baseline;
  try {
    baseline = JSON.parse(await regularFile(root, BASELINE));
    if (baseline.schemaVersion !== 1 || !baseline.reference?.files
        || !Array.isArray(baseline.pins) || !Array.isArray(baseline.entrypoints)) {
      throw new Error('BASELINE_SCHEMA');
    }
  } catch {
    return { ok: false, errors: ['BASELINE_MISSING_OR_INVALID'], warnings };
  }

  let reference;
  try {
    reference = await withoutSymlinkParents(root, baseline.reference.directory);
    if (!(await lstat(reference)).isDirectory()) throw new Error('REFERENCE_DIRECTORY');
  } catch {
    errors.push('REFERENCE_MISSING: prepare the reviewed checkout; no automatic download');
  }

  let checkedFiles = 0;
  if (!errors.length) {
    for (const [path, expected] of Object.entries(baseline.reference.files)) {
      try {
        const digest = createHash('sha256').update(await regularFile(reference, path)).digest('hex');
        if (digest !== expected) errors.push(`REFERENCE_CHANGED: ${path}`);
        checkedFiles++;
      } catch {
        errors.push(`REFERENCE_FILE_MISSING_OR_INVALID: ${path}`);
      }
    }
    for (const [path, expected] of Object.entries(baseline.reference.symlinks || {})) {
      try {
        const target = await withoutSymlinkParents(reference, path, true);
        if (!(await lstat(target)).isSymbolicLink() || await readlink(target) !== expected) {
          errors.push(`REFERENCE_SYMLINK_CHANGED: ${path}`);
        }
        checkedFiles++;
      } catch {
        errors.push(`REFERENCE_SYMLINK_MISSING: ${path}`);
      }
    }
    try {
      const expected = Object.keys(baseline.reference.files).filter((p) => p.endsWith('/SKILL.md')).sort();
      if (JSON.stringify(await skillFiles(reference)) !== JSON.stringify(expected)) {
        errors.push('SKILL_INVENTORY_CHANGED: review added or removed skills');
      }
    } catch {
      errors.push('SKILL_INVENTORY_UNREADABLE');
    }
    let top;
    try { top = git(reference, ['rev-parse', '--show-toplevel']); } catch { /* Exact bytes still checked. */ }
    if (top && resolve(top) === reference) {
      try {
        if (git(reference, ['rev-parse', 'HEAD']) !== baseline.reference.commit) errors.push('REFERENCE_COMMIT_CHANGED');
        if (git(reference, ['status', '--porcelain', '--untracked-files=all'])) errors.push('REFERENCE_WORKTREE_DIRTY');
      } catch {
        errors.push('REFERENCE_GIT_UNREADABLE');
      }
    } else {
      warnings.push('REFERENCE_GIT_UNAVAILABLE: audited file hashes checked; Git provenance not checked');
    }
  }

  const jsonCache = new Map();
  for (const pin of baseline.pins) {
    try {
      if (!jsonCache.has(pin.path)) jsonCache.set(pin.path, JSON.parse(await regularFile(root, pin.path)));
      const actual = pin.keys.reduce((value, key) => value?.[key], jsonCache.get(pin.path));
      if (actual !== pin.expected) errors.push(`PROJECT_PIN_CHANGED: ${pin.path} ${pin.keys.join(' / ')}`);
    } catch {
      errors.push(`PROJECT_PIN_UNREADABLE: ${pin.path}`);
    }
  }
  try {
    const path = baseline.singleRuntime.lockfile;
    const lock = jsonCache.get(path) || JSON.parse(await regularFile(root, path));
    const suffix = `node_modules/${baseline.singleRuntime.package}`;
    const copies = Object.keys(lock.packages).filter((key) => key === suffix || key.endsWith(`/${suffix}`));
    if (copies.length !== 1) errors.push('MULTIPLE_ONCHAIN_RUNTIME_COPIES: review WASM identity compatibility');
  } catch {
    errors.push('ONCHAIN_RUNTIME_LOCK_UNREADABLE');
  }

  for (const entry of baseline.entrypoints) {
    try {
      const source = (await regularFile(root, entry.path)).toString('utf8');
      for (const marker of entry.contains || []) {
        if (!source.includes(marker)) errors.push(`HARNESS_LINK_OR_RUNTIME_PIN_CHANGED: ${entry.path}`);
      }
    } catch {
      errors.push(`HARNESS_FILE_MISSING: ${entry.path}`);
    }
  }

  return { ok: errors.length === 0, referenceCommit: baseline.reference.commit,
    checkedFiles, errors: [...new Set(errors)], warnings,
    scope: 'Offline reference integrity, project pins and instruction links only; no build/proof/live validation.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--json')) {
    process.stderr.write('Usage: node scripts/check-midnight-reference.mjs [--json]\n');
    process.exitCode = 2;
  } else {
    const result = await checkMidnightReference();
    if (args.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      process.stdout.write(`Midnight reference: ${result.ok ? 'PASS' : 'REVIEW REQUIRED'} (${result.checkedFiles || 0} files)\n`);
      if (result.referenceCommit) process.stdout.write(`Reviewed commit: ${result.referenceCommit}\n`);
      for (const error of result.errors) process.stdout.write(`ERROR ${error}\n`);
      for (const warning of result.warnings) process.stdout.write(`WARN ${warning}\n`);
      process.stdout.write(`${result.scope || 'Check the baseline file.'}\n`);
    }
    process.exitCode = result.ok ? 0 : 1;
  }
}
