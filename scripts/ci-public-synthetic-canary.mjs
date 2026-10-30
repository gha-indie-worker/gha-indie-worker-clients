import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const allowed = 'gha-indie-worker/gha-indie-worker-clients';
const repoId = 1347878296;
const exactKeys = ['bytes','kind','repo','repoId','sha256','sourceCommit','sourceTree','v'];

function synthetic(repo, commit, tree) {
  assert.equal(repo, allowed, 'unexpected public canary repository');
  assert.match(commit, SHA40, 'invalid commit SHA');
  assert.match(tree, SHA40, 'invalid tree SHA');
  return Buffer.from(['PUBLIC_RUNNER_ADMISSION_CANARY_V2',repo,String(repoId),commit,tree,''].join('\n'),'utf8');
}
export function makeRecord(repo, commit, tree) {
  const data = synthetic(repo, commit, tree);
  return {v:2,kind:'synthetic-only',repo,repoId,sourceCommit:commit,sourceTree:tree,
    bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
}
export function verifyRecord(record, repo, commit, tree, data) {
  assert.ok(record && typeof record==='object' && !Array.isArray(record));
  assert.deepEqual(Object.keys(record).sort(), exactKeys, 'unexpected record fields');
  assert.equal(record.v,2);
  assert.equal(record.kind,'synthetic-only');
  assert.equal(record.repo,repo);
  assert.equal(record.repoId,repoId,'numeric repository ID mismatch');
  assert.equal(record.sourceCommit,commit);
  assert.equal(record.sourceTree,tree);
  assert.ok(Buffer.isBuffer(data));
  assert.deepEqual(data, synthetic(repo,commit,tree), 'unexpected payload (possible private data)');
  assert.equal(record.bytes,data.length,'length mismatch');
  assert.match(record.sha256,HEX64);
  assert.equal(record.sha256,createHash('sha256').update(data).digest('hex'),'digest mismatch');
  return true;
}
const git = arg=>execFileSync('git',['rev-parse',arg],{encoding:'utf8'}).trim();
export function requireCleanGitStatus(status) {
  assert.equal(status,'','carrier checkout dirty (tracked, staged, untracked or ignored)');
}
export function gitStatus(cwd=process.cwd()) {
  return execFileSync('git',['status','--porcelain=v1','--untracked-files=all','--ignored=matching'],
    {cwd,encoding:'utf8',timeout:10000});
}
export function verifyRunner(expectedCommit) {
  assert.equal(process.env.GITHUB_REPOSITORY,allowed,'event repository mismatch');
  assert.equal(process.env.GITHUB_REPOSITORY_ID,String(repoId),'GitHub repository ID mismatch');
  assert.ok(process.env.GITHUB_WORKSPACE);
  assert.equal(realpathSync(process.cwd()),realpathSync(process.env.GITHUB_WORKSPACE));
  assert.match(expectedCommit,SHA40);
  assert.equal(git('HEAD'),expectedCommit,'checkout not bound to event commit');
  const tree=git('HEAD^{tree}');
  assert.match(tree,SHA40);
  requireCleanGitStatus(gitStatus());
  for(const name of ['GH_TOKEN','PRIVATE_CARGO_TOKEN','GIT_ASKPASS','CI_MIRROR_TOKEN',
    'CANONICAL_LIB_READ_TOKEN','NUGET_AUTH_TOKEN']) {
    assert.ok(!process.env[name],'canary must run without secret-bearing environment: '+name);
  }
  const data=synthetic(allowed,expectedCommit,tree);
  const record=makeRecord(allowed,expectedCommit,tree);
  verifyRecord(record,allowed,expectedCommit,tree,data);
  assert.equal(git('HEAD^{tree}'),tree,'tree changed during canary');
  assert.equal(git('HEAD'),expectedCommit,'commit changed during canary');
  requireCleanGitStatus(gitStatus());
  process.stdout.write('PUBLIC_CANARY_EVIDENCE='+JSON.stringify(record)+'\n');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv[2],'--run');
  assert.equal(process.argv.length,4);
  verifyRunner(process.argv[3]);
}
