import type { LocationOption, SunCondition } from '../types/conditions';

export async function fetchSunData(
  location: LocationOption,
  options?: { mockMode?: boolean },
): Promise<SunCondition> {
  if (options?.mockMode === false) {
    return fetchOpenMeteoSun(location);
  }

  return buildMockSun(location);
}

async function fetchOpenMeteoSun(location: LocationOption): Promise<SunCondition> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(location.latitude));
  url.searchParams.set('longitude', String(location.longitude));
  url.searchParams.set('daily', 'sunrise,sunset');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '2');

  const response = await fetch(url.toString());
  if (!response.ok) {
    return buildMockSun(location);
  }

  const payload = (await response.json()) as {
    daily?: {
      sunrise?: string[];
      sunset?: string[];
    };
  };

  const sunrise = payload.daily?.sunrise?.[0] ?? null;
  const sunset = payload.daily?.sunset?.[0] ?? null;
  const now = new Date();
  const daylightRemainingMinutes =
    sunset === null
      ? null
      : Math.max(0, Math.round((new Date(sunset).getTime() - now.getTime()) / 60000));

  return {
    sunrise,
    sunset,
    daylightRemainingMinutes,
    safeReturnBufferMinutes: 90,
    sourceLabel: 'Open-Meteo sunrise/sunset',
  };
}

function buildMockSun(location: LocationOption): SunCondition {
  const now = new Date();
  const daylightHours = estimateDaylightHours(location.latitude, now);
  const sunriseHour = 12 - daylightHours / 2;
  const sunsetHour = 12 + daylightHours / 2;

  const sunrise = new Date(now);
  sunrise.setHours(Math.floor(sunriseHour), Math.round((sunriseHour % 1) * 60), 0, 0);
  const sunset = new Date(now);
  sunset.setHours(Math.floor(sunsetHour), Math.round((sunsetHour % 1) * 60), 0, 0);
  const daylightRemainingMinutes = Math.max(
    0,
    Math.round((sunset.getTime() - now.getTime()) / 60000),
  );

  return {
    sunrise: sunrise.toISOString(),
    sunset: sunset.toISOString(),
    daylightRemainingMinutes,
    safeReturnBufferMinutes: 90,
    sourceLabel: 'Mock sun data',
  };
}

function estimateDaylightHours(latitude: number, date: Date): number {
  const dayOfYear = getDayOfYear(date);
  const seasonalPhase = Math.cos(((dayOfYear - 172) / 365) * Math.PI * 2);
  const latitudeFactor = 1 - Math.min(Math.abs(latitude) / 90, 1) * 0.35;
  const daylightHours = 12 + seasonalPhase * 3.2 * latitudeFactor;
  return clamp(daylightHours, 9.1, 14.9);
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
