# Paddle Check Agent Notes

## Current Architecture

- Frontend: React + TypeScript static site (GitHub Pages).
- Backend/data proxy: Cloudflare Worker at `windy-bom-proxy.695.workers.dev`.
- Core rule: frontend calls Worker endpoints for BOM weather/tide data paths.

## Worker Endpoints

- `GET /locations?query=...`
- `GET /resolve-station?query=...&state=...`
- `GET /observations?stationId=...`
- `GET /forecast?locationId=...&state=...&name=...`
- `GET /tides?lat=...&lon=...&state=...&locationName=...`

## Source-of-Truth Data Paths

- Live wind/dir/gust/temp:
  - Worker `/observations`
  - BOM API (`/v1/locations/{geohash}/observations`) or curated coastal FWO JSON where applicable.
- Forecast wind graph anchors:
  - Worker `/forecast`
  - BOM hourly API (`/v1/locations/{geohash}/forecasts/hourly`) as canonical source.
- Tide graph line/points:
  - Worker `/tides`
  - BOM tides print page parser (`/australia/tides/print.php?...`).

## Graph Rules

- Wind:
  - Real forecast anchors are colored.
  - Interpolated wind points remain grey.
- Tide:
  - Render only if real tide events exist.
  - No synthetic tide fallback when events are missing.

## UI Debug Behavior

- Station line is intentionally hidden from UI.
- Resolved station is logged in browser console:
  - `[Paddle Check] Station: <name>`

## Caching Rules

- Enable cache in production for:
  - station resolution (24h)
  - tide registry/resolution/predictions (layered)
- Bypass cache for localhost/127.0.0.1 development requests.

## Operational Notes

- Keep BOM as primary weather/tide source for this project.
- Avoid reintroducing Open-Meteo or mock/default tide scaffolding.
- If tide provider fails, keep app stable and omit tide graph elements rather than faking data.
