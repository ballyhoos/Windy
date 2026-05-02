export type ShorelineRegion = 'vic' | 'nsw' | 'qld' | 'sa' | 'wa' | 'tas' | 'nt';

type ShorelineCell = [number, number, number];

export type ShorelineGridData = {
  version: number;
  state: string;
  resolutionDeg: number;
  maxDistanceKm: number;
  encoding: string;
  cells: Record<string, ShorelineCell>;
};

export type ShorelineLookupResult = {
  available: boolean;
  seaBearingDeg?: number;
  distanceToCoastM?: number;
  confidence?: number;
};

const REGION_BBOXES: Array<{
  region: ShorelineRegion;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}> = [
  { region: 'tas', latMin: -44.5, latMax: -39.0, lonMin: 143.0, lonMax: 149.0 },
  { region: 'vic', latMin: -39.5, latMax: -33.8, lonMin: 140.0, lonMax: 150.5 },
  { region: 'nsw', latMin: -37.5, latMax: -28.0, lonMin: 141.0, lonMax: 154.5 },
  { region: 'qld', latMin: -29.5, latMax: -10.0, lonMin: 137.0, lonMax: 154.5 },
  { region: 'sa', latMin: -38.5, latMax: -25.5, lonMin: 129.0, lonMax: 141.5 },
  { region: 'wa', latMin: -35.5, latMax: -10.0, lonMin: 112.0, lonMax: 129.5 },
  { region: 'nt', latMin: -26.5, latMax: -10.0, lonMin: 129.0, lonMax: 138.5 },
];

const shorelineGridCache: Partial<Record<ShorelineRegion, ShorelineGridData>> = {};
const shorelineGridPromiseCache: Partial<Record<ShorelineRegion, Promise<ShorelineGridData | null>>> = {};
const shorelineLookupCache: Record<string, ShorelineLookupResult> = {};

const MIN_SHORELINE_CONFIDENCE = 0.5;
const MAX_SHORELINE_DISTANCE_M = 20_000;

export function getAustralianShorelineRegion(lat: number, lon: number): ShorelineRegion | null {
  for (const box of REGION_BBOXES) {
    if (lat >= box.latMin && lat <= box.latMax && lon >= box.lonMin && lon <= box.lonMax) {
      return box.region;
    }
  }
  return null;
}

export async function loadRegionalShorelineGrid(region: ShorelineRegion): Promise<ShorelineGridData | null> {
  const cached = shorelineGridCache[region];
  if (cached) return cached;

  const pending = shorelineGridPromiseCache[region];
  if (pending) return pending;

  const request = fetch(`${import.meta.env.BASE_URL}data/shoreline-grid-${region}.json`)
    .then(async (response) => {
      if (!response.ok) return null;
      const data = (await response.json()) as ShorelineGridData;
      shorelineGridCache[region] = data;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      delete shorelineGridPromiseCache[region];
    });

  shorelineGridPromiseCache[region] = request;
  return request;
}

function getKeyPrecision(resolutionDeg: number): number {
  if (resolutionDeg >= 0.01) return 2;
  const text = `${resolutionDeg}`.trim();
  const parts = text.split('.');
  return parts[1]?.length ?? 0;
}

function snapToGrid(value: number, resolutionDeg: number): number {
  return Math.round(value / resolutionDeg) * resolutionDeg;
}

function getShorelineKey(lat: number, lon: number, resolutionDeg: number): string {
  const precision = getKeyPrecision(resolutionDeg);
  const snappedLat = snapToGrid(lat, resolutionDeg);
  const snappedLon = snapToGrid(lon, resolutionDeg);
  return `${snappedLat.toFixed(precision)},${snappedLon.toFixed(precision)}`;
}

export async function getShorelineForLocation(lat: number, lon: number): Promise<ShorelineLookupResult> {
  const region = getAustralianShorelineRegion(lat, lon);
  if (!region) return { available: false };

  const grid = await loadRegionalShorelineGrid(region);
  if (!grid) return { available: false };

  const key = getShorelineKey(lat, lon, grid.resolutionDeg);
  const cacheKey = `${region}:${key}`;
  const cached = shorelineLookupCache[cacheKey];
  if (cached) return cached;

  const cell = grid.cells[key];
  if (!cell) {
    const unavailable = { available: false } satisfies ShorelineLookupResult;
    shorelineLookupCache[cacheKey] = unavailable;
    return unavailable;
  }

  const [seaBearingDeg, distanceToCoastM, confidencePercent] = cell;
  const confidence = confidencePercent / 100;
  const distanceLimit = Math.min(MAX_SHORELINE_DISTANCE_M, Math.round(grid.maxDistanceKm * 1000));

  if (confidence < MIN_SHORELINE_CONFIDENCE || distanceToCoastM > distanceLimit) {
    const unavailable = { available: false } satisfies ShorelineLookupResult;
    shorelineLookupCache[cacheKey] = unavailable;
    return unavailable;
  }

  const result: ShorelineLookupResult = {
    available: true,
    seaBearingDeg,
    distanceToCoastM,
    confidence,
  };
  shorelineLookupCache[cacheKey] = result;
  return result;
}
