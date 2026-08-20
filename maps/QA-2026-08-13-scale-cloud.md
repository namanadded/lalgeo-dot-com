# Maps scale and cloud reliability — 2026-08-13

## Improvement

Cloud project rename previously called the provider move API directly. A request that remained pending could block forever; a response lost after commit could report failure even though the project had moved. Repeating that ambiguous move could conflict with the already-moved object.

The provider-independent cloud layer now identifies the source, gives the move a bounded deadline, and never repeats an ambiguous write. When a retryable response is lost, recovery accepts success only if destination metadata proves the same stable object id, revision, and byte size. Dropbox rename uses its existing 60-second request policy. An unrelated or changed destination fails visibly instead of being mistaken for the renamed project.

## Repeatable benchmark

Run `npm run benchmark:cloud-rename` from `maps/`. It uses non-sensitive metadata for synthetic 1k, 10k, and 50k-feature projects at 0.24, 3.63, and 30.44 MiB. Each mocked provider commits the move but leaves its response pending.

Baseline completion was unbounded. The benchmark requires recovery within one second after a 10 ms test deadline, exactly one move call, two metadata reads, and zero project-content bytes transferred through the client. Record the current run output in the PR description alongside `benchmark:large-projects`.

## Compatibility, integrity, and rollback

- No project schema, serialized bytes, cloud folder, OAuth flow, or provider configuration changes.
- Successful renames now add one source metadata read. Normal moves completing inside 60 seconds otherwise retain their existing result.
- Ambiguous recovery fails closed if stable identity, revision, and size cannot all be proved. It never deletes data or repeats the move.
- Roll back by reverting this change; no migration or cloud cleanup is required.

## Exact human verification

Using only an approved disposable Dropbox account, rename synthetic 0.24, 3.63, and 30.44 MiB projects and reopen each to compare feature count, geometry, attributes, schema, style, and revision. Inject a move response stall longer than 60 seconds after commit; verify exactly one move, one destination check, successful UI recovery, and no project download/upload. Repeat with a pre-commit stall and with an unrelated destination; confirm a visible failure preserves both known objects. Then recheck connect, list, open, save, reconnect, interrupted upload, stale conflict, offline/retry, auth/quota, and crash recovery without data loss.
