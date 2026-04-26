# FIXES_AND_RECOMMENDATIONS.md

Prioritised backlog for Windy.

## Priority 1 — Trust and safety

### 1. Wire real BOM marine warnings
Status: Not complete

The decision engine supports active warnings, but live weather flows should reliably populate warning data. This is one of the highest-value safety improvements.

Success criteria:
- active warnings are fetched from a live source;
- warnings influence decisions consistently;
- warning source is visible to users.

### 2. Show data freshness and provider labels
Status: Needs improvement

Users should immediately see:
- updated at time;
- observed vs forecast;
- provider name.

Success criteria:
- freshness visible on main card;
- stale data clearly indicated;
- no hidden provider switching.

### 3. Add clear disclaimer
Status: Needs improvement

The app should state that it is a decision aid and users must still assess local conditions, skill level, and hazards.

## Priority 2 — Tide quality

### 4. Expand BOM tide station coverage
Status: Partial

Current tide station aliases cover common launch areas. Add more Australian locations and validate station matches.

Targets:
- NSW north/south coast
- QLD coast and Gold Coast
- WA additional metro/regional spots
- SA gulfs and Yorke Peninsula
- TAS regional launches
- NT major launches

### 5. Improve tidal current risk model
Status: Basic

Current risk is based on proximity to tide turns and tidal range heuristics. Improve with location-specific current behaviour for:
- river mouths
n- bars
- inlets
- narrow channels
- estuaries

### 6. Show next high/low tide in UI
Status: Missing/unclear

Expose tide timing directly in the main experience.

## Priority 3 — Location accuracy

### 7. Replace hardcoded shoreline orientation model
Status: Needs improvement

Current offshore/onshore logic depends on a limited set of location IDs. Replace with per-location metadata or coastline-derived orientation.

### 8. Improve search quality
Status: Good but improvable

Enhance suburb/beach matching, typo tolerance, and common nickname handling.

### 9. Save recent/favourite launch spots
Status: Nice to have

Allow quick switching between commonly used locations.

## Priority 4 — UX polish

### 10. Fix location picker reset behaviour
Status: Needs review

After selecting a location, ensure the picker text feels intuitive and reflects the chosen place when reopened.

### 11. Add loading skeleton states
Status: Nice to have

Reduce visual flicker during location changes and refreshes.

### 12. Improve accessibility audit
Status: Ongoing

Check:
- keyboard navigation;
- focus states;
- screen reader labels;
- colour contrast.

## Priority 5 — Engineering quality

### 13. Add automated tests
Status: Missing

Recommended:
- unit tests for `decisionEngine.ts`
- provider parser tests for `tideApi.ts`
- utility tests for location matching
- smoke test for app render

### 14. Add structured logging for provider failures
Status: Missing

Capture when BOM/Open-Meteo parsing fails so regressions are visible.

### 15. Refactor provider adapters
Status: Future

Create a provider abstraction layer so weather, tide, and warning sources can be swapped independently.

## Suggested roadmap

### Next sprint
1. Wire BOM marine warnings
2. Show data freshness
3. Expand tide stations
4. Show next high/low tide

### Following sprint
1. Improve offshore wind model
2. Add tests
3. Improve search and favourites
4. Accessibility pass
