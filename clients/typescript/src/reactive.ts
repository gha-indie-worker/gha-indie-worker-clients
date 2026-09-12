import {
  Observable,
  catchError,
  concat,
  distinctUntilChanged,
  map,
  of,
  shareReplay,
  switchMap,
} from "rxjs";

import type { Client } from "./client.js";
import { asClientError, type ClientError } from "./errors.js";
import type { Health } from "./types.js";

export type HealthRequest = (
  endpoint: string,
  signal: AbortSignal,
) => Promise<Uint8Array>;

export type HealthProbeState =
  | Readonly<{ kind: "checking"; endpoint: string }>
  | Readonly<{ kind: "available"; endpoint: string; health: Health }>
  | Readonly<{ kind: "unavailable"; endpoint: string; error: ClientError }>;

const checking = (endpoint: string): HealthProbeState =>
  Object.freeze({ kind: "checking", endpoint });

const available = (endpoint: string, health: Health): HealthProbeState =>
  Object.freeze({ kind: "available", endpoint, health });

const unavailable = (endpoint: string, error: unknown): HealthProbeState =>
  Object.freeze({ kind: "unavailable", endpoint, error: asClientError(error) });

function requestOnce(
  request: HealthRequest,
  endpoint: string,
): Observable<Uint8Array> {
  return new Observable((subscriber) => {
    const controller = new AbortController();

    void request(endpoint, controller.signal).then(
      (body) => {
        if (!subscriber.closed) {
          subscriber.next(body);
          subscriber.complete();
        }
      },
      (error: unknown) => subscriber.error(error),
    );

    return () => controller.abort();
  });
}

export function observeHealth(
  triggers: Observable<unknown>,
  client: Client,
  request: HealthRequest,
): Observable<HealthProbeState> {
  const endpoint = client.healthUrl();

  return triggers.pipe(
    switchMap(() =>
      concat(
        of(checking(endpoint)),
        requestOnce(request, endpoint).pipe(
          map((body) => available(endpoint, client.decodeHealth(body))),
          catchError((error: unknown) => of(unavailable(endpoint, error))),
        ),
      ),
    ),
    distinctUntilChanged(healthProbeStateEquals),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
}

export function healthProbeStateEquals(
  left: HealthProbeState,
  right: HealthProbeState,
): boolean {
  if (left.kind !== right.kind || left.endpoint !== right.endpoint) {
    return false;
  }

  switch (left.kind) {
    case "checking":
      return true;
    case "available":
      return (
        right.kind === "available" &&
        left.health.ok === right.health.ok &&
        left.health.service === right.health.service
      );
    case "unavailable":
      return right.kind === "unavailable" && left.error.code === right.error.code;
  }
}
