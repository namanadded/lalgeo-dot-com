# Maps scale and cloud reliability — 2026-07-29

## Scope

Started from `origin/main` at `f80d223`. Only synthetic, non-sensitive projects were used. No Dropbox credentials were available or used, and no real files, OAuth settings, Netlify settings, provider configuration, or production data were changed.

Direct branch-protection inspection remains unavailable because the local GitHub credential returns `Forbidden`. The checked-in `Production CI` workflow targets pull requests and pushes to `main`; its real PR run must pass before review.

## Integrity risk and implementation

Canonical `.lal` imports previously deep-cloned the complete parsed document and then cloned each feature, coordinate tree, and property object again during normalization. That transient duplication could exhaust a mobile-sized JavaScript heap after an otherwise verified cloud download, before the new project safely replaced local state.

Canonical normalization now builds the detached output in one pass. Metadata, schema, style, revision, features, geometry coordinates, and nested feature properties remain independent from the parsed provider response. Unknown top-level fields and the serialized schema remain compatible.

## Repeatable measurements

Run:

```sh
cd maps
npm run benchmark:lal-import
npm run benchmark:large-projects
```

Representative local Node 20-compatible results:

| Features | Source | Baseline time | Result time | Baseline heap | Result heap | Heap reduction |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.24 MiB | 1.18 ms | 3.12 ms | 1.19 MiB | 1.52 MiB | -27.56% |
| 10,000 | 3.63 MiB | 14.04 ms | 12.67 ms | 12.04 MiB | 14.73 MiB | -22.29% |
| 50,000 | 30.44 MiB | 95.70 ms | 95.00 ms | 110.65 MiB | 39.92 MiB | 63.92% |
| 100,000 | 85.31 MiB | 251.21 ms | 249.89 ms | 279.79 MiB | 102.59 MiB | 63.33% |

The benchmark fails if detached output is lost or heap reduction falls below 50% at 50k/100k. The existing synthetic workload also passed startup/import, pan/zoom scanning, render projection, serialization/autosave, export, recovery, memory, and quota preservation at 1k/10k/50k features. At 50k / 30.44 MiB: startup parse 50.05 ms, clone 54.57 ms, pan/zoom scan 4.87 ms, projection 0.88 ms, autosave 70.23 ms, export 51.55 ms, recovery 31.86 ms, serialization heap delta 61.01 MiB.

Provider-independent mocked contracts passed for scoped listing, interrupted/resumable upload, bounded retry, stale conflict, offline/rate-limit retry, auth/quota errors, ambiguous final commit, verified download, and corruption recovery. Verified downloads at 16/32/64 MiB preserved bytes after a truncated first response.

## Verification

- All 38 Maps `test:*` scripts passed.
- All 7 Maps `benchmark:*` scripts passed.
- Next production build passed.
- Production CI PR run: required before review.

## Compatibility, data loss, and rollback

There is no schema, file format, cloud path, OAuth, or provider API change. Normalized projects remain detached and unknown top-level fields remain preserved. Small imports can use a few extra milliseconds/megabytes because nested feature properties are cloned locally instead of riding on a whole-document clone; the large-project peak is substantially lower. Unverified provider bytes still never replace project state.

Rollback is a single commit revert with no migration. Reverting restores the prior high-memory import path.

## Exact human verification

1. On a memory-constrained desktop browser and a representative mobile device, import synthetic 50k and 100k `.lal` files.
2. Confirm project name, feature count, point/polygon geometry, nested attributes, schema options, style, and revision metadata.
3. Edit a nested attribute and geometry, export, reopen, and confirm the original source fixture was not mutated and the reopened project matches the edit.
4. Force reload during import; confirm the previous local project remains recoverable and no partial project replaces it.
5. With an approved disposable Dropbox account only, connect, list, open the synthetic file, save, rename, reconnect, interrupt an upload, retry offline, and inject stale revision, auth, quota, and hash mismatch failures. Confirm the prior remote revision and local project remain intact after every failure.
