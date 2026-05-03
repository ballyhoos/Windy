# Decision Engine Help (Multi-Sport)

This file documents the current multi-sport decision model used by Windy.

## Supported Sports

- `paddle`
- `kayak`
- `surf`
- `kite`

## Decision Output Model

The engine returns separate safety, quality, and viability states, plus one UI traffic-light state:

```ts
type DecisionResult = {
  safety: "green" | "amber" | "red";
  quality: "poor" | "ok" | "good";
  viability: "not-enough" | "usable" | "too-much";
  displayStatus: "green" | "amber" | "red";
  title: string;
  reasons: DecisionReason[];
  recommendation: string;
};
```

## Display Status Priority

`displayStatus` is derived in this order:

1. `safety = red` -> `red`
2. `safety = amber` -> `amber`
3. `viability = not-enough | too-much` -> `amber`
4. `quality = poor` -> `amber`
5. otherwise -> `green`

This ensures poor quality and low/too-high viability do not look like hard safety failures.

## Core Evaluation Flow

1. Convert wind and gust to knots.
2. Evaluate wind safety thresholds from sport profile.
3. Evaluate gust with absolute threshold + ratio + spread.
4. Evaluate swell safety.
5. Apply shore-relation logic (onshore/offshore/cross-shore).
6. Evaluate daylight buffer.
7. Apply sport-specific quality and viability logic.
8. Derive `displayStatus`.

## Gust Logic

Gust does not go red on ratio alone. It uses:

- absolute gust threshold (`gustKn`)
- gust-to-wind ratio (`gustKn / windKn`)
- gust spread (`gustKn - windKn`)

Red trigger pattern:

```ts
if (
  gustKn >= profile.gust.redKn ||
  (windKn >= profile.wind.amberKn &&
    gustRatio >= profile.gust.redRatio &&
    gustSpreadKn >= profile.gust.redSpreadKn)
) {
  // red
}
```

## Profiles

### Paddle

- Wind: amber `12kn`, red `16kn`
- Gust: amber ratio `1.2`, red ratio `1.3`, amber spread `5kn`, red spread `8kn`, amber gust `16kn`, red gust `22kn`
- Swell: amber `0.45m`, red `0.8m`
- Offshore safety risk: amber `8kn`, red `12kn`
- Daylight red buffer: `90` minutes

### Kayak

- Wind: amber `15kn`, red `20kn`
- Gust: amber ratio `1.25`, red ratio `1.4`, amber spread `6kn`, red spread `10kn`, amber gust `20kn`, red gust `28kn`
- Swell: amber `0.6m`, red `1.0m`
- Offshore safety risk: amber `12kn`, red `16kn`
- Daylight red buffer: `90` minutes

### Surf

- Wind: amber `20kn`, red `28kn`
- Gust: amber ratio `1.3`, red ratio `1.5`, amber spread `8kn`, red spread `12kn`, amber gust `28kn`, red gust `38kn`
- Swell: poor-below `0.8m`, red `2.5m`
- Offshore: quality bonus allowed, no direct safety override
- Daylight red buffer: `60` minutes

Surf-specific behavior:

- Swell below `poorBelowM` -> `quality: poor` (not safety red/amber by itself)
- Onshore wind -> quality penalty
- Offshore wind (below red wind) -> quality bonus

### Kite

- Wind: too-low `12kn`, minimum `15kn`, amber `40kn`, red `50kn`
- Gust: amber ratio `1.35`, red ratio `1.6`, amber spread `8kn`, red spread `12kn`, amber gust `32kn`, red gust `42kn`
- Swell: red `2.2m`
- Offshore safety risk: red at any offshore wind (`redKn: 1`)
- Daylight red buffer: `75` minutes

Kite-specific behavior:

- Wind `< tooLowKn` -> `viability: not-enough` (not auto safety red)
- Wind `tooLowKn..minimumKn` -> `viability: not-enough`, `quality: poor`

## Notes

- The model is config-driven by sport profile, not hardcoded sport branching.
- Missing data keeps conservative safety behavior.
- Open-water swimming is intentionally excluded in this phase.
