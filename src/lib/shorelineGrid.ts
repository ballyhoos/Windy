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

export type ShorelineSmoothedLookupResult = ShorelineLookupResult & {
  spreadDeg?: number;
  sampleCount?: number;
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
const MAX_BEARING_SPREAD_DEG = 55;
const MIN_SMOOTHED_SAMPLE_COUNT = 6;

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

export async function getSmoothedShorelineForLocation(
  lat: number,
  lon: number,
): Promise<ShorelineSmoothedLookupResult> {
  const region = getAustralianShorelineRegion(lat, lon);
  if (!region) return { available: false };

  const grid = await loadRegionalShorelineGrid(region);
  if (!grid) return { available: false };

  const precision = getKeyPrecision(grid.resolutionDeg);
  const centerLat = snapToGrid(lat, grid.resolutionDeg);
  const centerLon = snapToGrid(lon, grid.resolutionDeg);
  const distanceLimit = Math.min(MAX_SHORELINE_DISTANCE_M, Math.round(grid.maxDistanceKm * 1000));

  const candidates: Array<{
    seaBearingDeg: number;
    distanceToCoastM: number;
    confidence: number;
    weight: number;
  }> = [];

  // 5x5 local neighborhood smoothing (no hardcoded place overrides).
  for (let dLat = -2; dLat <= 2; dLat += 1) {
    for (let dLon = -2; dLon <= 2; dLon += 1) {
      const sampleLat = centerLat + dLat * grid.resolutionDeg;
      const sampleLon = centerLon + dLon * grid.resolutionDeg;
      const key = `${sampleLat.toFixed(precision)},${sampleLon.toFixed(precision)}`;
      const cell = grid.cells[key];
      if (!cell) continue;

      const [seaBearingDeg, distanceToCoastM, confidencePercent] = cell;
      const confidence = confidencePercent / 100;
      if (confidence < MIN_SHORELINE_CONFIDENCE || distanceToCoastM > distanceLimit) continue;

      const offsetKm = haversineKm(lat, lon, sampleLat, sampleLon);
      const weight = confidence * (1 / (1 + offsetKm)) * (1 / (1 + distanceToCoastM / 2000));
      candidates.push({ seaBearingDeg, distanceToCoastM, confidence, weight });
    }
  }

  if (candidates.length === 0) {
    return { available: false };
  }

  const centerBearing = weightedCircularMean(candidates.map((item) => ({ deg: item.seaBearingDeg, weight: item.weight })));
  const filtered = candidates.filter(
    (item) => smallestAngleDelta(item.seaBearingDeg, centerBearing) <= 60,
  );
  const usable = filtered.length >= 4 ? filtered : candidates;

  const smoothedBearing = weightedCircularMean(usable.map((item) => ({ deg: item.seaBearingDeg, weight: item.weight })));
  const spreadDeg = circularSpreadDeg(usable.map((item) => item.seaBearingDeg), smoothedBearing);

  if (spreadDeg > MAX_BEARING_SPREAD_DEG || usable.length < MIN_SMOOTHED_SAMPLE_COUNT) {
    return { available: false, spreadDeg, sampleCount: usable.length };
  }

  const weightTotal = usable.reduce((sum, item) => sum + item.weight, 0);
  const weightedDistance =
    weightTotal > 0
      ? usable.reduce((sum, item) => sum + item.distanceToCoastM * item.weight, 0) / weightTotal
      : usable.reduce((sum, item) => sum + item.distanceToCoastM, 0) / usable.length;
  const weightedConfidence =
    weightTotal > 0
      ? usable.reduce((sum, item) => sum + item.confidence * item.weight, 0) / weightTotal
      : usable.reduce((sum, item) => sum + item.confidence, 0) / usable.length;

  return {
    available: true,
    seaBearingDeg: smoothedBearing,
    distanceToCoastM: Math.round(weightedDistance),
    confidence: weightedConfidence,
    spreadDeg,
    sampleCount: usable.length,
  };
}

function weightedCircularMean(samples: Array<{ deg: number; weight: number }>): number {
  let x = 0;
  let y = 0;
  for (const sample of samples) {
    const radians = (sample.deg * Math.PI) / 180;
    x += Math.cos(radians) * sample.weight;
    y += Math.sin(radians) * sample.weight;
  }
  if (x === 0 && y === 0) return 0;
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

function circularSpreadDeg(samples: number[], centerDeg: number): number {
  if (samples.length <= 1) return 0;
  return (
    samples.reduce((sum, deg) => sum + smallestAngleDelta(deg, centerDeg), 0) / samples.length
  );
}

function smallestAngleDelta(a: number, b: number): number {
  const normalizedA = ((a % 360) + 360) % 360;
  const normalizedB = ((b % 360) + 360) % 360;
  const raw = Math.abs(normalizedA - normalizedB);
  return Math.min(raw, 360 - raw);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}
