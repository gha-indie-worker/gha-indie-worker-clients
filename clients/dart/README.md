# GHA Indie Worker Dart client

Typed, transport-independent Dart client for the GHA Indie Worker API.

`observeHealth` accepts an injected request stream and converts refresh
triggers into immutable `HealthChecking`, `HealthAvailable`, or
`HealthUnavailable` states. RxDart `switchMap` cancels a subscribed stale
request stream when a newer trigger arrives, and `shareReplay` gives current
subscribers one consistent terminal state.
