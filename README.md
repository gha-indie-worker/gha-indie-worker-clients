# gha-indie-worker-clients

Polyglot SDKs under `clients/`. Rust, TypeScript, and Dart are first-class and modular. Other languages expose the same `/v1/health` surface.

The TypeScript and Dart clients expose the same reactive health model:
checking, available, or unavailable. Callers inject the transport effect;
RxJS/RxDart cancel stale subscriptions, replay the latest state, and preserve
typed decode failures.
