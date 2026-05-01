import type { LocationOption, SunCondition } from '../types/conditions';

export async function fetchSunData(
  location: LocationOption,
  options?: { mockMode?: boolean },
): Promise<SunCondition> {
  if (options?.mockMode) {
    return buildEstimatedSun(location, 'Estimated sunrise/sunset');
  }

  const params = new URLSearchParams({
    lat: String(location.latitude),
    lng: String(location.longitude),
    formatted: '0',
    date: 'today',
  });
  const endpoint = `https://api.sunrise-sunset.org/json?${params.toString()}`;

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Sunrise-Sunset API failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      status?: string;
      results?: { sunrise?: string; sunset?: string };
    };
    const sunrise = payload?.results?.sunrise ? new Date(payload.results.sunrise) : null;
    const sunset = payload?.results?.sunset ? new Date(payload.results.sunset) : null;

    if (!isValidDate(sunrise) || !isValidDate(sunset)) {
      throw new Error('Sunrise-Sunset API returned invalid time values');
    }

    const now = new Date();
    const daylightRemainingMinutes = Math.max(
      0,
      Math.round((sunset.getTime() - now.getTime()) / 60000),
    );

    return {
      sunrise: sunrise.toISOString(),
      sunset: sunset.toISOString(),
      moonPhase: deriveMoonPhase(new Date()),
      daylightRemainingMinutes,
      safeReturnBufferMinutes: 90,
      sourceLabel: 'Sunrise-Sunset API',
    };
  } catch {
    return buildEstimatedSun(location, 'Estimated sunrise/sunset');
  }
}

function buildEstimatedSun(location: LocationOption, sourceLabel: string): SunCondition {
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
    moonPhase: 'unknown',
    daylightRemainingMinutes,
    safeReturnBufferMinutes: 90,
    sourceLabel,
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

function isValidDate(value: Date | null): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function deriveMoonPhase(date: Date): SunCondition['moonPhase'] {
  const synodicMonth = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const daysSince = (date.getTime() - knownNewMoon) / 86400000;
  const cycle = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;
  const ratio = cycle / synodicMonth;

  if (ratio < 0.03 || ratio >= 0.97) return 'new';
  if (ratio < 0.22 || ratio >= 0.78) return 'crescent';
  if (ratio < 0.28 || ratio >= 0.72) return 'quarter';
  if (ratio < 0.47 || ratio >= 0.53) return 'gibbous';
  return 'full';
}
