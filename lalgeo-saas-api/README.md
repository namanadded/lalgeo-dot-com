# LalGeo SaaS API Worker

Cloudflare Worker + D1 API used by Netlify-hosted `survey/app/*` SaaS routes.

## Database
- D1 DB: `lalgeo-business`
- DB ID: `c669cbb7-ab4d-4937-b463-1ea547dc7904`

## Deploy
```bash
cd lalgeo-saas-api
npm install
npx wrangler d1 migrations apply lalgeo-business --remote
npx wrangler deploy
```

## Optional API key
Set Worker secret and mirror the value in Netlify:
```bash
npx wrangler secret put D1_API_KEY
```

Then set on Netlify:
```bash
LALGEO_SAAS_API_KEY=<same-secret>
```
