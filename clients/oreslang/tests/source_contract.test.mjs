// HOST-ONLY source safety checks, never proof of Oreslang compilation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, lstatSync} from 'node:fs';

const plan = JSON.parse(readFileSync(new URL('./conformance-plan.json', import.meta.url), 'utf8'));
const matrix = readFileSync(new URL('../../support-matrix.toml', import.meta.url), 'utf8');

function checkedSource(relative) {
  assert.match(relative, /^(src|tests)\/[a-z_]+\.ores$/);
  const location = new URL('../' + relative, import.meta.url);
  const file = lstatSync(location);
  assert.equal(file.isSymbolicLink(), false, 'no symlinked native fixtures');
  assert.equal(file.isFile(), true, 'native fixture must be a regular file');
  const content = readFileSync(location, 'utf8');
  assert.ok(content.trim().length > 20, 'empty native fixture');
  return content;
}

test('candidate cannot be published or registered as a proven language', () => {
  assert.equal(plan.language, 'oreslang');
  assert.equal(plan.publishable, false);
  assert.equal(plan.status, 'candidate_unverified');
  assert.doesNotMatch(matrix, /^\[languages\.oreslang\]/m);
  assert.equal(plan.required_backends.length, 5);
  for (const backend of ['java-graalvm', 'llvm', 'cranelift', 'wasm', 'net-nativeaot'])
    assert.ok(plan.required_backends.includes(backend));
});

test('all declared positive guests and negative compile cases exist', () => {
  assert.equal(plan.positive_guests.length, 2);
  assert.equal(plan.negative_compile_guests.length, 1);
  for (const entry of plan.positive_guests) {
    assert.equal(entry.expected_exit, 0);
    checkedSource(entry.source);
  }
  for (const entry of plan.negative_compile_guests) {
    assert.equal(entry.expected_rejected, true);
    assert.equal(entry.emitted_artifacts, 0);
    checkedSource(entry.source);
  }
});

test('source-only guards do not pretend to include an HTTP transport', () => {
  const admission = checkedSource('src/health_admission.ores');
  const url = checkedSource('src/health_url.ores');
  const negative = checkedSource('tests/reject_unknown_operation.ores');
  assert.match(admission, /admit_health_response/);
  assert.match(url, /valid_origin/);
  assert.match(negative, /nonexistent_client_operation/);
  assert.equal(plan.runtime_verified, undefined);
  assert.equal(plan.required_receipts.includes('stepful_guest_execution'), true);
});
