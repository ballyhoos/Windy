# Shoreline Grid Generation (Standalone Preprocessing)

This project uses an offline Python preprocessing step to generate Australia-only, state-split shoreline orientation lookup grids for the Windy public site.

All geospatial computation happens in:

- `scripts/generate_shoreline_grid.py`

The Windy app/runtime should only load generated JSON from:

- `public/data/shoreline-grid-vic.json`
- `public/data/shoreline-grid-nsw.json`
- `public/data/shoreline-grid-qld.json`
- `public/data/shoreline-grid-sa.json`
- `public/data/shoreline-grid-wa.json`
- `public/data/shoreline-grid-tas.json`
- `public/data/shoreline-grid-nt.json`

## 1) Prerequisites

Python 3.10+ recommended.

Install dependencies:

```bash
pip install geopandas shapely pyproj rtree tqdm
```

## 2) Input source data

Place raw source datasets under:

- `source-data/`

Examples:

- `source-data/ga-coastline.shp`
- `source-data/coastline.geojson`
- optional land mask: `source-data/land.geojson`

## 3) Run command

```bash
python scripts/generate_shoreline_grid.py \
  --input ./source-data/coastline/lines.shp \
  --output-dir ./public/data/ \
  --resolution 0.01 \
  --max-distance-km 25
```

Optional:

```bash
--land-polygon ./source-data/land.geojson
--source-licence "Geoscience Australia ..."
```

## 4) Algorithm summary

1. Load coastline geometry from input.
2. Reproject to EPSG:3577 for distance and bearing math.
3. Explode coastlines into 2-point line segments.
4. Build nearest-neighbour spatial index with `STRtree`.
5. Generate AU grid:
   - lat `-44` to `-10`
   - lon `112` to `154`
   - step = `--resolution`
6. For each grid point:
   - nearest coastline segment
   - distance to coast in metres
   - skip if farther than `--max-distance-km`
   - shoreline bearing from nearest segment direction
   - derive perpendicular sea candidates (`+90` / `-90`)
   - if land polygon provided, choose candidate facing sea
   - otherwise use reduced-confidence fallback
7. Assign each included point to one state via deterministic bbox precedence.
8. Write compact per-state runtime JSON + metadata JSON.

## 5) Output contracts

Runtime JSON (`public/data/shoreline-grid-<state>.json`):

- `version` (`2`)
- `state`
- `resolutionDeg`
- `maxDistanceKm`
- `encoding`
- `cells`

Cell entry:

- key: `"lat,lon"` at fixed precision matching resolution (`0.01` -> 2 decimals, e.g. `"-37.94,145.00"`)
- value: `[seaBearingDeg, distanceToCoastM, confidence]`
- confidence is stored as integer percent `0..100`

Metadata JSON (`public/data/shoreline-grid-<state>.meta.json`) includes:

- generation timestamp
- source path + hash
- CRS/resolution/distance parameters
- cell counts and diagnostics

## 6) Tuning resolution vs file size

- Smaller `--resolution` (e.g. `0.002`) -> higher detail, larger file, slower generation.
- Larger `--resolution` (e.g. `0.01`) -> smaller file, lower detail.
- `--max-distance-km` controls near-coast inclusion window and file size.

Default settings:

- `--resolution 0.01`
- `--max-distance-km 25`

Then tune based on generated file size and coastal UX needs.

## 7) Regeneration workflow

1. Update source files in `source-data/`.
2. Run generator command.
3. Confirm all state files are overwritten in `public/data/`.
4. Commit updated runtime JSON/meta artifacts.

## 8) Architecture boundary

- Generator remains standalone in `/scripts/`.
- Source datasets remain in `/source-data/`.
- Runtime app must not perform geospatial processing.
- No API/service/backend required for this workflow.
