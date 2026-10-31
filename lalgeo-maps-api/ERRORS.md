# Maps API errors and safe retries

Worker-handled data errors return JSON with a stable `error.code`, a human-readable
`error.message`, and a `request_id`. The same ID appears in `X-Request-Id`; retain it
when reporting a problem. An unauthenticated request to a protected route also returns
`WWW-Authenticate: Bearer realm="lalgeo-maps-api"`.

```json
{
  "error": {
    "code": "ID_CONFLICT",
    "message": "That ID already exists. Reuse the existing resource or choose another ID."
  },
  "request_id": "example-request-id"
}
```

| HTTP | Codes | What to do |
| --- | --- | --- |
| 400 | `INVALID_JSON`, `INVALID_ID`, `INVALID_IDEMPOTENCY_KEY`, `VALIDATION_ERROR`, `INVALID_GEOMETRY`, `GEOMETRY_TYPE_MISMATCH` | Correct the request before resending it. An idempotency key must be 8–128 visible ASCII characters without spaces. |
| 401 | `UNAUTHORIZED` | Supply or replace an operator-provisioned bearer key. Missing, invalid, and expired keys are intentionally indistinguishable. Do not log the key. |
| 403 | `INSUFFICIENT_SCOPE` | A read-only key was used for an operation that requires `maps:write`. Use a read/write key; do not retry unchanged credentials. |
| 404 | `MAP_NOT_FOUND`, `LAYER_NOT_FOUND`, `FEATURE_NOT_FOUND`, `NOT_FOUND` | Check the ID, parent path, and key's owner scope; `NOT_FOUND` means an unsupported endpoint or method. A missing resource and another owner's resource look alike. |
| 404 | `OPEN_LINK_UNAVAILABLE` | The map-open capability is absent, malformed, unknown, expired, or already used. These cases deliberately look identical; request a new link instead of retrying the token. |
| 409 | `ID_CONFLICT` | A create reused an ID in its owner-scoped map, layer, or feature collection. Read the existing resource before deciding whether to use a new ID. |
| 413 | `BODY_TOO_LARGE`, `BATCH_TOO_LARGE` | Keep authoring JSON at or below 2 MB, a retained idempotent result below 1.9 MB, capability redemption at or below 512 bytes, and a feature batch at or below 1,000 items. |
| 422 | `IDEMPOTENCY_KEY_REUSED` | This owner already used the retained key for a different operation, path, or JSON body. Keep the original request unchanged or start the new operation with a new key. |
| 429 | `RATE_LIMITED` | No application work occurred. Wait for the whole seconds in `Retry-After`, then retry. Use `RateLimit-Remaining` and `RateLimit-Reset` to avoid another rejected request. |
| 500 | `INTERNAL_ERROR` | Keep the request ID for support. Retry a keyed create only with the exact same body, path, and key; reconcile an unkeyed write before retrying. |
| 503 | `AUTH_NOT_CONFIGURED`, `IDEMPOTENCY_NOT_CONFIGURED`, `RATE_LIMIT_NOT_CONFIGURED` | An operator must repair the named authentication, idempotency, or rate-limit store. A keyed create is rolled back when its receipt cannot be stored; unavailable quota storage rejects protected work before application logic. |

Protected `GET` routes, including export, require `maps:read`. Protected `POST`,
`PATCH`, and `DELETE` routes, including one-time open-link creation, additionally
require `maps:write`. Health, OpenAPI discovery, and map-open redemption remain
public. New key descriptors require a trimmed, non-empty `owner_id`, either the
read-only or read/write scope profile, and a future RFC3339 `expires_at`.
Write-only descriptors fail closed because update responses and handoffs can
contain existing map data. Legacy string entries retain full read/write access
for compatibility and should be replaced during a controlled rotation.

For every create, send both a stable client-generated `id` and a fresh
`Idempotency-Key`. The key is scoped to the authenticated owner, stored only as a
SHA-256 hash, and binds the operation, resource path, and canonical JSON body for
24 hours. The first successful response includes `Idempotency-Replayed: false`;
an exact retry returns the original `201` body with `Idempotency-Replayed: true`
and the same `Idempotency-Key-Expires-At`. Object-property order does not affect
matching, but array order does. Failed requests do not consume the key.

After a timeout, lost connection, or ambiguous `500`, retry a keyed create with
the exact same body, path, and key. Never change the payload while retaining the
key. If no key was supplied, read the stable resource ID and compare its content
before retrying. A `409` is not automatic success: it may refer to an older,
different resource. After an uncertain `PATCH` or `DELETE`, read the resource
before taking further action.

Every successfully authenticated and authorized protected request consumes one
of the owner's 300 admissions in a fixed 60-second UTC window. Admission happens
atomically before request-body parsing or resource lookup, so later `400`, `404`,
`409`, `413`, `422`, or `500` responses still count. Exact idempotent replays also
count. Authentication failures and insufficient-scope requests do not consume
quota; neither do public health, OpenAPI, or map-open redemption requests. All
keys for one owner share the counter.

Admitted protected responses include `RateLimit-Limit`, `RateLimit-Remaining`,
and `RateLimit-Reset`. A `429 RATE_LIMITED` includes those headers plus
`Retry-After`; authentication and scope failures do not expose quota state.
Wait for that whole number of seconds and retry once; do not spin or switch keys.
The service stores one bounded counter row per owner and no raw key material.

A map-open link is a 256-bit capability, not an API key. The API returns it only
in the `https://maps.lalgeo.com/maps#open=…` fragment and stores only its SHA-256
hash. Browsers exclude fragments from HTTP requests and referrer headers, and the
bearer key is never placed in the link or sent to Maps. Redemption is public but
single-use, and expiry is limited to 60–900 seconds (10 minutes by default). Maps
imports an editable local copy; it does not write edits back to the API map. After
the first redemption or expiry, create a new link. Do not log or share an unused
link beyond its intended recipient.

The production verifier checks the public contract without a key or any
production mutation. Reserved health probes must acknowledge both the
idempotency and rate-limit schemas while preserving the exact public health JSON;
the map-open probe must return acknowledged `404 OPEN_LINK_UNAVAILABLE`. A
failure names `0006_map_idempotency_keys.sql`, `0007_map_rate_limits.sql`, or
`0005_map_open_links.sql` as the first shared `lalgeo-business` check. That is a
starting point, not proof of the cause. The local release gates exercise migrated
and unmigrated behavior using only disposable synthetic state.
