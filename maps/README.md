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

Apple MapKit tokens are still embedded in `public/legacy/lalgeosurvey.html`. Before moving production traffic, confirm the MapKit JS token allows `maps.lalgeo.com` as an origin or replace it with a token generated for that hostname.
