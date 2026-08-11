# Maps scale and cloud reliability — 2026-08-11

## Risk addressed

Revision-controlled Dropbox saves below the 16 MiB resumable threshold called the provider directly without a request deadline. A request that never settled left the save permanently pending. Retrying manually was unsafe because the first request might already have committed.

The provider-independent direct-upload contract now applies the configured operation deadline to both the write and its exact-state verification. Dropbox supplies its existing 60-second request timeout. On an ambiguous timeout, the write is not repeated: recovery requires a changed revision, exact byte size, and exact Dropbox content hash. If that proof is unavailable, the save fails visibly and preserves the existing local and remote state.

## Synthetic benchmark

No credentials or real files were used. `benchmark:cloud-direct-deadline` creates non-sensitive 1, 8, and 15 MiB blobs, representing the direct-upload range, and models a provider that accepted a write but never returned a response.

| Payload | Baseline | Result with 10 ms test deadline | Uploads | Verifications |
| --- | --- | ---: | ---: | ---: |
| 1 MiB | Unbounded | 10.67 ms | 1 | 1 |
| 8 MiB | Unbounded | 11.21 ms | 1 | 1 |
| 15 MiB | Unbounded | 10.17 ms | 1 | 1 |

The broader synthetic suite covered 1k, 10k, and 50k features (0.24, 3.63, and 30.44 MiB). At 50k it measured 49.38 ms startup parse, 54.27 ms import, 4.40 ms pan/zoom scan, 0.84 ms rendering projection, 71.28 ms autosave, 51.53 ms export, 31.24 ms crash/recovery parse, and 60.91 MiB serialization heap growth. Quota failure preserved the prior bytes.

## Validation and safety

- All 76 Maps regression tests and all 12 synthetic benchmarks passed.
- Optimized Next.js production build, static module integrity, CI coverage, and `git diff --check` passed.
- Production CI runs on pull requests and pushes to `main`; direct branch-protection enforcement could not be queried because the local GitHub CLI credential is invalid.
- No Dropbox/OAuth credentials were available or used. No user files, secrets, provider configuration, OAuth, Netlify, or production settings were touched.
- There is no schema, file-format, path, revision, provider API, or conflict-semantics change. Operations exceeding 60 seconds now reconcile rather than remain pending. An inconclusive verification reports failure and never blindly repeats the upload.
- Rollback is a single commit revert; no migration or cloud cleanup is required.

## Exact human verification

Using only an approved disposable Dropbox account, open a synthetic project under 16 MiB, edit and save it, and confirm its revision advances. Inject a provider response stall longer than 60 seconds after the write is accepted; verify exactly one upload and one metadata/hash verification occur, the UI settles, and reopening preserves feature count, geometry, attributes, style, and schema. Repeat with a stall before commit and confirm the save fails visibly without overwriting the prior remote revision. Then verify rename/reconnect and stale-revision, offline, auth, quota, and hash-mismatch recovery.
