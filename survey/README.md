# LalGeo Survey Web

Runs a survey builder + public survey links under `/survey`.

## Local storage
Defaults to `/Volumes/LALGEO_CLOUD/surveys`.
Override with:

```
LALGEO_STORAGE_ROOT=/Volumes/LALGEO_CLOUD/surveys
LALGEO_JWT_SECRET=change-this-in-production
```

## Run
```
npm install
npm run dev
```
Then open `http://localhost:3000/survey`.

## Notes
- First visit will prompt for admin setup.
- Each survey is capped at 100 MB including attachments.
- `.lal` exports include `survey.csv`, `survey.json`, and `metadata.json`.
