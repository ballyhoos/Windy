# Windy
Windy (BOM-first paddle conditions app)

## GitHub Pages

Build standard app output:

```sh
npm run build
```

Build GitHub Pages publish artifact:

```sh
npm run build:docs
```

This generates:

- `dist/` (standard Vite output, external hashed assets)
- `docs/index.html` (Pages entry)
- `docs/assets/*` (copied from `dist/assets`)

Cache busting for docs build:

- `docs/index.html` includes `?v=YYMMDD-HHMM` on CSS/JS asset URLs
- `docs/index.html` includes `<meta name="windy-build-version" ...>`

In GitHub, set Pages to publish from the `main` branch and `/docs` folder. The app is available at:

```text
https://ballyhoos.github.io/Windy/
```

## Weather Data

The app is static (GitHub Pages) and uses a Cloudflare Worker as the BOM data gateway.

Set:

```sh
VITE_WEATHER_PROXY_BASE_URL=https://windy-bom-proxy.695.workers.dev
```

### Runtime request flow

1. Location search:
   - `GET {WORKER}/locations?query=Hampton%2C%20Victoria`
2. Station resolution:
   - `GET {WORKER}/resolve-station?query=Hampton%2C%20Victoria&state=VIC`
3. Live observations (main icon + wind pill + air/water temp):
   - `GET {WORKER}/observations?stationId=coastal%3AIDV60701.95872`
4. Wind forecast (graph anchors):
   - `GET {WORKER}/forecast?locationId=r1r05v8&state=VIC&name=Hampton%2C%20Victoria`
5. Tide events (graph tide line/points):
   - `GET {WORKER}/tides?lat=-37.94&lon=145.00&state=VIC&locationName=Hampton%2C%20Victoria`
6. Sunrise/sunset (frontend direct call for graph markers):
   - `GET https://api.sunrise-sunset.org/json?lat=-37.94&lng=145.00&formatted=0`

### BOM source URLs used by Worker

- BOM Locations API:
  - `https://api.weather.bom.gov.au/v1/locations?search=Hampton`
- BOM Observations API:
  - `https://api.weather.bom.gov.au/v1/locations/{geohash}/observations`
- BOM Hourly Forecast API:
  - `https://api.weather.bom.gov.au/v1/locations/{geohash}/forecasts/hourly`
- BOM Coastal FWO JSON (curated coastal stations):
  - `https://www.bom.gov.au/fwo/IDV60701/IDV60701.95872.json`
- BOM Tides print page:
  - `https://www.bom.gov.au/australia/tides/print.php?aac=VIC_TP009&days=7&region=VIC&type=tide&tz=Australia%2FMelbourne`

### Caching

- `/resolve-station`: cached 24h, localhost/127.0.0.1 bypass, header `x-worker-cache: hit|miss|bypass`
- `/tides`: layered cache (registry/resolution/predictions), localhost/127.0.0.1 bypass, header `x-tide-cache`
- `/observations` and `/forecast`: live path (not long-cached like station resolution)

### Notes

- Tide graph renders only when real tide events are returned. No synthetic tide fallback is shown.
- Station text is hidden in UI; resolved station is logged in browser console (`[Windy] Location: ... | Station: ...`).

## Cloudflare Worker Deploy

Worker source is in `/worker`.

```sh
cd worker
npx wrangler deploy
```

Then set `VITE_WEATHER_PROXY_BASE_URL` in your app env and redeploy GitHub Pages build.
