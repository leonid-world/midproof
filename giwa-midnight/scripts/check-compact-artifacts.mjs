import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, lstat, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execute = promisify(execFile);
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../contract');
const managed = 'src/managed/zkloan-credit-scorer';
const manifestName = 'artifact-manifest.json';
const versions = { 'compiler-version': '0.31.1', 'language-version': '0.23.0', 'runtime-version': '0.16.0' };

async function inventory(root, relative, sourceOnly = false) {
  const entries = {};
  const directory = path.join(root, relative);
  if ((await lstat(directory)).isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${relative}`);
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${name}`);
    // Check the parent before skipping generated sources: lstat on the later
    // managed leaf cannot detect a symbolic link in an ancestor directory.
    if (sourceOnly && name === 'src/managed') continue;
    if (entry.isDirectory()) Object.assign(entries, await inventory(root, name, sourceOnly));
    else if (entry.isFile() && (!sourceOnly || name.endsWith('.compact'))) {
      entries[name] = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
    }
  }
  return entries;
}

async function inspect(root) {
  const sources = await inventory(root, 'src', true);
  if (!sources['src/zkloan-credit-scorer.compact'] || !sources['src/schnorr.compact']) throw new Error('Compact sources are missing.');
  const artifacts = await inventory(root, managed);
  const info = JSON.parse(await readFile(path.join(root, managed, 'compiler/contract-info.json'), 'utf8'));
  for (const [key, value] of Object.entries(versions)) {
    if (info[key] !== value) throw new Error(`Expected ${key} ${value}.`);
  }
  for (const suffix of ['contract/index.js', 'contract/index.d.ts']) {
    if (!artifacts[`${managed}/${suffix}`]) throw new Error(`Missing generated ${suffix}.`);
  }
  const circuits = info.circuits?.filter((circuit) => circuit.proof === true);
  if (!circuits?.length) throw new Error('No proof circuits in compiler metadata.');
  for (const circuit of circuits) {
    if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(circuit.name)) throw new Error('Invalid circuit name.');
    for (const suffix of [`keys/${circuit.name}.prover`, `keys/${circuit.name}.verifier`, `zkir/${circuit.name}.zkir`, `zkir/${circuit.name}.bzkir`]) {
      if (!artifacts[`${managed}/${suffix}`] || (await lstat(path.join(root, managed, suffix))).size === 0) {
        throw new Error(`Full Compact artifacts required: ${suffix}.`);
      }
    }
  }
  return { schemaVersion: 1, versions, sources, artifacts };
}

export async function checkArtifacts(root = defaultRoot) {
  const manifest = JSON.parse(await readFile(path.join(root, manifestName), 'utf8'));
  const actual = await inspect(root);
  if (JSON.stringify(manifest) !== JSON.stringify(actual)) {
    throw new Error('Compact source/artifact provenance differs. Run npm run compact --workspace=contract for a full pinned compile.');
  }
  return { sources: Object.keys(actual.sources).length, artifacts: Object.keys(actual.artifacts).length };
}

// There is deliberately no record-only CLI: normal regeneration always runs the
// pinned full compiler. The injected runner is only for offline workflow tests.
export async function compileAndRecord(root = defaultRoot, run = execute) {
  const before = await inventory(root, 'src', true);
  await run('compact', ['compile', '+0.31.1', 'src/zkloan-credit-scorer.compact', managed],
    { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  const actual = await inspect(root);
  if (JSON.stringify(before) !== JSON.stringify(actual.sources)) throw new Error('Compact source changed during compilation; rerun the compile.');
  const temporary = path.join(root, `${manifestName}.${process.pid}.tmp`);
  await writeFile(temporary, JSON.stringify(actual, null, 2) + '\n', { mode: 0o644 });
  await rename(temporary, path.join(root, manifestName));
  return checkArtifacts(root);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== '--compile')) throw new Error('Only --compile is supported.');
    const result = await (process.argv.includes('--compile') ? compileAndRecord() : checkArtifacts());
    process.stdout.write(`Compact artifacts OK: ${result.sources} sources, ${result.artifacts} artifacts; compiler 0.31.1.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`); process.exitCode = 1;
  }
}
