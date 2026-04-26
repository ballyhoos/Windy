import type {
  LocationOption,
  MarineHourlyPoint,
  MarineConditionSet,
  ShoreRelation,
  WarningInfo,
} from '../types/conditions';
import { coastalStations, type CoastalStation } from '../data/coastalStations';

const MOCK_LOCATIONS: LocationOption[] = [
  { id: 'st-kilda', name: 'St Kilda Beach', latitude: -37.8676, longitude: 144.9747, region: 'VIC' },
  { id: 'torquay', name: 'Torquay Front Beach', latitude: -38.3306, longitude: 144.3251, region: 'VIC' },
  { id: 'manly', name: 'Manly Cove', latitude: -33.7995, longitude: 151.2869, region: 'NSW' },
  { id: 'scarborough', name: 'Scarborough Beach', latitude: -31.8952, longitude: 115.751, region: 'WA' },
];

const coastOrientationByLocation: Record<string, number> = {
  'st-kilda': 180,
  torquay: 170,
  manly: 90,
  scarborough: 270,
};

type BomObservedWind = {
  speedKmh: number | null;
  gustKmh: number | null;
  directionDegrees: number | null;
  cardinal: string;
  airTempC: number | null;
  sourceLabel: string;
};

type BomForecastWindPoint = {
  timestamp: string;
  speedKmh: number | null;
  directionDegrees: number | null;
  cardinal: string;
  airTempC: number | null;
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

type BomObservationJsonPayload = {
  observations?: {
    header?: Array<{
      refresh_message?: string;
      name?: string;
      state_time_zone?: string;
      time_zone?: string;
      product_name?: string;
      state?: string;
    }>;
    data?: Array<{
      name?: string;
      local_date_time_full?: string;
      local_date_time?: string | number | null;
      wind_spd_kt?: number | string | null;
      gust_kt?: number | string | null;
      wind_dir?: string | null;
      air_temp?: number | string | null;
      vis_km?: number | string | null;
    }>;
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

export async function searchLocations(query: string): Promise<LocationOption[]> {
  const trimmed = query.trim();

  if (!trimmed) {
    return MOCK_LOCATIONS;
  }

  try {
    const variants = buildQueryVariants(trimmed);
    const aggregate: LocationOption[] = [];

    for (const variant of variants) {
      const nominatimResults = dedupeLocationOptions(await fetchNominatimGeocode(variant));
      aggregate.push(...nominatimResults);
      if (aggregate.length >= 8) {
        break;
      }
    }

    const deduped = dedupeLocationOptions(aggregate);
    return dedupeLocationOptions(deduped).slice(0, 8);
  } catch {
    // Fallback keeps location search usable when geocoding is unavailable.
    const normalized = trimmed.toLowerCase();
    return MOCK_LOCATIONS.filter((location) =>
      `${location.name} ${location.region ?? ''}`.toLowerCase().includes(normalized),
    );
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
  if (options?.mockMode !== false) {
    return buildMockMarineConditions(location);
  }
  const resolvedLocation: LocationOption = {
    ...location,
    region: location.region ?? inferAustralianStateFromCoordinates(location.latitude, location.longitude) ?? undefined,
  };
  const [weatherPayload, marinePayload, bomObservedWind, bomForecastWind] = await Promise.all([
    fetchOpenMeteoWeather(resolvedLocation),
    fetchOpenMeteoMarine(resolvedLocation),
    fetchBomObservedWind(resolvedLocation),
    fetchBomDetailedWindForecast(resolvedLocation),
  ]);
  const bomForecastWeatherPayload =
    bomForecastWind !== null ? buildBomForecastWeatherPayload(bomForecastWind, bomObservedWind) : null;
  const hourlyTime = weatherPayload.hourly?.time ?? [];
  const nowIndex = findNearestHourIndex(hourlyTime, new Date());
  const lookaheadIndex = Math.min(nowIndex + 3, hourlyTime.length - 1);

  const forecastMatch = bomForecastWind
    ? findNearestForecastWindPoint(hourlyTime[nowIndex] ?? new Date().toISOString(), bomForecastWind)
    : null;
  const forecastSpeedKmh =
    forecastMatch?.speedKmh ?? numberAt(weatherPayload.hourly?.wind_speed_10m, nowIndex);
  const forecastGustKmh = numberAt(weatherPayload.hourly?.wind_gusts_10m, nowIndex);
  const forecastDirectionDegrees =
    forecastMatch?.directionDegrees ?? numberAt(weatherPayload.hourly?.wind_direction_10m, nowIndex);
  const airTempC = forecastMatch?.airTempC ?? numberAt(weatherPayload.hourly?.temperature_2m, nowIndex);
  const weatherCodeNow = numberAt(weatherPayload.hourly?.weather_code, nowIndex);
  const weatherCodeSoon = numberAt(weatherPayload.hourly?.weather_code, lookaheadIndex);

  const speedKmh = bomObservedWind?.speedKmh ?? forecastSpeedKmh;
  const gustKmh = bomObservedWind?.gustKmh ?? forecastGustKmh;
  const directionDegrees = bomObservedWind?.directionDegrees ?? forecastDirectionDegrees;
  const cardinal = bomObservedWind?.cardinal ?? degreesToCardinal(directionDegrees ?? 0);
  const shoreRelation = getShoreRelation(location.id, directionDegrees ?? 0);
  const thunderstormRisk = deriveThunderstormRisk(weatherCodeNow);
  const warnings: WarningInfo[] = [];

  const hourly = buildLiveHourlyPoints(
    weatherPayload,
    marinePayload,
    bomObservedWind,
    bomForecastWind,
    bomForecastWeatherPayload,
    nowIndex,
  );

  return {
    location,
    wind: {
      speedKmh,
      gustKmh,
      directionDegrees,
      cardinal,
      shoreRelation,
    },
    airTempC,
    waterTempC: null,
    swellHeightM: null,
    visibilityKm: null,
    warnings,
    forecast: {
      summary: 'BOM forecast conditions.',
      thunderstormRisk,
      weatherChangingSoon: weatherCodeNow !== weatherCodeSoon || Math.abs((gustKmh ?? 0) - (speedKmh ?? 0)) > 8,
    },
    roughWater: false,
    sourceLabel: bomObservedWind ? `BOM observations · ${bomObservedWind.sourceLabel}` : 'Open-Meteo weather',
    forecastSourceLabel: bomForecastWind
      ? `BOM place forecast · ${resolvedLocation.name}`
      : 'Open-Meteo forecast',
    hourly,
  };
}

type OpenMeteoWeatherPayload = {
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

async function fetchOpenMeteoWeather(location: LocationOption): Promise<OpenMeteoWeatherPayload> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(location.latitude));
  url.searchParams.set('longitude', String(location.longitude));
  url.searchParams.set('hourly', 'temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,weather_code');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '2');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Live weather request failed.');
  }

  return (await response.json()) as OpenMeteoWeatherPayload;
}

type OpenMeteoMarinePayload = {
  hourly?: {
    wave_height?: number[];
    swell_wave_height?: number[];
    sea_surface_temperature?: number[];
  };
};

async function fetchOpenMeteoMarine(location: LocationOption): Promise<OpenMeteoMarinePayload> {
  const url = new URL('https://marine-api.open-meteo.com/v1/marine');
  url.searchParams.set('latitude', String(location.latitude));
  url.searchParams.set('longitude', String(location.longitude));
  url.searchParams.set('hourly', 'wave_height,swell_wave_height,sea_surface_temperature');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('timezone', 'auto');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Live marine request failed.');
  }

  return (await response.json()) as OpenMeteoMarinePayload;
}

function buildMockMarineConditions(location: LocationOption): MarineConditionSet {
  const seed = Math.abs(
    Math.round(location.latitude * 100) +
      Math.round(location.longitude * 100) +
      new Date().getHours() * 13,
  );

  const windSpeedKmh = 8 + (seed % 16);
  const gustKmh = windSpeedKmh + 5 + (seed % 12);
  const directionDegrees = seed % 360;
  const shoreRelation = getShoreRelation(location.id, directionDegrees);
  const warningActive = seed % 13 === 0;
  const thunderstormRisk = warningActive
    ? 'moderate'
    : seed % 9 === 0
      ? 'low'
      : 'none';

  const now = new Date();
  const hourly = Array.from({ length: 48 }, (_, i) => {
    const slot = new Date(now);
    slot.setMinutes(0, 0, 0);
    slot.setHours(slot.getHours() + i + 1);
    const variation = Math.sin((slot.getHours() + seed) / 3);
    const speed = clamp(Math.round(windSpeedKmh + variation * 4 + i * 0.2), 0, 60);
    return {
      timestamp: slot.toISOString(),
      windSpeedKmh: speed,
      windGustKmh: clamp(speed + 5 + (i % 4), speed, 75),
      windDirectionDegrees: (directionDegrees + i * 7) % 360,
      airTempC: 16 + (seed % 13),
      waterTempC: 14 + (seed % 8),
      swellHeightM: Number((0.2 + ((seed % 15) / 10)).toFixed(1)),
      visibilityKm: 4 + (seed % 18),
      weatherCode: seed % 9 === 0 ? 80 : 1,
    } satisfies MarineHourlyPoint;
  });

  return {
    location,
    wind: {
      speedKmh: windSpeedKmh,
      gustKmh,
      directionDegrees,
      cardinal: degreesToCardinal(directionDegrees),
      shoreRelation,
    },
    airTempC: 16 + (seed % 13),
    waterTempC: 14 + (seed % 8),
    swellHeightM: Number((0.2 + ((seed % 15) / 10)).toFixed(1)),
    visibilityKm: 4 + (seed % 18),
    warnings: warningActive
      ? [{ title: 'Marine wind warning', severity: 'warning', active: true }]
      : [],
    forecast: {
      summary:
        thunderstormRisk === 'none'
          ? 'Mostly steady conditions through the next few hours.'
          : 'Conditions may shift later today with unstable weather nearby.',
      thunderstormRisk,
      weatherChangingSoon: seed % 5 === 0,
    },
    roughWater: seed % 7 === 0,
    sourceLabel: 'Mock marine conditions',
    forecastSourceLabel: 'Mock marine forecast',
    hourly,
  };
}

function getShoreRelation(locationId: string, windDirectionDegrees: number): ShoreRelation {
  const coastOrientation = coastOrientationByLocation[locationId];
  if (coastOrientation === undefined) {
    return 'variable';
  }

  const delta = smallestAngleDifference(windDirectionDegrees, coastOrientation);
  if (delta <= 35) {
    return 'onshore';
  }
  if (delta >= 145) {
    return 'offshore';
  }
  return 'cross-shore';
}

function smallestAngleDifference(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function degreesToCardinal(degrees: number): string {
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return cardinals[Math.round(degrees / 45) % 8];
}

function buildLiveHourlyPoints(
  weatherPayload: OpenMeteoWeatherPayload,
  marinePayload: OpenMeteoMarinePayload,
  bomObservedWind: BomObservedWind | null,
  bomForecastWind: BomForecastWindPoint[] | null,
  bomForecastWeatherPayload: OpenMeteoWeatherPayload | null,
  currentIndex: number,
): MarineHourlyPoint[] {
  const sourceWeatherPayload = bomForecastWeatherPayload ?? weatherPayload;
  const times = sourceWeatherPayload.hourly?.time ?? [];
  const points = times.map((timestamp, index) => {
    const waveHeight = firstDefinedNumber(
      numberAt(marinePayload.hourly?.wave_height, index),
      numberAt(marinePayload.hourly?.swell_wave_height, index),
    );

    return {
      timestamp,
      windSpeedKmh: numberAt(sourceWeatherPayload.hourly?.wind_speed_10m, index),
      windGustKmh: numberAt(sourceWeatherPayload.hourly?.wind_gusts_10m, index),
      windDirectionDegrees: numberAt(sourceWeatherPayload.hourly?.wind_direction_10m, index),
      isWindForecastPoint: bomForecastWeatherPayload
        ? Boolean(sourceWeatherPayload.hourly?.is_wind_forecast_point?.[index])
        : true,
      airTempC: numberAt(sourceWeatherPayload.hourly?.temperature_2m, index),
      waterTempC: numberAt(marinePayload.hourly?.sea_surface_temperature, index),
      swellHeightM: waveHeight,
      visibilityKm:
        numberAt(sourceWeatherPayload.hourly?.visibility, index) === null
          ? null
          : Number(((numberAt(sourceWeatherPayload.hourly?.visibility, index) ?? 0) / 1000).toFixed(1)),
      weatherCode: numberAt(sourceWeatherPayload.hourly?.weather_code, index),
    };
  });

  if (!bomForecastWind || bomForecastWind.length === 0) {
    return points.map((point, index) => {
      if (index !== currentIndex || !bomObservedWind) {
        return point;
      }

      return {
        ...point,
        windSpeedKmh: bomObservedWind.speedKmh ?? point.windSpeedKmh,
        windGustKmh: bomObservedWind.gustKmh ?? point.windGustKmh,
        windDirectionDegrees: bomObservedWind.directionDegrees ?? point.windDirectionDegrees,
      };
    });
  }

  if (bomForecastWeatherPayload) {
    return points;
  }

  return points.map((point, index) => {
    const forecastMatch = findNearestForecastWindPoint(point.timestamp, bomForecastWind);
    const observedOverride = index === currentIndex ? bomObservedWind : null;
    const speedKmh = observedOverride?.speedKmh ?? forecastMatch?.speedKmh ?? point.windSpeedKmh;
    return {
      ...point,
      windSpeedKmh: speedKmh,
      windDirectionDegrees:
        observedOverride?.directionDegrees ?? forecastMatch?.directionDegrees ?? point.windDirectionDegrees,
      airTempC: forecastMatch?.airTempC ?? point.airTempC,
      windGustKmh:
        observedOverride?.gustKmh ??
        (speedKmh === null
          ? point.windGustKmh
          : Math.max(speedKmh, Math.round(speedKmh * 1.4))),
    };
  });
}

function buildBomForecastWeatherPayload(
  points: BomForecastWindPoint[],
  observed: BomObservedWind | null,
): OpenMeteoWeatherPayload {
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
    const speedKmh = match?.speedKmh ?? observed?.speedKmh ?? null;
    hourlyTimes.push(slot.toISOString());
    temperature2m.push(match?.airTempC ?? observed?.airTempC ?? null);
    windSpeed10m.push(match ? speedKmh : null);
    windGusts10m.push(match ? (speedKmh === null ? null : Math.max(speedKmh, Math.round(speedKmh * 1.35))) : null);
    windDirection10m.push(match?.directionDegrees ?? null);
    isWindForecastPoint.push(Boolean(match && speedKmh !== null));
    visibility.push(null);
    weatherCode.push(null);
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
    const coastalStation = resolveStaticCoastalStation(location);
    if (coastalStation) {
      const observedFromCoastalStation = await fetchBomObservedWindFromJsonUrl(coastalStation.observationUrl);
      if (observedFromCoastalStation) {
        return {
          ...observedFromCoastalStation,
          sourceLabel: coastalStation.stationName,
        };
      }
    }

    return await fetchBomApiObservedWind(location);
  } catch {
    return null;
  }
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

  const speedKmh = firstDefinedNumber(
    parseMaybeNumber(observation.wind.speed_kilometre === undefined ? undefined : String(observation.wind.speed_kilometre)),
    parseMaybeNumber(observation.wind.speed_knot === undefined ? undefined : String(observation.wind.speed_knot)) === null
      ? null
      : roundToTenths((parseMaybeNumber(String(observation.wind.speed_knot)) ?? 0) * 1.852),
  );
  const gustKmh = firstDefinedNumber(
    parseMaybeNumber(observation.gust?.speed_kilometre === undefined ? undefined : String(observation.gust.speed_kilometre)),
    parseMaybeNumber(observation.gust?.speed_knot === undefined ? undefined : String(observation.gust.speed_knot)) === null
      ? null
      : roundToTenths((parseMaybeNumber(String(observation.gust?.speed_knot)) ?? 0) * 1.852),
  );
  const direction = extractCardinal(observation.wind.direction ?? '');

  if (speedKmh === null && direction === null) {
    return null;
  }

  return {
    speedKmh,
    gustKmh,
    directionDegrees:
      direction === null || direction === 'CALM' || direction === 'VRB'
        ? null
        : cardinalToDegrees(direction),
    cardinal: direction === null || direction === 'CALM' || direction === 'VRB' ? 'Calm' : direction,
    airTempC: parseMaybeNumber(observation.temp === undefined ? undefined : String(observation.temp)),
    sourceLabel: observation.station?.name?.trim() || 'BOM location observation',
  };
}

function resolveStaticCoastalStation(location: LocationOption): CoastalStation | null {
  const stateCode =
    normalizeAustralianStateCode(location.region) ??
    inferAustralianStateFromCoordinates(location.latitude, location.longitude);
  const candidates = coastalStations.filter((station) => !stateCode || station.state === stateCode);
  if (candidates.length === 0) {
    return null;
  }

  const locationTokens = buildLocationMatchTokens(location);
  const aliasMatch = candidates.find((station) =>
    station.aliases.some((alias) => locationTokens.has(normalizeStationAlias(alias))),
  );
  if (aliasMatch) {
    return aliasMatch;
  }

  const nearest = candidates
    .map((station) => ({
      station,
      distance: haversineDistanceKm(location.latitude, location.longitude, station.latitude, station.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  return nearest && nearest.distance <= 30 ? nearest.station : null;
}

function buildLocationMatchTokens(location: LocationOption): Set<string> {
  const baseName = location.name.split(',')[0] ?? location.name;
  return new Set(
    [location.name, baseName, `${baseName} ${location.region ?? ''}`]
      .map(normalizeStationAlias)
      .filter((value) => value.length > 0),
  );
}

function normalizeStationAlias(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\b(vic|victoria|nsw|qld|queensland|wa|western australia|sa|south australia|tas|tasmania|nt|northern territory)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchBomObservedWindFromJsonUrl(stationPageUrl: string): Promise<BomObservedWind | null> {
  const jsonUrl = stationPageUrl.replace(/\/products\//, '/fwo/').replace(/\.shtml$/i, '.json');
  try {
    const response = await fetch(bomFetchUrl(jsonUrl));
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as BomObservationJsonPayload;
    return parseBomObservationJson(payload);
  } catch {
    return null;
  }
}

function parseBomObservationJson(payload: BomObservationJsonPayload): BomObservedWind | null {
  const first = getLatestBomObservationRow(payload.observations?.data ?? []);
  if (!first) {
    return null;
  }

  const speedKts = parseMaybeNumber(String(first.wind_spd_kt ?? ''));
  const gustKts = parseMaybeNumber(String(first.gust_kt ?? ''));
  const direction = extractCardinal(String(first.wind_dir ?? ''));
  const airTempC = parseMaybeNumber(String(first.air_temp ?? ''));

  return {
    speedKmh: speedKts === null ? null : roundToTenths(speedKts * 1.852),
    gustKmh: gustKts === null ? null : roundToTenths(gustKts * 1.852),
    directionDegrees:
      direction === null || direction === 'CALM' || direction === 'VRB'
        ? null
        : cardinalToDegrees(direction),
    cardinal:
      direction === null ? 'Calm' : direction === 'CALM' || direction === 'VRB' ? 'Calm' : direction,
    airTempC,
    sourceLabel: first.name?.trim() || payload.observations?.header?.[0]?.name?.trim() || 'BOM station',
  };
}

function getLatestBomObservationRow(
  rows: NonNullable<BomObservationJsonPayload['observations']>['data'],
): NonNullable<NonNullable<BomObservationJsonPayload['observations']>['data']>[number] | null {
  if (!rows || rows.length === 0) {
    return null;
  }

  const ranked = rows
    .map((row, index) => ({
      row,
      index,
      timestamp: parseBomObservationTimestamp(row),
    }))
    .sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      return a.index - b.index;
    });

  return ranked[0]?.row ?? null;
}

function parseBomObservationTimestamp(
  row: NonNullable<NonNullable<BomObservationJsonPayload['observations']>['data']>[number],
): number {
  const full = String(row.local_date_time_full ?? '').trim();
  if (full) {
    const parsed = Number(full.replace(/\D/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const local = String(row.local_date_time ?? '').trim();
  if (local) {
    const parsed = Number(local.replace(/\D/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
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
  const apiPoints = await fetchBomThreeHourlyWindForecast(location);
  if (apiPoints && apiPoints.length > 0) {
    return apiPoints;
  }

  const stateCode =
    normalizeAustralianStateCode(location.region) ??
    inferAustralianStateFromCoordinates(location.latitude, location.longitude);
  if (!stateCode) {
    return null;
  }

  const slugCandidates = buildBomPlaceSlugCandidates(location);
  for (const slug of slugCandidates) {
    const pageUrl = buildBomPlaceForecastDetailedUrl(stateCode, slug);
    try {
      const response = await fetch(bomFetchUrl(pageUrl));
      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const points = extractBomDetailedWindForecast(html);
      if (points.length > 0) {
        return points;
      }
    } catch {
      // Try the next slug candidate.
    }
  }

  return null;
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

        const speedKmh = firstDefinedNumber(
          parseMaybeNumber(item.wind.speed_kilometre === undefined ? undefined : String(item.wind.speed_kilometre)),
          parseMaybeNumber(item.wind.speed_knot === undefined ? undefined : String(item.wind.speed_knot)) === null
            ? null
            : roundToTenths((parseMaybeNumber(String(item.wind.speed_knot)) ?? 0) * 1.852),
        );
        const direction = extractCardinal(item.wind.direction ?? '');
        const timestamp = new Date(item.time);
        if (speedKmh === null || Number.isNaN(timestamp.getTime())) {
          return null;
        }
        if (!isBomDetailedForecastHour(timestamp)) {
          return null;
        }

        return {
          timestamp: timestamp.toISOString(),
          speedKmh,
          directionDegrees:
            direction === null || direction === 'CALM' || direction === 'VRB'
              ? null
              : cardinalToDegrees(direction),
          cardinal: direction === null ? 'Calm' : direction === 'CALM' || direction === 'VRB' ? 'Calm' : direction,
          airTempC: parseMaybeNumber(item.temp === undefined ? undefined : String(item.temp)),
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
      speedKmh: speedKts === null ? null : roundToTenths(speedKts * 1.852),
      directionDegrees:
        direction === null || direction === 'CALM' || direction === 'VRB'
          ? null
          : cardinalToDegrees(direction),
      cardinal: direction === null ? 'Calm' : direction === 'CALM' || direction === 'VRB' ? 'Calm' : direction,
      airTempC: parseMaybeNumber(temperatureCell),
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
