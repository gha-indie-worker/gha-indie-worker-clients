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

Additional pure source: `src/health_url.ores` implements a conservative HTTPS origin-only filter and `/v1/health` path preparation; `tests/health_url.ores` contains adversarial source fixtures. It rejects explicit ports and IPv6 by policy until a reviewed URI parser is available. The DNS-only filter now enforces lowercase ASCII labels (1–63 octets each) and total host length at most 253 octets, with native guest probes for both limits. Both pilot candidates use byte-identical origin-filter sources and tests. These string guards are **not** a sufficient SSRF/DNS/TLS security boundary and have not been compiler-checked. They must never be used as proof that HTTP transport or runtime adapters are safe.

## Five-toolchain parity evidence (2026-11-01)

The nine scalar guest files under `tests/scalar/` are byte-for-byte identical across the two client candidates and the compiler/backend draft PRs below. Their SHA-256 pins are enforced by `tests/scalar_manifest.test.mjs`; no compiler/backend may rewrite them.

| Backend | Compiler-side draft | Executable claim currently verified? |
| --- | --- | --- |
| Java/GraalVM | [oreslang-source.java#2439](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/2439) | **No**; proposed JVM-hosted reference guest tests |
| LLVM | [oreslang-source.llvm#1294](https://github.com/ores-truffle-oreslang/oreslang-source.llvm/pull/1294) | **No**; proposed Clang-linked native guest results |
| Wasm | [oreslang-source.wasm#262](https://github.com/ores-truffle-oreslang/oreslang-source.wasm/pull/262) | **No**; requires a real pinned Oreslang compiler and isolated Wasm run |
| Cranelift | [oreslang-source.cranelift#73](https://github.com/ores-truffle-oreslang/oreslang-source.cranelift/pull/73) | **No**; proposed real native JIT + IR tests |
| .NET Native AOT | [oreslang-source.net#325](https://github.com/ores-truffle-oreslang/oreslang-source.net/pull/325) | **No**; proposed six real Native AOT executions and three negative compiler denials |

GitHub Actions in the private compiler organization has returned failures with **zero executed steps**, so the above drafts provide **authored test coverage, not runtime passes**. Do not transfer private compiler source to another organization merely to bypass billing/runner admission. Independently approved private-source transfer would be required.

There are two different milestones: (1) the narrow standalone scalar floor across all five compilers, and (2) the full client source (`health_admission.ores`, `health_url.ores`, true async HTTP transport and real JSON validation). Scalar success alone cannot promote the SDK. Current Cranelift and production .NET compilers cannot compile the full client module graph, and that is a backend implementation gap rather than a reason to rewrite client source per toolchain.
