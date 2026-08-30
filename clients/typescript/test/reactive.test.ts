import assert from "node:assert/strict";
import test from "node:test";

import { Subject } from "rxjs";

import {
  Client,
  ClientError,
  observeHealth,
  type HealthProbeState,
} from "../src/index.js";

const encoder = new TextEncoder();
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

test("observeHealth emits immutable checking and available states", async () => {
  const triggers = new Subject<void>();
  const states: HealthProbeState[] = [];
  const client = new Client({
    baseUrl: "https://worker.example/",
    maxResponseBytes: 1024,
  });
  const subscription = observeHealth(triggers, client, async () =>
    encoder.encode('{"ok":true,"service":"gha-indie-worker-api-server"}'),
  ).subscribe((state) => states.push(state));

  triggers.next();
  await nextTurn();

  assert.deepEqual(
    states.map((state) => state.kind),
    ["checking", "available"],
  );
  assert.equal(states[1]?.endpoint, "https://worker.example/v1/health");
  assert.equal(Object.isFrozen(states[1]), true);
  subscription.unsubscribe();
});

test("a newer trigger aborts and suppresses the stale request", async () => {
  const triggers = new Subject<void>();
  const signals: AbortSignal[] = [];
  const resolutions: Array<(body: Uint8Array) => void> = [];
  const states: HealthProbeState[] = [];
  const client = new Client({ baseUrl: "https://worker.example", maxResponseBytes: 1024 });

  const subscription = observeHealth(
    triggers,
    client,
    (_endpoint, signal) =>
      new Promise<Uint8Array>((resolve) => {
        signals.push(signal);
        resolutions.push(resolve);
      }),
  ).subscribe((state) => states.push(state));

  triggers.next();
  triggers.next();
  assert.equal(signals[0]?.aborted, true);

  resolutions[0]?.(encoder.encode('{"ok":false,"service":"stale"}'));
  resolutions[1]?.(encoder.encode('{"ok":true,"service":"current"}'));
  await nextTurn();

  assert.equal(states.some((state) => state.kind === "available" && state.health.service === "stale"), false);
  assert.equal(states.at(-1)?.kind, "available");
  subscription.unsubscribe();
});

test("decode and transport failures become typed unavailable states", async () => {
  const triggers = new Subject<void>();
  const states: HealthProbeState[] = [];
  const client = new Client({ baseUrl: "https://worker.example", maxResponseBytes: 1024 });
  const subscription = observeHealth(triggers, client, async () => encoder.encode("{}"))
    .subscribe((state) => states.push(state));

  triggers.next();
  await nextTurn();

  const terminal = states.at(-1);
  assert.equal(terminal?.kind, "unavailable");
  if (terminal?.kind === "unavailable") {
    assert.equal(terminal.error instanceof ClientError, true);
    assert.equal(terminal.error.code, "invalid_shape");
  }
  subscription.unsubscribe();
});
