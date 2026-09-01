import assert from "node:assert/strict";
import test from "node:test";

import { Subject } from "rxjs";

import {
  Client,
  ClientError,
  observeHealth,
  type ClientErrorCode,
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

test("malformed, oversized, and transport failures retain typed error codes", async () => {
  const client = new Client({
    baseUrl: "https://worker.example",
    maxResponseBytes: 8,
  });
  const cases: ReadonlyArray<
    readonly [string, () => Promise<Uint8Array>, ClientErrorCode]
  > = [
    ["malformed JSON", async () => encoder.encode("{"), "invalid_json"],
    ["oversized body", async () => encoder.encode("123456789"), "too_large"],
    [
      "transport rejection",
      async () => Promise.reject(new Error("connection reset")),
      "http",
    ],
  ];

  for (const [name, request, expectedCode] of cases) {
    const triggers = new Subject<void>();
    const states: HealthProbeState[] = [];
    const subscription = observeHealth(triggers, client, request).subscribe(
      (state) => states.push(state),
    );

    triggers.next();
    await nextTurn();

    const terminal = states.at(-1);
    assert.equal(terminal?.kind, "unavailable", name);
    if (terminal?.kind === "unavailable") {
      assert.equal(terminal.error.code, expectedCode, name);
    }
    subscription.unsubscribe();
    triggers.complete();
  }
});

test("concurrent and late subscribers share one request and replay its result", async () => {
  const triggers = new Subject<void>();
  const client = new Client({
    baseUrl: "https://worker.example",
    maxResponseBytes: 1024,
  });
  let requestCount = 0;
  let resolveRequest: ((body: Uint8Array) => void) | undefined;
  const statesBySubscriber: HealthProbeState[][] = [[], [], []];
  const stream = observeHealth(triggers, client, async () => {
    requestCount += 1;
    return new Promise<Uint8Array>((resolve) => {
      resolveRequest = resolve;
    });
  });

  const first = stream.subscribe((state) => statesBySubscriber[0]?.push(state));
  const second = stream.subscribe((state) => statesBySubscriber[1]?.push(state));
  triggers.next();
  assert.equal(requestCount, 1);

  resolveRequest?.(
    encoder.encode('{"ok":true,"service":"shared-result"}'),
  );
  await nextTurn();

  const late = stream.subscribe((state) => statesBySubscriber[2]?.push(state));
  assert.equal(requestCount, 1);
  assert.deepEqual(
    statesBySubscriber.map((states) => states.at(-1)?.kind),
    ["available", "available", "available"],
  );

  first.unsubscribe();
  second.unsubscribe();
  late.unsubscribe();
  triggers.complete();
});

test("unsubscribing the last observer aborts the active request", () => {
  const triggers = new Subject<void>();
  const client = new Client({
    baseUrl: "https://worker.example",
    maxResponseBytes: 1024,
  });
  let requestSignal: AbortSignal | undefined;
  const subscription = observeHealth(
    triggers,
    client,
    (_endpoint, signal) => {
      requestSignal = signal;
      return new Promise<Uint8Array>(() => undefined);
    },
  ).subscribe();

  triggers.next();
  assert.equal(requestSignal?.aborted, false);
  subscription.unsubscribe();
  assert.equal(requestSignal?.aborted, true);
  triggers.complete();
});

test("the client snapshots mutable constructor input", () => {
  const config = {
    baseUrl: "https://worker.example/original",
    maxResponseBytes: 1024,
  };
  const client = new Client(config);

  config.baseUrl = "https://attacker.example/replaced";

  assert.equal(
    client.healthUrl(),
    "https://worker.example/original/v1/health",
  );
});
