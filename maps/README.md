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

By default, this wrapper loads `https://lalgeo.com/lalgeosurvey.html` so Apple MapKit runs on the `lalgeo.com` origin where the current token is valid. To serve the local legacy copy instead, set `NEXT_PUBLIC_LEGACY_MAP_URL=/legacy/lalgeosurvey.html` and make sure the MapKit token allows the deployed hostname.
