import { afterEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSyntheticDemoFixture } from '../hosted-demo/demo-fixture.js';
import { readDemoConfig } from '../hosted-demo/config.js';
import { readEncryptedJson, writeEncryptedJson } from '../hosted-demo/state.js';
import { SYNTHETIC_SUBJECT_ID } from '../../../shared/synthetic-context.mjs';
const directories:string[]=[];
const password='only-an-offline-unit-test-password';
afterEach(async()=>{vi.unstubAllEnvs();await Promise.all(directories.splice(0).map((d)=>fs.rm(d,{recursive:true,force:true})));});
async function config(){const stateDir=await fs.mkdtemp(path.join(os.tmpdir(),'midproof-synthetic-test-'));directories.push(stateDir);return readDemoConfig({MIDNIGHT_DEMO_MODE:'hosted-demo',MIDNIGHT_DEMO_INTERNAL_TOKEN:'x'.repeat(48),MIDNIGHT_DEMO_STATE_DIR:stateDir,MIDPROOF_SYNTHETIC_ONLY:'true'});}
it('requires explicit activation and never reads the old role-key fixture file',async()=>{
  const c=await config();vi.stubEnv('MIDPROOF_DEMO_FIXTURE_FILE','/must-not-open-an-existing-wallet');
  expect(await loadSyntheticDemoFixture({...c,syntheticOnly:false},password)).toBeUndefined();expect(await fs.readdir(c.stateDir)).toEqual([]);
  expect((await loadSyntheticDemoFixture(c,password))?.onchainReceivableId).toBe(SYNTHETIC_SUBJECT_ID);
});
it('automatically creates encrypted internal auth keys once and preserves them after restart',async()=>{
  const c=await config();const first=await loadSyntheticDemoFixture(c,password);const file=path.join(c.stateDir,'synthetic-auth.enc');const before=await fs.readFile(file,'utf8');
  const row=await readEncryptedJson<Record<string,string>>(file,password);expect(before).not.toContain(row!.sellerPrivateKey);expect(before).not.toContain(row!.buyerPrivateKey);
  expect((await fs.stat(file)).mode&0o077).toBe(0);const restarted=await loadSyntheticDemoFixture(c,password);
  expect(restarted?.wallets).toEqual(first?.wallets);expect(restarted?.intendedFunderWallet).toBe(first?.intendedFunderWallet);expect(await fs.readFile(file,'utf8')).toBe(before);
});
it('does not regenerate keys after wrong password, network or reserved-context mismatch',async()=>{
  const c=await config();await loadSyntheticDemoFixture(c,password);const file=path.join(c.stateDir,'synthetic-auth.enc');const before=await fs.readFile(file,'utf8');
  await expect(loadSyntheticDemoFixture(c,'incorrect-password-for-test')).rejects.toThrow();await expect(loadSyntheticDemoFixture({...c,networkId:'undeployed'},password)).rejects.toThrow();expect(await fs.readFile(file,'utf8')).toBe(before);
  const row=await readEncryptedJson<Record<string,unknown>>(file,password);await writeEncryptedJson(file,password,{...row,onchainReceivableId:'7'});const altered=await fs.readFile(file,'utf8');
  await expect(loadSyntheticDemoFixture(c,password)).rejects.toThrow('SYNTHETIC_CONTEXT_MISMATCH');expect(await fs.readFile(file,'utf8')).toBe(altered);
});

it('refuses to regenerate missing auth keys when synthetic runs already exist',async()=>{
  const c=await config();await writeEncryptedJson(path.join(c.stateDir,'synthetic-demo-runs.enc'),password,[]);
  await expect(loadSyntheticDemoFixture(c,password)).rejects.toThrow('SYNTHETIC_AUTH_STATE_MISSING');
  expect(await fs.readdir(c.stateDir)).toEqual(['synthetic-demo-runs.enc']);
});
it('preserves unrelated legacy fixture runs while initializing the independent namespace',async()=>{
  const c=await config();await writeEncryptedJson(path.join(c.stateDir,'demo-runs.enc'),password,[{legacy:'preserve'}]);
  const before=await fs.readFile(path.join(c.stateDir,'demo-runs.enc'),'utf8');await loadSyntheticDemoFixture(c,password);
  expect(await fs.readFile(path.join(c.stateDir,'demo-runs.enc'),'utf8')).toBe(before);
});
