// HOST-ONLY corpus integrity. This is not Oreslang compiler/runtime conformance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, lstatSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const scalar=join(here,'scalar');
const expectedBackends=['java-graalvm','llvm','wasm','cranelift','net-nativeaot'];
const expectedCases=['01-precedence.ores','02-grouping.ores','03-signed.ores',
'04-i64-edge.ores','05-separators.ores','06-nested.ores',
'07-unknown-reject.ores','08-overflow-reject.ores','09-syntax-reject.ores'];
const manifest=JSON.parse(readFileSync(join(scalar,'manifest.json'),'utf8'));
const digest=b=>createHash('sha256').update(b).digest('hex');

function validate(m,{read=path=>readFileSync(join(scalar,path)),stat=path=>lstatSync(join(scalar,path))}={}){
  if(m===null || typeof m!=='object' || Array.isArray(m) || m.schema_version!==1 ||
    m.profile!=='oreslang-client-scalar-v1' || m.status!=='candidate_unverified' ||
    m.requires_real_guest_execution!==true || m.requires_identical_source_bytes!==true ||
    m.must_fail_without_all_backends!==true) throw Error('unsafe corpus declaration');
  if(!Array.isArray(m.allowed_toolchains) ||
    m.allowed_toolchains.length!==5 ||
    m.allowed_toolchains.some((b,i)=>b!==expectedBackends[i]))
    throw Error('backend set is incomplete or changed');
  if(!Array.isArray(m.cases) || m.cases.length!==9) throw Error('case roster incomplete');
  const seen=new Set();
  for(const c of m.cases){
    if(c===null || typeof c!=='object' ||
      typeof c.path!=='string' || !/^[0-9]{2}-[a-z0-9-]+\.ores$/.test(c.path) ||
      seen.has(c.path)) throw Error('invalid/duplicate case path');
    seen.add(c.path);
    if(!expectedCases.includes(c.path)) throw Error('unknown fixture');
    if(c.kind!=='value' && c.kind!=='compile_reject') throw Error('invalid verdict');
    if(!/^[0-9a-f]{64}$/.test(c.sha256||'')) throw Error('unreviewed source digest');
    if(c.kind==='value'){
      if(!Number.isSafeInteger(c.expected_value) || c.expected_value<0 ||
        c.expected_value>255 || c.expected_diagnostic_category!==undefined)
        throw Error('invalid value oracle');
    }else{
      if(!['unknown_symbol','integer_range','syntax'].includes(c.expected_diagnostic_category) ||
        c.expected_value!==undefined) throw Error('invalid rejection oracle');
    }
    const f=stat(c.path);
    if(!f.isFile() || f.isSymbolicLink()) throw Error('unsafe fixture file');
    const bytes=read(c.path);
    if(!Buffer.isBuffer(bytes) || bytes.length===0 || bytes.length>2048 ||
      bytes.includes(0)) throw Error('unsafe source bytes');
    const str=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(!str.includes('fnc main(): int') || /\b(import|module|actor|suspends|await|critical)\b/.test(str))
      throw Error('not a stand-alone scalar guest');
    if(digest(bytes)!==c.sha256) throw Error('modified source bytes');
  }
  if(seen.size!==expectedCases.length || expectedCases.some(c=>!seen.has(c)))
    throw Error('case roster mismatch');
  if(!Array.isArray(m.required_evidence) ||
    !['exact_head_sha','compiler_binary_sha256','runtime_binary_sha256',
      'stepful_compile_and_guest_execution','negative_no_artifact'].every(
       x=>m.required_evidence.includes(x)))
    throw Error('evidence contract weakened');
  return true;
}

test('complete five-backend corpus and immutable fixture bytes',()=>{
  assert.equal(validate(manifest),true);
  assert.deepEqual(readdirSync(scalar).filter(x=>x.endsWith('.ores')).sort(),
    [...expectedCases].sort());
});
test('nine corpus entries: six observable integer results and three compiler denials',()=>{
  assert.equal(manifest.cases.filter(x=>x.kind==='value').length,6);
  assert.equal(manifest.cases.filter(x=>x.kind==='compile_reject').length,3);
});
test('reject missing or reordered backend, false published status and missing runtime requirement',()=>{
  for(const bad of [
    {...manifest,allowed_toolchains:['java-graalvm']},
    {...manifest,allowed_toolchains:[...manifest.allowed_toolchains].reverse()},
    {...manifest,status:'passed'},
    {...manifest,must_fail_without_all_backends:false},
    {...manifest,requires_real_guest_execution:false}
  ]) assert.throws(()=>validate(bad));
});
test('reject duplicate, substituted, missing and path-escape source',()=>{
  const cases=manifest.cases;
  for(const bad of [
    {...manifest,cases:[...cases.slice(1),cases[1]]},
    {...manifest,cases:cases.slice(1)},
    {...manifest,cases:[...cases.slice(0,8),{...cases[8],path:'../bad.ores'}]},
    {...manifest,cases:[...cases.slice(0,8),{...cases[8],path:'99-fake.ores'}]},
  ])assert.throws(()=>validate(bad));
});
test('reject digest changes even if guest source otherwise looks plausible',()=>{
  const bad={...manifest,cases:[{...manifest.cases[0],sha256:'0'.repeat(64)},...manifest.cases.slice(1)]};
  assert.throws(()=>validate(bad),/modified source bytes/);
});
test('reject any forged source-body substitution',()=>{
  const changed=Buffer.from('fnc main(): int { return 0; }\n');
  assert.throws(()=>validate(manifest,{read:()=>changed}),/modified source bytes/);
});
test('reject symlinks and directory masquerading',()=>{
  const regular={isFile:()=>true,isSymbolicLink:()=>false};
  assert.throws(()=>validate(manifest,{stat:()=>({...regular,isSymbolicLink:()=>true})}),/unsafe fixture file/);
  assert.throws(()=>validate(manifest,{stat:()=>({...regular,isFile:()=>false})}),/unsafe fixture file/);
});
test('reject non-UTF8, NUL and excessive guest bytes',()=>{
  const good=readFileSync(join(scalar,expectedCases[0]));
  for(const bytes of [Buffer.from([0xff]),Buffer.concat([good,Buffer.from([0])]),Buffer.alloc(4096,32)])
    assert.throws(()=>validate(manifest,{read:()=>bytes}),/unsafe source bytes|encoded data|UTF-8/i);
});
test('reject guest imports, injected arbitrary language and fake runner evidence',()=>{
  const cases=manifest.cases;
  for(const kind of ['passing','skipped','infrastructure_failure']){
    const m={...manifest,cases:[{...cases[0],kind},...cases.slice(1)]};
    assert.throws(()=>validate(m),/invalid verdict/);
  }
  assert.throws(()=>validate(manifest,{read:()=>Buffer.from('import module x; fnc main(): int { return 42; }')}),/not a stand-alone scalar guest/);
});
test('reject wrong numeric oracle, bogus negative diagnostic and weakened attestation',()=>{
  const cases=manifest.cases;
  assert.throws(()=>validate({...manifest,cases:[{...cases[0],expected_value:-1},...cases.slice(1)]}),/invalid value oracle/);
  assert.throws(()=>validate({...manifest,cases:[...cases.slice(0,6),{...cases[6],expected_diagnostic_category:'runner_unavailable'},...cases.slice(7)]}),/invalid rejection oracle/);
  assert.throws(()=>validate({...manifest,required_evidence:[]}),/evidence contract weakened/);
});
