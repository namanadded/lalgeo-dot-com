# Maps scale and cloud reliability — 2026-08-10

## Baseline and scope

- Source: `origin/main` at `50683b401caacce5d0c0a0736360645e6b3107d8`.
- Synthetic, non-sensitive projects and mocked provider adapters only. No Dropbox credentials were available or used.
- No real files, secrets, OAuth, Netlify, production settings, or provider configuration were accessed or changed.
- The checked-in **Production CI** workflow targets pull requests into and pushes to `main`. Direct administrative branch-protection verification is unavailable because the local GitHub CLI credential is invalid; protection was last directly recorded as strict required **Production CI** with admin enforcement, stale-review dismissal, conversation resolution, and no force pushes/deletions.

## Integrity risk and result

A resumable upload only entered retry and cursor recovery after the provider rejected a request. If an append or final commit stayed permanently pending, save/autosave could remain blocked forever. Users had no bounded failure or safe recovery signal, even when the provider had already accepted the bytes.

Resumable cloud requests now have a provider-independent 60-second per-request deadline. A timed-out append is never blindly repeated: the existing provider cursor lookup determines the accepted offset. A timed-out final commit is never repeated: exact remote revision, size, and content verification must confirm success. Cancellation remains immediate, and bounded no-progress recovery still applies.

The repeatable synthetic benchmark uses 16/64/256 MiB blobs with 4 MiB chunks and a permanently pending first append. Baseline completion was unbounded. The result recovered each case in 12.30/11.19/12.60 ms after one 10 ms test deadline and exactly one cursor lookup, without sending the ambiguous chunk twice.

The broader `benchmark:large-projects` suite covers 1k/10k/50k features and startup/import, pan/zoom scanning, rendering, serialization/autosave, export, recovery, and memory. At 50k features / 30.44 MiB this run measured 49.09 ms startup, 52.44 ms import, 4.36 ms pan/zoom scan, 0.79 ms rendering, 69.47 ms autosave, 51.37 ms export, 31.48 ms recovery, and 60.89 MiB serialization heap growth; forced quota failure preserved prior bytes. Existing cloud suites cover scoped catalogs, retry pacing, download verification, snapshot transfer, serialization, and crash/quota preservation.

## Compatibility, data safety, and rollback

- No project schema, serialized bytes, cloud path, revision semantics, OAuth flow, or provider API contract changed.
- Healthy requests are unchanged. A single provider request taking longer than 60 seconds now enters safe reconciliation; very slow but healthy connections may therefore perform one metadata/cursor check.
- Timed-out request promises may still settle later inside the provider SDK, which is why ambiguous writes are never repeated and success is accepted only through cursor or exact commit verification.
- Roll back by reverting this change; no migration or cloud cleanup is required.

## Automated verification

- All 84 Maps `test:*` and `benchmark:*` scripts passed.
- Optimized Next.js 16.2.9 production build passed.
- Static links across 10 HTML entry points and `git diff --check` passed.
- Focused mocked contracts cover a permanently pending accepted append, an ambiguous pending final commit, cursor recovery, exact commit verification, cancellation, interrupted upload, stale conflict, offline/retry, auth, quota, and integrity failures.

## Exact human verification

1. Use only an approved disposable Dropbox account and synthetic `.lal` projects larger than 16 MiB.
2. Verify connect, list, open, save, rename, disconnect/reconnect, and full feature/attribute preservation.
3. Hold one middle upload request open past 60 seconds after Dropbox accepts its bytes. Confirm exactly one cursor lookup, no duplicate chunk, resumed progress, successful reopen, and a single revision advance.
4. Hold the final commit response open past 60 seconds. Confirm one metadata verification, no second finish request, and success only when revision, byte size, and content hash match.
5. Repeat with an unaccepted middle chunk and confirm bounded retry/failure leaves the prior remote revision and current local project intact.
6. Recheck stale revision, offline/retry, quota/auth, hash mismatch, interrupted upload, and reconnect recovery without data loss.
