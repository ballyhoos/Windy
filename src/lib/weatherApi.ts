import type {
  LocationOption,
  MarineHourlyPoint,
  MarineConditionSet,
  WarningInfo,
} from '../types/conditions';

type BomObservedWind = {
  speed: number | null;
  gust: number | null;
  directionDegrees: number | null;
  cardinal: string;
  airTempC: number | null;
  feelsLikeTempC: number | null;
  waterTempC: number | null;
  sourceLabel: string;
};

type BomForecastWindPoint = {
  timestamp: string;
  speed: number | null;
  directionDegrees: number | null;
  cardinal: string;
  airTempC: number | null;
  weatherCode: number | null;
};

type BomLocationSearchPayload = {
  data?: Array<{
    geohash?: string;
    id?: string;
    name?: string;
    postcode?: string;
    state?: string;
  }>;
};

type BomThreeHourlyForecastPayload = {
  data?: Array<{
    time?: string;
    temp?: number | string | null;
    icon_descriptor?: string | null;
    wind?: {
      speed_kilometre?: number | string | null;
      speed_knot?: number | string | null;
      direction?: string | null;
    };
  }>;
};

type BomLocationObservationPayload = {
  data?: {
    temp?: number | string | null;
    wind?: {
      speed_kilometre?: number | string | null;
      speed_knot?: number | string | null;
      direction?: string | null;
    };
    gust?: {
      speed_kilometre?: number | string | null;
      speed_knot?: number | string | null;
    };
    station?: {
      name?: string;
      distance?: number | string | null;
      bom_id?: string | number | null;
    };
  };
};

function bomFetchUrl(url: string): string {
  const parsed = new URL(url);
  return url.startsWith('https://www.bom.gov.au')
    ? `https://www.bom.gov.au${parsed.pathname}${parsed.search}`
    : url;
}

function bomApiFetchUrl(path: string): string {
  if (import.meta.env.PROD) {
    return `https://api.weather.bom.gov.au${path}`;
  }
  return `/bom-api${path}`;
}

function weatherProxyBaseUrl(): string {
  const configured = import.meta.env.VITE_WEATHER_PROXY_BASE_URL;
  if (!configured || configured.trim().length === 0) {
    throw new Error('Missing VITE_WEATHER_PROXY_BASE_URL');
  }
  return configured.replace(/\/+$/, '');
}

export async function searchLocations(query: string): Promise<LocationOption[]> {
  const trimmed = query.trim();

  if (!trimmed) {
    return [];
  }

  try {
    // Primary geocoding for reliable suburb coordinates.
    const variants = buildQueryVariants(trimmed);
    const aggregate: LocationOption[] = [];
    for (const variant of variants) {
      const nominatimResults = dedupeLocationOptions(await fetchNominatimGeocode(variant));
      aggregate.push(...nominatimResults);
      if (aggregate.length >= 8) {
        break;
      }
    }
    const deduped = dedupeLocationOptions(aggregate).slice(0, 8);
    if (deduped.length > 0) {
      return deduped;
    }

    return [];
  } catch {
    return [];
  }
}

export async function resolveNearestLocation(
  latitude: number,
  longitude: number,
): Promise<LocationOption> {
  const fromNominatim = await fetchNominatimReverse(latitude, longitude);
  const inferredRegion = inferAustralianStateFromCoordinates(latitude, longitude);
  const baseLocation = fromNominatim
    ? {
        ...fromNominatim,
        region: fromNominatim.region ?? inferredRegion ?? undefined,
      }
    : {
        id: `current-${latitude.toFixed(3)}-${longitude.toFixed(3)}`,
        name: 'Current location',
        latitude,
        longitude,
        region: inferredRegion ?? undefined,
      };
  return baseLocation;
}

function dedupeLocationOptions(options: LocationOption[]): LocationOption[] {
  const seen = new Set<string>();
  const output: LocationOption[] = [];

  for (const option of options) {
    const key = `${option.name}|${option.region ?? ''}`.trim().toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(option);
  }

  return output;
}

type NominatimResult = {
  place_id?: number;
  name?: string;
  lat: string;
  lon: string;
  display_name: string;
  category?: string;
  type?: string;
  address?: {
    suburb?: string;
    town?: string;
    city?: string;
    village?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
};

async function fetchNominatimGeocode(query: string): Promise<LocationOption[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '8');
  url.searchParams.set('countrycodes', 'au');
  // Keep fallback geocoding focused on Australia bounds for suburb-level relevance.
  url.searchParams.set('viewbox', '112.9,-10.0,154.0,-44.0');
  url.searchParams.set('bounded', '1');

  const response = await fetch(url.toString());
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as NominatimResult[];

  return payload
    .filter((result) => {
      const code = (result.address?.country_code ?? '').toLowerCase();
      const country = (result.address?.country ?? '').toLowerCase();
      const display = (result.display_name ?? '').toLowerCase();
      return code === 'au' || country === 'australia' || display.includes('australia');
    })
    .map((result) => {
      const locality =
        result.address?.suburb ??
        result.address?.town ??
        result.address?.city ??
        result.address?.village ??
        result.name ??
        result.display_name.split(',')[0] ??
        'Unknown';
      const region = result.address?.state;

      return {
        id: `osm-au-${result.place_id ?? `${result.lat}-${result.lon}`}`,
        name: region ? `${locality}, ${region}` : locality,
        latitude: Number(result.lat),
        longitude: Number(result.lon),
        region,
      };
    });
}

async function fetchNominatimReverse(
  latitude: number,
  longitude: number,
): Promise<LocationOption | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');

    const response = await fetch(url.toString());
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as NominatimResult;
    const region = payload.address?.state;
    const locality =
      payload.address?.suburb ??
      payload.address?.town ??
      payload.address?.city ??
      payload.address?.village ??
      payload.name ??
      payload.display_name?.split(',')[0] ??
      'Current location';

    return {
      id: `osm-au-${payload.place_id ?? `${latitude}-${longitude}`}`,
      name: region ? `${locality}, ${region}` : locality,
      latitude,
      longitude,
      region,
    };
  } catch {
    return null;
  }
}

function buildQueryVariants(input: string): string[] {
  const normalized = input.replace(/\s+/g, ' ').trim();
  const deComma = normalized.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const expandedStates = expandAustralianStateNames(deComma);
  const withAustralia = `${expandedStates} Australia`.trim();

  return Array.from(
    new Set([normalized, deComma, expandedStates, withAustralia].filter((value) => value.length > 1)),
  );
}

function expandAustralianStateNames(value: string): string {
  return value
    .replace(/\bvic\b/gi, 'Victoria')
    .replace(/\bnsw\b/gi, 'New South Wales')
    .replace(/\bqld\b/gi, 'Queensland')
    .replace(/\bwa\b/gi, 'Western Australia')
    .replace(/\bsa\b/gi, 'South Australia')
    .replace(/\btas\b/gi, 'Tasmania')
    .replace(/\bnt\b/gi, 'Northern Territory')
    .replace(/\bact\b/gi, 'Australian Capital Territory')
    .trim();
}

export async function fetchMarineWeather(
  location: LocationOption,
  options?: { mockMode?: boolean },
): Promise<MarineConditionSet> {
  void options;
  const resolvedLocation: LocationOption = {
    ...location,
    region: location.region ?? inferAustralianStateFromCoordinates(location.latitude, location.longitude) ?? undefined,
  };
  const [bomObservedWind, bomForecastWind] = await Promise.all([
    fetchBomObservedWind(resolvedLocation),
    fetchBomDetailedWindForecast(resolvedLocation),
  ]);
  const bomForecastWeatherPayload =
    bomForecastWind !== null ? buildBomForecastWeatherPayload(bomForecastWind, bomObservedWind) : null;
  const hourlyTime = bomForecastWeatherPayload?.hourly?.time ?? [];
  const nowIndex = findNearestHourIndex(hourlyTime, new Date());
  const lookaheadIndex = Math.min(nowIndex + 3, hourlyTime.length - 1);

  const forecastMatch = bomForecastWind
    ? findNearestForecastWindPoint(hourlyTime[nowIndex] ?? new Date().toISOString(), bomForecastWind)
    : null;
  const forecastSpeed = forecastMatch?.speed ?? null;
  const forecastGust =
    forecastSpeed === null ? null : Math.max(forecastSpeed, Math.round(forecastSpeed * 1.35));
  const forecastDirectionDegrees = forecastMatch?.directionDegrees ?? null;
  const airTempC = bomObservedWind?.airTempC ?? forecastMatch?.airTempC ?? null;
  const feelsLikeTempC = bomObservedWind?.feelsLikeTempC ?? null;
  const waterTempC = bomObservedWind?.waterTempC ?? null;

  const speed = bomObservedWind?.speed ?? forecastSpeed;
  const gust = bomObservedWind?.gust ?? forecastGust;
  const directionDegrees = bomObservedWind?.directionDegrees ?? forecastDirectionDegrees;
  const cardinal = bomObservedWind?.cardinal ?? degreesToCardinal(directionDegrees ?? 0);
  const shoreRelation = 'variable';
  const warnings: WarningInfo[] = [];
  const hourly = buildLiveHourlyPoints(bomForecastWeatherPayload, bomObservedWind, nowIndex);

  return {
    location,
    wind: {
      speed,
      gust,
      directionDegrees,
      cardinal,
      shoreRelation,
    },
    airTempC,
    feelsLikeTempC,
    waterTempC,
    swellHeightM: null,
    visibilityKm: null,
    warnings,
    forecast: {
      summary: 'BOM forecast conditions.',
      thunderstormRisk: 'none',
      weatherChangingSoon:
        (lookaheadIndex >= 0 &&
          Math.abs(
            (numberAt(bomForecastWeatherPayload?.hourly?.wind_speed_10m, lookaheadIndex) ?? speed ?? 0) -
              (speed ?? 0),
          ) > 8) ||
        Math.abs((gust ?? 0) - (speed ?? 0)) > 8,
    },
    roughWater: false,
    sourceLabel: bomObservedWind ? `BOM observations · ${bomObservedWind.sourceLabel}` : 'BOM observations unavailable',
    forecastSourceLabel: bomForecastWind
      ? `BOM forecast (worker) · ${resolvedLocation.name}`
      : 'BOM forecast unavailable',
    hourly,
  };
}

type BomWeatherPayload = {
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    wind_gusts_10m?: Array<number | null>;
    wind_direction_10m?: Array<number | null>;
    is_wind_forecast_point?: boolean[];
    visibility?: Array<number | null>;
    weather_code?: Array<number | null>;
  };
};

function degreesToCardinal(degrees: number): string {
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return cardinals[Math.round(degrees / 45) % 8];
}

function buildLiveHourlyPoints(
  bomForecastWeatherPayload: BomWeatherPayload | null,
  bomObservedWind: BomObservedWind | null,
  currentIndex: number,
): MarineHourlyPoint[] {
  const times = bomForecastWeatherPayload?.hourly?.time ?? [];
  const points = times.map((timestamp, index) => {
    return {
      timestamp,
      windSpeed: numberAt(bomForecastWeatherPayload?.hourly?.wind_speed_10m, index),
      windGust: numberAt(bomForecastWeatherPayload?.hourly?.wind_gusts_10m, index),
      windDirectionDegrees: numberAt(bomForecastWeatherPayload?.hourly?.wind_direction_10m, index),
      isWindForecastPoint: Boolean(bomForecastWeatherPayload?.hourly?.is_wind_forecast_point?.[index]),
      airTempC: numberAt(bomForecastWeatherPayload?.hourly?.temperature_2m, index),
      feelsLikeTempC: null,
      waterTempC: null,
      swellHeightM: null,
      visibilityKm: null,
      weatherCode: numberAt(bomForecastWeatherPayload?.hourly?.weather_code, index),
    };
  });

  return points.map((point, index) => {
    if (index !== currentIndex || !bomObservedWind) {
      return point;
    }

    return {
      ...point,
      windSpeed: bomObservedWind.speed ?? point.windSpeed,
      windGust: bomObservedWind.gust ?? point.windGust,
      windDirectionDegrees: bomObservedWind.directionDegrees ?? point.windDirectionDegrees,
      airTempC: bomObservedWind.airTempC ?? point.airTempC,
      feelsLikeTempC: bomObservedWind.feelsLikeTempC ?? point.feelsLikeTempC,
    };
  });
}

function buildBomForecastWeatherPayload(
  points: BomForecastWindPoint[],
  observed: BomObservedWind | null,
): BomWeatherPayload {
  const now = new Date();
  const sortedPoints = [...points].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const start = roundToCurrentHour(now);
  const hourlyTimes: string[] = [];
  const temperature2m: Array<number | null> = [];
  const windSpeed10m: Array<number | null> = [];
  const windGusts10m: Array<number | null> = [];
  const windDirection10m: Array<number | null> = [];
  const isWindForecastPoint: boolean[] = [];
  const visibility: Array<number | null> = [];
  const weatherCode: Array<number | null> = [];

  for (let hour = 0; hour < 36; hour += 1) {
    const slot = addHours(start, hour);
    const match = findExactForecastWindPoint(slot.toISOString(), sortedPoints);
    const speed = match?.speed ?? observed?.speed ?? null;
    hourlyTimes.push(slot.toISOString());
    temperature2m.push(match?.airTempC ?? observed?.airTempC ?? null);
    windSpeed10m.push(match ? speed : null);
    windGusts10m.push(match ? (speed === null ? null : Math.max(speed, Math.round(speed * 1.35))) : null);
    windDirection10m.push(match?.directionDegrees ?? null);
    isWindForecastPoint.push(Boolean(match && speed !== null));
    visibility.push(null);
    weatherCode.push(match?.weatherCode ?? null);
  }

  return {
    hourly: {
      time: hourlyTimes,
      temperature_2m: temperature2m,
      wind_speed_10m: windSpeed10m,
      wind_gusts_10m: windGusts10m,
      wind_direction_10m: windDirection10m,
      is_wind_forecast_point: isWindForecastPoint,
      visibility,
      weather_code: weatherCode,
    },
  };
}

async function fetchBomObservedWind(location: LocationOption): Promise<BomObservedWind | null> {
  try {
    const base = weatherProxyBaseUrl();
    const stateCode =
      normalizeAustralianStateCode(location.region) ??
      inferAustralianStateFromCoordinates(location.latitude, location.longitude);
    if (!stateCode) return null;
    const stationResponse = await fetch(
      `${base}/resolve-station?query=${encodeURIComponent(location.name)}&state=${encodeURIComponent(stateCode)}`,
    );
    if (!stationResponse.ok) return null;
    const stationPayload = (await stationResponse.json()) as {
      station?: { geohash?: string; id?: string; name?: string };
    };
    const stationId = stationPayload.station?.geohash ?? stationPayload.station?.id;
    if (!stationId) return null;
    const observationResponse = await fetch(`${base}/observations?stationId=${encodeURIComponent(stationId)}`);
    if (!observationResponse.ok) return null;
    const payload = (await observationResponse.json()) as {
      temp_air_c?: number | null;
      temp_feels_like_c?: number | null;
      temp_water_c?: number | null;
      wind?: { speed_knot?: number | null; gust_knot?: number | null; direction?: string | null };
      station?: { name?: string };
    };
    const speed = parseMaybeNumber(payload.wind?.speed_knot == null ? undefined : String(payload.wind.speed_knot));
    const gust = parseMaybeNumber(payload.wind?.gust_knot == null ? undefined : String(payload.wind.gust_knot));
    const direction = extractCardinal(payload.wind?.direction ?? '');
    if (speed === null && direction === null) return null;
    const primaryObservation: BomObservedWind = {
      speed,
      gust,
      directionDegrees:
        direction === null || direction === 'CALM' || direction === 'VRB' ? null : cardinalToDegrees(direction),
      cardinal: direction === null || direction === 'CALM' || direction === 'VRB' ? 'Calm' : direction,
      airTempC: parseMaybeNumber(payload.temp_air_c == null ? undefined : String(payload.temp_air_c)),
      feelsLikeTempC: parseMaybeNumber(
        payload.temp_feels_like_c == null ? undefined : String(payload.temp_feels_like_c),
      ),
      waterTempC: parseMaybeNumber(payload.temp_water_c == null ? undefined : String(payload.temp_water_c)),
      sourceLabel: stationPayload.station?.name?.trim() || payload.station?.name?.trim() || 'BOM station',
    };
    if (primaryObservation.airTempC !== null || primaryObservation.waterTempC !== null) {
      return primaryObservation;
    }
    const fallbackTemps = await fetchBomApiTemperature(location);
    if (!fallbackTemps) {
      return primaryObservation;
    }
    return {
      ...primaryObservation,
      airTempC: fallbackTemps.airTempC,
      feelsLikeTempC: primaryObservation.feelsLikeTempC,
      waterTempC: fallbackTemps.waterTempC,
      sourceLabel: primaryObservation.sourceLabel,
    };
  } catch {
    return null;
  }
}

async function fetchBomApiTemperature(
  location: LocationOption,
): Promise<{ airTempC: number | null; waterTempC: number | null } | null> {
  const fallbackObservation = await fetchBomApiObservedWind(location);
  if (!fallbackObservation) {
    return null;
  }
  return {
    airTempC: fallbackObservation.airTempC,
    waterTempC: fallbackObservation.waterTempC,
  };
}

async function fetchBomApiObservedWind(location: LocationOption): Promise<BomObservedWind | null> {
  const stateCode =
    normalizeAustralianStateCode(location.region) ??
    inferAustralianStateFromCoordinates(location.latitude, location.longitude);
  if (!stateCode) {
    return null;
  }

  const bomLocation = await resolveBomForecastLocation(location, stateCode);
  if (!bomLocation?.geohash) {
    return null;
  }

  const modifiedGeohash = bomLocation.geohash.slice(0, -1);
  const response = await fetch(bomApiFetchUrl(`/v1/locations/${modifiedGeohash}/observations`));
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as BomLocationObservationPayload;
  const observation = payload.data;
  if (!observation?.wind) {
    return null;
  }

  const speed = firstDefinedNumber(
    parseMaybeNumber(observation.wind.speed_knot === undefined ? undefined : String(observation.wind.speed_knot)),
    parseMaybeNumber(observation.wind.speed_kilometre === undefined ? undefined : String(observation.wind.speed_kilometre)),
  );
  const gust = firstDefinedNumber(
    parseMaybeNumber(observation.gust?.speed_knot === undefined ? undefined : String(observation.gust.speed_knot)),
    parseMaybeNumber(observation.gust?.speed_kilometre === undefined ? undefined : String(observation.gust.speed_kilometre)),
  );
  const direction = extractCardinal(observation.wind.direction ?? '');

  if (speed === null && direction === null) {
    return null;
  }

  return {
    speed,
    gust,
    directionDegrees:
      direction === null || direction === 'CALM' || direction === 'VRB'
        ? null
        : cardinalToDegrees(direction),
    cardinal: direction === null || direction === 'CALM' || direction === 'VRB' ? 'Calm' : direction,
    airTempC: parseMaybeNumber(observation.temp === undefined ? undefined : String(observation.temp)),
    feelsLikeTempC: null,
    waterTempC: null,
    sourceLabel: observation.station?.name?.trim() || 'BOM location observation',
  };
}

function normalizeAustralianStateCode(region: string | undefined): string | null {
  if (!region) {
    return null;
  }

  const normalized = region.trim().toUpperCase();
  if (['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT'].includes(normalized)) {
    return normalized;
  }

  if (normalized === 'NEW SOUTH WALES') return 'NSW';
  if (normalized === 'VICTORIA') return 'VIC';
  if (normalized === 'QUEENSLAND') return 'QLD';
  if (normalized === 'WESTERN AUSTRALIA') return 'WA';
  if (normalized === 'SOUTH AUSTRALIA') return 'SA';
  if (normalized === 'TASMANIA') return 'TAS';
  if (normalized === 'NORTHERN TERRITORY') return 'NT';

  return null;
}

function buildBomPlaceSlugCandidates(location: LocationOption): string[] {
  const baseName = location.name.split(',')[0] ?? location.name;
  const normalized = normalizeText(baseName)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const stripped = normalized
    .replace(/-(beach|front-beach|cove|bay|harbour|harbor|point|foreshore|marina|jetty|wharf|island|north|south|east|west)$/, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');

  return Array.from(new Set([normalized, stripped].filter((value) => value.length > 0)));
}

function buildBomPlaceForecastDetailedUrl(stateCode: string, slug: string): string {
  return `https://www.bom.gov.au/places/${stateCode.toLowerCase()}/${slug}/forecast/detailed/`;
}

async function fetchBomDetailedWindForecast(location: LocationOption): Promise<BomForecastWindPoint[] | null> {
  const stateCode =
    normalizeAustralianStateCode(location.region) ??
    inferAustralianStateFromCoordinates(location.latitude, location.longitude);
  if (!stateCode) return null;
  try {
    const base = weatherProxyBaseUrl();
    const response = await fetch(
      `${base}/forecast?locationId=${encodeURIComponent(location.id)}&state=${encodeURIComponent(
        stateCode,
      )}&name=${encodeURIComponent(location.name)}`,
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      points?: Array<{ speed_knot?: number | null; direction?: string | null; time_iso?: string }>;
      source_type?: string;
    };
    const parsed = (payload.points ?? [])
      .map((item): BomForecastWindPoint | null => {
        if (!item.time_iso) return null;
        const slot = new Date(item.time_iso);
        if (Number.isNaN(slot.getTime())) return null;
        const direction = extractCardinal(item.direction ?? '');
        return {
          timestamp: slot.toISOString(),
          speed: parseMaybeNumber(item.speed_knot == null ? undefined : String(item.speed_knot)),
          directionDegrees:
            direction === null || direction === 'CALM' || direction === 'VRB' ? null : cardinalToDegrees(direction),
          cardinal: direction ?? 'Calm',
          airTempC: null,
          weatherCode: null,
        };
      })
      .filter((point): point is BomForecastWindPoint => point !== null && point.speed !== null);
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchBomThreeHourlyWindForecast(location: LocationOption): Promise<BomForecastWindPoint[] | null> {
  const stateCode =
    normalizeAustralianStateCode(location.region) ??
    inferAustralianStateFromCoordinates(location.latitude, location.longitude);
  if (!stateCode) {
    return null;
  }

  try {
    const bomLocation = await resolveBomForecastLocation(location, stateCode);
    if (!bomLocation?.geohash) {
        return null;
      }

    // BOM's current forecast endpoint uses the geohash with the final character removed.
    const modifiedGeohash = bomLocation.geohash.slice(0, -1);
    const response = await fetch(bomApiFetchUrl(`/v1/locations/${modifiedGeohash}/forecasts/hourly`));
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as BomThreeHourlyForecastPayload;
    const points = (payload.data ?? [])
      .map((item): BomForecastWindPoint | null => {
        if (!item.time || !item.wind) {
          return null;
        }

        const speed = firstDefinedNumber(
          parseMaybeNumber(item.wind.speed_knot === undefined ? undefined : String(item.wind.speed_knot)),
          parseMaybeNumber(item.wind.speed_kilometre === undefined ? undefined : String(item.wind.speed_kilometre)),
        );
        const direction = extractCardinal(item.wind.direction ?? '');
        const timestamp = new Date(item.time);
        if (speed === null || Number.isNaN(timestamp.getTime())) {
          return null;
        }
        if (!isBomDetailedForecastHour(timestamp)) {
          return null;
        }

        return {
          timestamp: timestamp.toISOString(),
          speed,
          directionDegrees:
            direction === null || direction === 'CALM' || direction === 'VRB'
              ? null
              : cardinalToDegrees(direction),
          cardinal: direction === null ? 'Calm' : direction === 'CALM' || direction === 'VRB' ? 'Calm' : direction,
          airTempC: parseMaybeNumber(item.temp === undefined ? undefined : String(item.temp)),
          weatherCode: mapBomIconDescriptorToWeatherCode(item.icon_descriptor),
        };
      })
      .filter((point): point is BomForecastWindPoint => point !== null);

    return points.length > 0 ? points : null;
  } catch {
    return null;
  }
}

function isBomDetailedForecastHour(timestamp: Date): boolean {
  const detailedForecastHours = new Set([1, 4, 7, 10, 13, 16, 19, 22]);
  return timestamp.getMinutes() === 0 && detailedForecastHours.has(timestamp.getHours());
}

function mapBomIconDescriptorToWeatherCode(descriptor: string | null | undefined): number | null {
  if (!descriptor) return null;
  const value = descriptor.trim().toLowerCase();
  if (!value) return null;
  if (value.includes('rain') || value.includes('shower') || value.includes('storm')) return 63;
  if (value.includes('cloud') || value.includes('overcast') || value.includes('fog')) return 3;
  if (value.includes('clear') || value.includes('sunny')) return 0;
  return null;
}

async function resolveBomForecastLocation(
  location: LocationOption,
  stateCode: string,
): Promise<{ geohash: string; name: string; state: string } | null> {
  const queries = buildBomForecastSearchQueries(location);

  for (const query of queries) {
    if (query.length < 3) {
      continue;
    }

    const response = await fetch(bomApiFetchUrl(`/v1/locations?search=${encodeURIComponent(query)}`));
    if (!response.ok) {
      continue;
    }

    const payload = (await response.json()) as BomLocationSearchPayload;
    const options = (payload.data ?? []).filter(
      (option) => option.geohash && normalizeAustralianStateCode(option.state) === stateCode,
    );
    if (options.length === 0) {
      continue;
    }

    const normalizedQuery = normalizeText(query).toLowerCase();
    const exact = options.find((option) => normalizeText(option.name ?? '').toLowerCase() === normalizedQuery);
    const prefix = options.find((option) => normalizeText(option.name ?? '').toLowerCase().startsWith(normalizedQuery));
    const contains = options.find((option) => normalizeText(option.name ?? '').toLowerCase().includes(normalizedQuery));
    const best = exact ?? prefix ?? contains ?? options[0];

    if (best?.geohash && best.name && best.state) {
      return {
        geohash: best.geohash,
        name: best.name,
        state: best.state,
      };
    }
  }

  return null;
}

function buildBomForecastSearchQueries(location: LocationOption): string[] {
  const baseName = location.name.split(',')[0]?.trim() || location.name;
  const withoutPlaceSuffix = baseName
    .replace(/\b(beach|front beach|cove|bay|harbour|harbor|point|foreshore|marina|jetty|wharf|island)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return Array.from(new Set([baseName, withoutPlaceSuffix].filter((value) => value.length > 0)));
}

function extractBomDetailedWindForecast(html: string): BomForecastWindPoint[] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const nodes = Array.from(document.body.querySelectorAll('h2, table'));
  const output: BomForecastWindPoint[] = [];
  let currentDayDate: Date | null = null;

  for (const node of nodes) {
    if (node.tagName === 'H2') {
      currentDayDate = parseBomDetailedDayDate(normalizeText(node.textContent ?? ''));
      continue;
    }

    if (!currentDayDate) {
      continue;
    }

    const table = node as HTMLTableElement;
    const tableText = normalizeText(table.textContent ?? '');
    if (!tableText.includes('Humidity & Wind') || !tableText.includes('Wind speed km/h')) {
      continue;
    }

    output.push(...parseBomDetailedWindForecastTable(table, currentDayDate));
  }

  return output.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function parseBomDetailedWindForecastTable(
  table: HTMLTableElement,
  dayDate: Date,
): BomForecastWindPoint[] {
  const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
  const headerRow = rows[0];
  if (!headerRow) {
    return [];
  }

  const timeLabels = Array.from(headerRow.querySelectorAll('th, td'))
    .map((cell) => normalizeText(cell.textContent ?? ''))
    .slice(1);
  if (timeLabels.length === 0) {
    return [];
  }

  const windSpeedRow = rows.find((row) => normalizeText(row.textContent ?? '').startsWith('Wind speed km/h'));
  const windDirectionRow = rows.find((row) => normalizeText(row.textContent ?? '').startsWith('Wind direction'));
  const temperatureRow = rows.find((row) => normalizeText(row.textContent ?? '').startsWith('Air temperature'));
  if (!windSpeedRow || !windDirectionRow) {
    return [];
  }

  const speedCells = Array.from(windSpeedRow.querySelectorAll('th, td')).slice(1);
  const directionCells = Array.from(windDirectionRow.querySelectorAll('th, td')).slice(1);
  const temperatureCells = temperatureRow ? Array.from(temperatureRow.querySelectorAll('th, td')).slice(1) : [];

  const points: BomForecastWindPoint[] = [];
  for (let index = 0; index < timeLabels.length; index += 1) {
    const timeLabel = timeLabels[index] ?? '';
    if (!timeLabel) {
      continue;
    }

    const speedCell = normalizeText(speedCells[index]?.textContent ?? '');
    const directionCell = normalizeText(directionCells[index]?.textContent ?? '');
    const temperatureCell = normalizeText(temperatureCells[index]?.textContent ?? '');
    const speedKts = extractObservedWindKts(speedCell);
    const direction = extractCardinal(directionCell);

    if (speedKts === null && !direction && !temperatureCell) {
      continue;
    }

    points.push({
      timestamp: setBomTimeOnDate(dayDate, timeLabel).toISOString(),
      speed: speedKts,
      directionDegrees:
        direction === null || direction === 'CALM' || direction === 'VRB'
          ? null
          : cardinalToDegrees(direction),
      cardinal: direction === null ? 'Calm' : direction === 'CALM' || direction === 'VRB' ? 'Calm' : direction,
      airTempC: parseMaybeNumber(temperatureCell),
      weatherCode: null,
    });
  }

  return points;
}

function parseBomDetailedDayDate(dayLabel: string): Date | null {
  const match = dayLabel.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+(\w+)/i);
  if (!match) {
    return null;
  }

  const [, , dayText, monthText] = match;
  const year = new Date().getFullYear();
  const parsed = new Date(`${monthText} ${Number(dayText)}, ${year} 00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function setBomTimeOnDate(dayDate: Date, timeLabel: string): Date {
  const timeMatch = timeLabel.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const next = new Date(dayDate);
  if (!timeMatch) {
    return next;
  }

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const meridiem = timeMatch[3].toUpperCase();

  if (meridiem === 'PM' && hour !== 12) {
    hour += 12;
  }
  if (meridiem === 'AM' && hour === 12) {
    hour = 0;
  }

  next.setHours(hour, minute, 0, 0);
  return next;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractCardinal(value: string): string | null {
  const match = value.match(/\b(CALM|VRB|NNE|NE|ENE|E|ESE|SE|SSE|S|SSW|SW|WSW|W|WNW|NW|NNW|N)\b/i);
  return match ? match[1].toUpperCase() : null;
}

function extractObservedWindKts(value: string): number | null {
  const numbers = value
    .split(' ')
    .map((token) => token.replace(/[^0-9.-]/g, ''))
    .filter((token) => token.length > 0)
    .map((token) => Number(token))
    .filter((token) => Number.isFinite(token));

  if (numbers.length >= 2) {
    return numbers[numbers.length - 1];
  }

  return numbers[0] ?? null;
}

function parseMaybeNumber(value: string | undefined): number | null {
  if (!value || value === '-' || value === 'NA') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundToTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function findNearestForecastWindPoint(timestamp: string, points: BomForecastWindPoint[]): BomForecastWindPoint | null {
  const target = new Date(timestamp).getTime();
  let nearest: BomForecastWindPoint | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const distance = Math.abs(new Date(point.timestamp).getTime() - target);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = point;
    }
  }

  return nearestDistance <= 90 * 60 * 1000 ? nearest : null;
}

function findLatestForecastWindPoint(timestamp: string, points: BomForecastWindPoint[]): BomForecastWindPoint | null {
  const target = new Date(timestamp).getTime();
  const sorted = [...points].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  let latest: BomForecastWindPoint | null = null;
  for (const point of sorted) {
    if (new Date(point.timestamp).getTime() <= target) {
      latest = point;
      continue;
    }
    break;
  }

  return latest ?? sorted[0] ?? null;
}

function findExactForecastWindPoint(timestamp: string, points: BomForecastWindPoint[]): BomForecastWindPoint | null {
  const target = new Date(timestamp).getTime();
  return (
    points.find((point) => {
      const pointTime = new Date(point.timestamp).getTime();
      return Math.abs(pointTime - target) <= 15 * 60 * 1000;
    }) ?? null
  );
}

function inferAustralianStateFromCoordinates(latitude: number, longitude: number): string | null {
  if (latitude < -43 || latitude > -9 || longitude < 112 || longitude > 154) {
    return null;
  }

  if (longitude < 129) return 'WA';
  if (longitude < 138) return latitude < -28 ? 'SA' : 'NT';
  if (longitude < 141) return latitude < -26 ? 'SA' : 'NT';
  if (longitude < 143) return latitude < -37 ? 'TAS' : 'VIC';
  if (longitude < 150) return latitude < -28 ? 'NSW' : 'QLD';
  return latitude < -26 ? 'NSW' : 'QLD';
}

function cardinalToDegrees(cardinal: string): number {
  const lookup: Record<string, number> = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5,
    CALM: 0,
    VRB: 0,
  };

  return lookup[cardinal.toUpperCase()] ?? 0;
}

function haversineDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(latitudeB - latitudeA);
  const lonDelta = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(lonDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function numberAt(values: Array<number | null> | undefined, index: number): number | null {
  if (!values || index < 0 || index >= values.length) {
    return null;
  }
  const value = values[index];
  return Number.isFinite(value) ? value : null;
}

function findNearestHourIndex(times: string[], target: Date): number {
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i += 1) {
    const distance = Math.abs(new Date(times[i]).getTime() - target.getTime());
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = i;
    }
  }
  return nearest;
}

function roundToCurrentHour(value: Date): Date {
  const rounded = new Date(value);
  rounded.setMinutes(0, 0, 0);
  return rounded;
}

function addHours(value: Date, hours: number): Date {
  const next = new Date(value);
  next.setHours(next.getHours() + hours);
  return next;
}

function deriveThunderstormRisk(weatherCode: number | null): 'none' | 'low' | 'moderate' | 'high' {
  if (weatherCode === null) {
    return 'none';
  }
  if ([95, 96, 99].includes(weatherCode)) {
    return 'high';
  }
  if ([80, 81, 82, 85, 86].includes(weatherCode)) {
    return 'low';
  }
  return 'none';
}

function describeWeatherCode(weatherCode: number | null): string {
  if (weatherCode === null) {
    return 'Weather data currently unavailable.';
  }

  if ([0, 1].includes(weatherCode)) {
    return 'Mostly clear conditions expected.';
  }
  if ([2, 3, 45, 48].includes(weatherCode)) {
    return 'Cloudy or reduced-visibility conditions possible.';
  }
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weatherCode)) {
    return 'Rain or showers are possible.';
  }
  if ([95, 96, 99].includes(weatherCode)) {
    return 'Thunderstorm conditions are possible.';
  }
  return 'Conditions may vary across the next few hours.';
}

function firstDefinedNumber(...values: Array<number | null>): number | null {
  for (const value of values) {
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
