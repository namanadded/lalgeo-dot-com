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
| 400 | `INVALID_JSON`, `INVALID_ID`, `VALIDATION_ERROR`, `INVALID_GEOMETRY`, `GEOMETRY_TYPE_MISMATCH` | Correct the request before resending it. |
| 401 | `UNAUTHORIZED` | Supply or replace an operator-provisioned bearer key. Do not log the key. |
| 404 | `MAP_NOT_FOUND`, `LAYER_NOT_FOUND`, `FEATURE_NOT_FOUND`, `NOT_FOUND` | Check the ID, parent path, and key's owner scope; `NOT_FOUND` means an unsupported endpoint or method. A missing resource and another owner's resource look alike. |
| 404 | `OPEN_LINK_UNAVAILABLE` | The map-open capability is absent, malformed, unknown, expired, or already used. These cases deliberately look identical; request a new link instead of retrying the token. |
| 409 | `ID_CONFLICT` | A create reused an ID in its owner-scoped map, layer, or feature collection. Read the existing resource before deciding whether to use a new ID. |
| 413 | `BODY_TOO_LARGE`, `BATCH_TOO_LARGE` | Keep authoring JSON at or below 2 MB, capability redemption at or below 512 bytes, and a feature batch at or below 1,000 items. |
| 500 | `INTERNAL_ERROR` | Keep the request ID for support. A timed-out or failed write may have committed; reconcile before retrying. |
| 503 | `AUTH_NOT_CONFIGURED` | An operator must correct the API authentication configuration. |

For a create, send a stable client-generated `id`. If the network times out, `GET`
that map, layer, or feature with the same key and path. If it exists, compare the
result with the intended write; if it does not, retry with the same ID. A `409` is
not an automatic success: it could refer to an older resource with different data.
After an uncertain `PATCH` or `DELETE`, read the resource before taking further
action. Do not blindly replay a write after `500` or a lost connection.

A map-open link is a 256-bit capability, not an API key. The API returns it only
in the `https://maps.lalgeo.com/maps#open=…` fragment and stores only its SHA-256
hash. Browsers exclude fragments from HTTP requests and referrer headers, and the
bearer key is never placed in the link or sent to Maps. Redemption is public but
single-use, and expiry is limited to 60–900 seconds (10 minutes by default). Maps
imports an editable local copy; it does not write edits back to the API map. After
the first redemption or expiry, create a new link. Do not log or share an unused
link beyond its intended recipient.

The Worker does not yet implement `Idempotency-Key` replay or a rate limiter. Its
contract intentionally does not advertise `429` or `Retry-After`. The production
verifier checks the documented errors without a key or any production mutation;
the local release gates exercise the error envelope using only synthetic data.
