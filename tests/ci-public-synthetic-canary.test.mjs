import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gitStatus, makeRecord, verifyRecord, requireCleanGitStatus } from '../scripts/ci-public-synthetic-canary.mjs';

const repo='gha-indie-worker/gha-indie-worker-clients';
const head='a'.repeat(40), tree='b'.repeat(40);
const payload=Buffer.from(['PUBLIC_RUNNER_ADMISSION_CANARY_V2',repo,'1347878296',head,tree,''].join('\n'),'utf8');
const valid=()=>makeRecord(repo,head,tree);
const verify=r=>verifyRecord(r,repo,head,tree,payload);

test('exact synthetic canary accepted',()=>assert.equal(verify(valid()),true));
for(const [label,modify] of [
  ['wrong repository',r=>r.repo='other/private-repo'],
  ['wrong numeric repository',r=>r.repoId=111111111],
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

test('reject tracked, staged, and untracked checkout tampering',()=>{
  assert.doesNotThrow(()=>requireCleanGitStatus(''));
  for(const state of [' M file.mjs\n','M  file.mjs\n','?? injected.mjs\n','A  staged.txt\n'])
    assert.throws(()=>requireCleanGitStatus(state),/carrier checkout dirty/);
});

test('real public synthetic Git checkout rejects tracked, staged, untracked and ignored bytes',()=>{
  const cwd=mkdtempSync(join(tmpdir(),'public-canary-clean-'));
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',timeout:10000});
  try {
    git('init','-q');
    writeFileSync(join(cwd,'fixture.txt'),'baseline\n');
    writeFileSync(join(cwd,'.gitignore'),'secret-ignored.txt\n');
    git('add','fixture.txt','.gitignore');
    git('-c','user.name=Public Canary','-c','user.email=canary@example.invalid','commit','-qm','synthetic');
    requireCleanGitStatus(gitStatus(cwd));
    writeFileSync(join(cwd,'fixture.txt'),'modified\n');
    assert.throws(()=>requireCleanGitStatus(gitStatus(cwd)),/dirty/);
    git('add','fixture.txt');
    assert.throws(()=>requireCleanGitStatus(gitStatus(cwd)),/dirty/);
    git('reset','-q','--hard','HEAD');
    writeFileSync(join(cwd,'untracked.txt'),'untracked\n');
    assert.throws(()=>requireCleanGitStatus(gitStatus(cwd)),/dirty/);
    rmSync(join(cwd,'untracked.txt'));
    writeFileSync(join(cwd,'secret-ignored.txt'),'hidden\n');
    assert.match(gitStatus(cwd),/!! secret-ignored\.txt/);
    assert.throws(()=>requireCleanGitStatus(gitStatus(cwd)),/dirty/);
  } finally {rmSync(cwd,{recursive:true,force:true})}
});
