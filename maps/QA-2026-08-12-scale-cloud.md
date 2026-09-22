# Maps scale and cloud reliability — 2026-08-12

## Scope

- Started from `origin/main` at `1aa9d64a884f97eff30c5b750c45a4958b94109f`.
- Used generated, non-sensitive byte payloads and projects only.
- No Dropbox credentials were available or used. No real files, OAuth settings, Netlify settings, provider configuration, or production data were touched.

## Improvement

Verified cloud opens previously bounded file size and checked Dropbox's content hash, but a provider download or verification promise could remain pending forever. The provider-independent `downloadBlobVerified` contract now applies an optional per-operation deadline to both transfer and verification, preserves immediate `AbortSignal` cancellation, and retries the existing two-attempt safe-open flow after a timeout. Dropbox supplies its existing 60-second request deadline.

Unverified or timed-out bytes are never returned to project parsing, so the current local project remains unchanged. The retry is read-only and cannot create a duplicate write or revision conflict.

## Repeatable benchmark

Run `npm run benchmark:cloud-open-deadline` from `maps/`.

The first mocked provider download never settles; the second returns the full synthetic payload.

| Payload | Baseline | Result | Download calls | Verification calls |
| --- | --- | ---: | ---: | ---: |
| 16 MiB | Unbounded | 15.22 ms | 2 | 1 |
| 64 MiB | Unbounded | 18.26 ms | 2 | 1 |
| 256 MiB | Unbounded | 78.72 ms | 2 | 1 |

The benchmark uses a 10 ms test deadline and enforces completion below one second. Production Dropbox opens use 60 seconds per download or verification attempt.

## Large-project regression measurements

Run `npm run benchmark:large-projects` from `maps/`.

| Features | Source | Startup | Import | Pan/zoom | Render | Autosave | Export | Recovery | Heap delta |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.24 MiB | 0.42 ms | 1.03 ms | 0.13 ms | 0.06 ms | 0.73 ms | 0.57 ms | 0.60 ms | 0.52 MiB |
| 10,000 | 3.63 MiB | 4.93 ms | 15.65 ms | 0.93 ms | 0.37 ms | 8.27 ms | 6.68 ms | 5.86 ms | 7.35 MiB |
| 50,000 | 30.44 MiB | 49.45 ms | 54.83 ms | 4.91 ms | 0.93 ms | 70.52 ms | 51.72 ms | 32.72 ms | 60.92 MiB |

Quota-failure recovery preserved the prior serialized bytes at all three sizes.

## Compatibility, data loss, and rollback

- No project schema, serialized bytes, cloud path, revision semantics, OAuth flow, or provider API changes.
- Normal downloads completing inside 60 seconds are unchanged. A download or content-hash verification exceeding 60 seconds now retries once and then fails visibly instead of waiting forever.
- Timed-out provider promises may still finish internally, but cloud opens are read-only and their late results are ignored. They cannot replace local state after the deadline.
- Roll back by reverting this change; no migration or cloud cleanup is required.

## Exact human verification

With an approved disposable Dropbox account and synthetic `.lal` files only:

1. Connect, list, and open 16 MiB and 256 MiB projects; compare feature counts, geometry, attributes, schema, style, and revision metadata.
2. Stall the first download response beyond 60 seconds; confirm one safe retry succeeds and only the verified second response opens.
3. Stall both responses; confirm a visible failure after two bounded attempts and that the current project remains unchanged.
4. Stall content-hash verification and cancel during an active download; confirm cancellation is immediate and late responses do not open a project.
5. Recheck save, rename, reconnect, interrupted upload, stale revision, conflict, offline/retry, quota/auth errors, and recovery without prior local or remote data loss.

Administrative branch-protection and Actions queries returned `Forbidden` for the local GitHub credential. The checked-in `Production CI` workflow targets pull requests and pushes to `main`; enforcement must be confirmed by a repository administrator.
