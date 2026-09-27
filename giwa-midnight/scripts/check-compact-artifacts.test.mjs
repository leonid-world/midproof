import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkArtifacts, compileAndRecord } from './check-compact-artifacts.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gasok-compact-artifacts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const managed = 'src/managed/zkloan-credit-scorer';
  for (const d of ['contract', 'compiler', 'keys', 'zkir']) await mkdir(path.join(root, managed, d), { recursive: true });
  const put = (file, value = 'fixture') => writeFile(path.join(root, file), value);
  await put('src/schnorr.compact'); await put('src/zkloan-credit-scorer.compact');
  await put(`${managed}/compiler/contract-info.json`, JSON.stringify({
    'compiler-version': '0.31.1', 'language-version': '0.23.0', 'runtime-version': '0.16.0', circuits: [{ name: 'verify', proof: true }],
  }));
  for (const name of ['contract/index.js', 'contract/index.d.ts', 'keys/verify.prover', 'keys/verify.verifier', 'zkir/verify.zkir', 'zkir/verify.bzkir']) await put(`${managed}/${name}`);
  const run = async (command, args) => {
    assert.equal(command, 'compact'); assert.deepEqual(args, ['compile', '+0.31.1', 'src/zkloan-credit-scorer.compact', managed]);
  };
  return { root, managed, put, run };
}

test('a full pinned compile records provenance and unchanged bytes validate', async (t) => {
  const f = await fixture(t);
  await assert.rejects(checkArtifacts(f.root));
  await compileAndRecord(f.root, f.run);
  assert.deepEqual(await checkArtifacts(f.root), { sources: 2, artifacts: 7 });
});
test('source-only changes, changed artifacts and extra source files cannot pass', async (t) => {
  const f = await fixture(t); await compileAndRecord(f.root, f.run);
  await f.put('src/schnorr.compact', 'changed'); await assert.rejects(checkArtifacts(f.root), /provenance differs/);
  await f.put('src/schnorr.compact'); await f.put(`${f.managed}/keys/verify.verifier`, 'changed');
  await assert.rejects(checkArtifacts(f.root), /provenance differs/);
  await f.put(`${f.managed}/keys/verify.verifier`); await f.put('src/new.compact');
  await assert.rejects(checkArtifacts(f.root), /provenance differs/);
});
test('failed or incomplete compilation cannot bless existing outputs', async (t) => {
  const f = await fixture(t); await compileAndRecord(f.root, f.run);
  const previous = await readFile(path.join(f.root, 'artifact-manifest.json'), 'utf8');
  await assert.rejects(compileAndRecord(f.root, async () => { throw new Error('compile failed'); }));
  await rm(path.join(f.root, f.managed, 'keys/verify.prover'));
  await assert.rejects(compileAndRecord(f.root, f.run), /Full Compact artifacts required/);
  assert.equal(await readFile(path.join(f.root, 'artifact-manifest.json'), 'utf8'), previous);
});
test('wrong compiler, symlink replacement and source changes during compile fail closed', async (t) => {
  const f = await fixture(t); await compileAndRecord(f.root, f.run);
  await assert.rejects(compileAndRecord(f.root, async () => { await f.put('src/schnorr.compact', 'raced'); }), /changed during compilation/);
  await f.put('src/schnorr.compact');
  const file = path.join(f.root, f.managed, 'contract/index.js'); await rm(file); await symlink(path.join(f.root, 'src/schnorr.compact'), file);
  await assert.rejects(checkArtifacts(f.root), /Symbolic links/);
  await rm(file); await f.put(`${f.managed}/contract/index.js`);
  await f.put(`${f.managed}/compiler/contract-info.json`, JSON.stringify({ 'compiler-version': 'other' }));
  await assert.rejects(checkArtifacts(f.root), /compiler-version/);
});

test('a symlinked managed parent cannot reuse matching artifact bytes or launch compilation', async (t) => {
  const f = await fixture(t); await compileAndRecord(f.root, f.run);
  const manifest = await readFile(path.join(f.root, 'artifact-manifest.json'), 'utf8');
  const external = await mkdtemp(path.join(os.tmpdir(), 'gasok-external-artifacts-'));
  t.after(() => rm(external, { recursive: true, force: true }));
  const managedParent = path.join(f.root, 'src/managed');
  await rename(managedParent, path.join(external, 'managed'));
  await symlink(path.join(external, 'managed'), managedParent, 'dir');
  // No bytes changed; the previous hash manifest would otherwise still match.
  await assert.rejects(checkArtifacts(f.root), /Symbolic links are not allowed: src\/managed/);
  let compilerInvoked = false;
  await assert.rejects(compileAndRecord(f.root, async () => { compilerInvoked = true; }), /Symbolic links/);
  assert.equal(compilerInvoked, false);
  assert.equal(await readFile(path.join(f.root, 'artifact-manifest.json'), 'utf8'), manifest);
});
