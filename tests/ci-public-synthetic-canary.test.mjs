import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { makeRecord, verifyRecord } from '../scripts/ci-public-synthetic-canary.mjs';

const repo='gha-indie-worker/gha-indie-worker-clients';
const head='a'.repeat(40), tree='b'.repeat(40);
const payload=Buffer.from(['PUBLIC_RUNNER_ADMISSION_CANARY_V1',repo,head,tree,''].join('\n'),'utf8');
const valid=()=>makeRecord(repo,head,tree);
const verify=r=>verifyRecord(r,repo,head,tree,payload);

test('exact synthetic canary accepted',()=>assert.equal(verify(valid()),true));
for(const [label,modify] of [
  ['wrong repository',r=>r.repo='other/private-repo'],
  ['stale head',r=>r.sourceCommit='c'.repeat(40)],
  ['changed tree',r=>r.sourceTree='c'.repeat(40)],
  ['forged digest',r=>r.sha256='0'.repeat(64)],
  ['length mismatch',r=>r.bytes--],
  ['false approval',r=>r.privateExportApproved=true],
  ['missing digest',r=>delete r.sha256],
  ['kind tampering',r=>r.kind='private-source']
]) test('reject '+label,()=>{
  const r=valid(); modify(r); assert.throws(()=>verify(r));
});
test('reject private-source bytes even with recomputed digest',()=>{
  const other=Buffer.from('THIS IS NOT A PUBLIC SYNTHETIC FIXTURE');
  const record={...valid(),bytes:other.length,sha256:createHash('sha256').update(other).digest('hex')};
  assert.throws(()=>verifyRecord(record,repo,head,tree,other),/unexpected payload/);
});
test('reject unapproved repo identity and malformed head',()=>{
  assert.throws(()=>makeRecord('private/source',head,tree));
  assert.throws(()=>makeRecord(repo,'branch-name',tree));
});
test('workflow uses no private checkout, secrets or write token',()=>{
  const flow=readFileSync(new URL('../.github/workflows/public-runner-admission-canary.yml',import.meta.url),'utf8');
  assert.match(flow,/pull_request:/);
  assert.match(flow,/contents: read/);
  assert.match(flow,/persist-credentials: false/);
  assert.match(flow,/submodules: false/);
  assert.match(flow,/github\.event\.pull_request\.head\.sha/);
  assert.match(flow,/node --test tests\/ci-public-synthetic-canary\.test\.mjs/);
  assert.doesNotMatch(flow,/pull_request_target:|secrets\.|contents: write|id-token: write|packages: write/);
  assert.doesNotMatch(flow,/^\s+repository:/m);
});
