# AGENTS.md

Guidance for future coding agents working on Windy.

## Project overview

Windy is a static React + TypeScript + Vite app for paddle boarding condition checks. It is published with GitHub Pages from the `docs/` folder.

The core user promise is simple: help a paddler decide whether conditions are suitable right now, using an easy-to-read status:

- green: `Let's go!`
- amber: `Be careful`
- red: `Don't go`

Treat this as a safety-adjacent decision aid. Prefer conservative fallbacks over optimistic assumptions whenever live data is unavailable or ambiguous.

## Important commands

```sh
npm install
npm run build
npm run build:pages
```

`npm run build` runs TypeScript and Vite. `npm run build:pages` builds the static GitHub Pages output into `docs/`.

## Deployment

GitHub Pages should publish from:

- branch: `main`
- folder: `/docs`

After UI or logic changes, run `npm run build:pages` and commit the generated `docs/` output if the site is deployed from checked-in static assets.

## Main code paths

- `src/App.tsx` orchestrates location, loading state, condition fetching, and decision evaluation.
- `src/components/StatusCard.tsx` renders the main status UI, location picker, wind arrow, and current metrics.
- `src/components/HourlyOutlook.tsx` renders the hourly outlook graph.
- `src/lib/decisionEngine.ts` turns marine, tide, and sun inputs into green/amber/red decisions.
- `src/lib/weatherApi.ts` fetches/derives live marine and weather conditions.
- `src/lib/tideApi.ts` fetches/derives tide conditions. It currently uses a defensive BOM tide provider adapter with safe fallback behaviour.
- `src/lib/sunApi.ts` fetches/derives sunrise, sunset, and daylight buffer information.
- `src/lib/hourlyOutlook.ts` maps hourly condition data into display/risk points.
- `src/data/coastalStations.ts` stores preferred BOM coastal observation stations and aliases.
- `src/types/conditions.ts` defines shared domain types.
- `src/styles.css` contains the app styling.

## Safety and fallback principles

1. Do not silently mark conditions safe when a safety-critical provider fails.
2. If tide, warning, storm, visibility, or wind data is missing, prefer amber/moderate language over green/low confidence.
3. Keep `sourceLabel` values clear and user-readable. Users should know whether data is from BOM, Open-Meteo, mock, fallback, or unavailable.
4. Any provider adapter should catch upstream failures and return a conservative condition object instead of crashing the app.
5. Avoid changing thresholds without explaining why in comments or docs.

## Data providers and caveats

### BOM weather and observations

`weatherApi.ts` uses BOM observations where possible, then falls back to BOM location observations or Open-Meteo forecast data.

The app is static and browser-only, so avoid adding server-only secrets or backend assumptions unless the deployment architecture changes.

### BOM tide predictions

`src/lib/tideApi.ts` contains a best-effort BOM tide adapter. BOM tide predictions are exposed primarily through public web pages rather than a stable documented JSON API. Keep parsing defensive:

- try multiple URL shapes;
- support structured JSON if available;
- fall back to HTML/text parsing;
- return conservative unavailable/moderate tide conditions if parsing fails.

When adding a location, add a high-confidence station alias and coordinates to the station list. Do not assume the nearest tide station is always hydrologically correct for enclosed bays, rivers, bars, or estuaries.

### Open-Meteo

Open-Meteo is useful as a fallback for weather/marine data. Do not label Open-Meteo data as BOM data.

## Location handling

Location search is Australian-focused. It uses OpenStreetMap Nominatim geocoding and falls back to known mock locations if geocoding fails.

When improving location logic:

- preserve browser-only compatibility;
- keep results bounded to Australia unless the product scope changes;
- dedupe names carefully;
- keep current-location behaviour resilient to denied permissions.

## UI guidelines

- Keep the main screen fast to understand at a glance.
- Avoid adding dense text to the primary card.
- Make uncertainty visible but not alarming.
- Preserve mobile-first layout.
- Use accessible labels for icon-only controls.
- Make safety-critical source/freshness information visible.

## Testing checklist before committing

Run:

```sh
npm run build
```

Then manually check:

- default location loads;
- current location permission denied does not break the app;
- location search opens, searches, and selects;
- main status updates after changing location;
- tide fallback does not crash when BOM is unavailable;
- wind arrow and wind label remain sensible for calm/unknown wind;
- mobile layout at 320px width remains usable.

## Commit hygiene

Prefer small commits with focused messages, for example:

- `Wire BOM marine warnings into decision engine`
- `Add tide station aliases for Port Phillip Bay`
- `Show data freshness in status card`

Avoid mixing generated `docs/` output with unrelated source changes unless you are intentionally deploying the change.
