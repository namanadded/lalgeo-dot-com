# LalGeo Maps

Standalone Next.js app for `maps.lalgeo.com`.

## Run
```
npm install
npm run dev
```

Open `http://localhost:3000`.

## Netlify
Use this `maps/` directory as the site base, keep the build command as `npm run build`, and attach the custom domain `maps.lalgeo.com`.

By default, this wrapper loads `https://lalgeo.com/lalgeosurvey.html` until a MapKit token env var is present. When `MAPKIT_TOKEN` or `NEXT_PUBLIC_MAPKIT_TOKEN` is set, it loads `/render/lalgeosurvey`, a Next route that serves the current request origin's `public/legacy/lalgeosurvey.html` with that token injected. This keeps production and Netlify deploy previews paired with their own checked-in legacy shell.

Set `MAPKIT_TOKEN` or `NEXT_PUBLIC_MAPKIT_TOKEN` in Netlify to the Apple Maps token for `*.lalgeo.com` before using `maps.lalgeo.com` in production.

## Public map sharing and API

- `POST /api/v1/maps`: create an immutable snapshot from `sourceUrl` (public GeoJSON or an Open Calgary dataset page), or `layers` containing GeoJSON/source URLs. Returns `shareUrl`, `apiUrl`, and a private `deleteToken`.
- `GET /api/v1/datasets?q=...`: search Open Calgary and resolve map views to their underlying dataset IDs.
- `GET /api/v1/maps/:id`: read a snapshot. `DELETE` with `Authorization: Bearer <deleteToken>` revokes it.
- `/s/:id`: opens the snapshot in the map editor without replacing the viewer's saved projects.
- `/api-docs`, `/openapi.json`, and `/llms.txt`: human and agent API discovery.
- Tools → Share map publishes visible layers with the current filters applied. Tools → Map from URL creates a map directly from a dataset. Tools → Shared link can copy/revoke a loaded snapshot (revocation requires the creator's browser token).

Shared snapshots contain geometry, scalar attributes, source attribution, label fields, layer colors/opacity, and basemap type. Custom labels are materialized as text; executable label expressions, cloud credentials, archived/hidden data, and attachments are not shared. Links are unlisted but available to anyone who has them. Edits require a new link.

Production storage uses the site-wide `lalgeo-shared-maps-v1` Netlify Blobs store with strong consistency, so links survive deployments. Netlify supplies the storage context automatically; no new environment secrets are required. `next dev` uses the gitignored `.local-shared-maps/` folder. This disk fallback is disabled in production. Rate counters use `lalgeo-map-rate-limits-v1`, with atomic compare-and-swap updates and Netlify's connecting-IP header; raw IP addresses are not stored.

Creation is anonymous and limited to 20 attempts per connecting IP per hour (dataset search: 60). Requests, upstream responses and snapshots are limited to 3 MB. Maximum 12 layers, 10,000 source features/expanded geometry parts per layer, 25,000 parts per map, 150,000 vertices per layer and 300,000 per map. HTTPS imports validate and pin public DNS addresses on each request/redirect, cap response sizes, and reject credential-bearing URLs. No caller credentials are forwarded. Calgary requests without an explicit limit fetch one extra row and reject oversized datasets rather than silently truncating them.

Run `npm run test:sharing` and `npm run build`. Tests exercise validation, geometry preservation (including polygon holes), Calgary view resolution, API creation/read/revocation, and the browser integration. Existing `test:*` scripts cover editor regressions. Netlify deployment uses the existing linked maps site; shared snapshots are stored independently of deploy artifacts.

The September 9 sharing release preserves the currently published editor shell and its workspace-persistence helper, which were newer than this checkout. The 12 sharing tests and production build pass; live API creation/read/revocation and browser sharing were verified. Six older structural checks (browser resource limits, SQL filter, panel toggle, top menu, toolbar architecture, toolbar overflow) also fail against the unmodified published shell; the sharing changes introduce no additional failures in those comparisons.
