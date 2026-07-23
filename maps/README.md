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
