# LalGeo Maps for iOS

A small native SwiftUI companion for the LalGeo Maps API. The first complete journey is intentionally focused: connect with an operator-provisioned API key, browse or create maps, open a native MapKit preview, and export a portable `.lal` project through the iOS Share Sheet.

## Architecture

- `AppStore` owns session and library state on the main actor.
- `MapsAPIClient` is the only network boundary and follows `../lalgeo-maps-api/openapi.json`.
- `KeychainCredentialStore` keeps the raw bearer key in a this-device-only Keychain item. Keys never enter app logs, preferences, fixtures, or source control.
- `FileMapCache` stores only the last successful map catalog in Application Support. A failed refresh can therefore show an explicitly marked read-only offline snapshot.
- Feature views are split by journey (`Connect`, `Library`, and `MapDetail`), and each dependency has a small protocol so unit and UI tests use synthetic data.

The API remains the source of truth. Creating a map sends a stable client-generated ID; if the request times out, the client reconciles that ID with `GET` before reporting failure. Map previews fetch typed layers and GeoJSON features without changing them. Export uses the API's canonical `.lal` payload.

## Generate and build

Xcode 16 or newer and XcodeGen are required. The project itself is checked in so XcodeGen is only needed after editing `project.yml`.

```sh
cd ios
xcodegen generate
./scripts/test.sh
open LalGeoMaps.xcodeproj
```

`scripts/test.sh` selects the first available iPhone simulator unless `LALGEO_SIMULATOR_ID` is provided. No production API key is needed: unit and UI tests use in-process synthetic clients.

## Product and security notes

- Deployment target: iOS 17.
- Production base URL: `https://api.lalgeo.com` over system TLS. Arbitrary server URLs are not exposed in the UI.
- API keys are saved only after the server validates them and are removed through **Account → Disconnect**.
- Cached map names/descriptions contain no bearer credentials, are excluded from backups, and use complete-until-first-authentication file protection.
- The app does not request location, camera, contacts, tracking, or photo permissions.
- The web handoff uses the canonical `https://maps.lalgeo.com/maps` destination. There is currently no authenticated API-map deep-link or Maps-to-Survey link contract.

## Rollback

The iOS app is additive under `ios/`, plus a path-filtered CI workflow. Reverting the introducing commit removes the app without migrating or altering web/API data. Keychain and cache records are app-container scoped; deleting the app removes them from the device.
