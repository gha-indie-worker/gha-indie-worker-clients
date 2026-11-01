# GHA Indie Worker: Oreslang client candidate

**Not yet a supported or publishable client.** This package is the first native Oreslang source under `clients/oreslang`. No HTTP transport, schema decoder, runtime compilation or independent consumer installation is claimed. The existing supported-language matrix is deliberately unchanged.

The public endpoint is `GET /v1/health`. Its Rust and TypeScript peers establish `Health { ok: bool, service: String }`. `src/health_admission.ores` currently implements only pure bounded-response admission: exactly HTTP 200, a nonempty body, a strict response cap (at most 64 KiB), and explicit redirect recognition. `tests/health_admission.ores` contains positive and negative native guest assertions. A host-side text scan does **not** validate them; only compiled guest execution can.

## Required before this becomes a usable SDK

- Add async-only transport using the established Oreslang HTTP API; enforce TLS and safe base-URL construction, refuse redirects and CR/LF in headers, never disable certificate validation, never log bearer tokens or raw error bodies. Do not use blocking I/O or Java/C# implementations to replace portable `.ores` semantics.
- Use actual `oreslang-serialization-and-validation` to decode and validate `Health` with bounded JSON, required keys, strict bool/string typing and explicit error results. Do not treat parsing alone as schema validation.
- Compare against the independently authored `*-interfaces` JSON Schema and TypeSpec authorities through current-input TJSV evidence; pin exact source closure and fixture SHA-256s. Do not auto-derive one authority from the other.
- Compile and execute native positive and negative guests under pinned Java/GraalVM, LLVM, Cranelift, Wasm and .NET lanes, each with its own exact-head receipts and negative artifact-rejection tests. Do not report unavailable backends as green.
- Add real external-consumer installation and publish gates; only then register `oreslang` in `clients/support-matrix.toml` and release manifests. JS/browser support requires its own verified transpilation target.

This intentionally keeps the candidate outside the shipping target matrix until all admission checks pass.
