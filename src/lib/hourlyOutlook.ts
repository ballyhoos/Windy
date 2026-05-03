import { evaluateConditions } from './decisionEngine';
import type { DecisionStatus, PaddleConditions, SportType } from '../types/conditions';

export interface HourlyOutlookItem {
  timestamp: string;
  status: DecisionStatus;
  windSpeed: number | null;
  windDirectionDegrees: number;
  isInterpolatedWind: boolean;
  isForecastAnchor: boolean;
  tideLevel: number | null;
  isDaylight: boolean;
  sunriseTimestamp: string | null;
  sunsetTimestamp: string | null;
}

type HourlySourcePoint = {
  timestamp: string;
  time: Date;
  windSpeed: number | null;
  windGust: number | null;
  windDirectionDegrees: number | null;
  isWindForecastPoint?: boolean;
  airTempC: number | null;
  feelsLikeTempC: number | null;
  waterTempC: number | null;
  swellHeightM: number | null;
  visibilityKm: number | null;
  weatherCode: number | null;
  isInterpolatedWind?: boolean;
};

export function buildHourlyOutlook(conditions: PaddleConditions, sport: SportType): HourlyOutlookItem[] {
  const sunriseTemplate = conditions.sun.sunrise ? new Date(conditions.sun.sunrise) : null;
  const sunsetTemplate = conditions.sun.sunset ? new Date(conditions.sun.sunset) : null;
  const hasSunTemplates =
    isValidDate(sunriseTemplate) && isValidDate(sunsetTemplate);

  const now = new Date();
  const start = roundToCurrentHour(now);
  const output: HourlyOutlookItem[] = [];
  const liveHourly = (conditions.marine.hourly ?? [])
    .map((point) => ({ ...point, time: new Date(point.timestamp) }))
    .filter((point) => !Number.isNaN(point.time.getTime()));
  const currentDecision = evaluateConditions(conditions, sport);
  const forecastSource = conditions.marine.forecastSourceLabel.startsWith('BOM forecast (worker)');
  const hasForecastAnchors = liveHourly.some((point) => point.isWindForecastPoint === true && point.windSpeed !== null);
  const slots = Array.from({ length: 36 }, (_, index) => addHours(start, index));

  for (const slot of slots) {
    const daylightWindow = hasSunTemplates
      ? getDaylightWindowForDate(slot, sunriseTemplate as Date, sunsetTemplate as Date)
      : null;
    const isDaylight = daylightWindow
      ? slot >= daylightWindow.sunrise && slot <= daylightWindow.sunset
      : false;
    const isCurrentSlot = slot.getTime() === start.getTime();

    const livePoint =
      forecastSource && hasForecastAnchors
        ? findExactLivePoint(liveHourly, slot)
        : forecastSource
          ? null
          : findNearestLivePoint(liveHourly, slot);
    const isForecastAnchor = Boolean(
      forecastSource &&
      hasForecastAnchors &&
      livePoint &&
      livePoint.isWindForecastPoint === true &&
      !livePoint.isInterpolatedWind,
    );
    const projected = isCurrentSlot
      ? conditions
      : livePoint
        ? applyLivePointToConditions(
            conditions,
            livePoint,
            slot,
            daylightWindow?.sunrise ?? null,
            daylightWindow?.sunset ?? null,
          )
        : projectConditionsForHour(
            conditions,
            slot,
            daylightWindow?.sunrise ?? null,
            daylightWindow?.sunset ?? null,
          );
    const decision = isCurrentSlot ? currentDecision : evaluateConditions(projected, sport);
    output.push({
      timestamp: slot.toISOString(),
      status: decision.status,
      windSpeed: forecastSource && !hasForecastAnchors
        ? isCurrentSlot
          ? conditions.marine.wind.speed ?? null
          : null
        : forecastSource
        ? isCurrentSlot
          ? conditions.marine.wind.speed ?? livePoint?.windSpeed ?? null
          : livePoint?.windSpeed ?? null
        : isCurrentSlot
          ? conditions.marine.wind.speed ?? livePoint?.windSpeed ?? projected.marine.wind.speed ?? null
          : livePoint?.windSpeed ?? projected.marine.wind.speed ?? null,
      windDirectionDegrees: normalizeDegrees(
        forecastSource
          ? isCurrentSlot
            ? conditions.marine.wind.directionDegrees ?? livePoint?.windDirectionDegrees ?? projected.marine.wind.directionDegrees ?? 0
            : livePoint?.windDirectionDegrees ?? projected.marine.wind.directionDegrees ?? 0
          : isCurrentSlot
            ? conditions.marine.wind.directionDegrees ?? livePoint?.windDirectionDegrees ?? projected.marine.wind.directionDegrees ?? 0
          : livePoint?.windDirectionDegrees ?? projected.marine.wind.directionDegrees ?? 0,
      ),
      isInterpolatedWind: Boolean(forecastSource && !isForecastAnchor && livePoint),
      isForecastAnchor,
      tideLevel: getTideLevelForTime(slot, conditions),
      isDaylight,
      sunriseTimestamp: daylightWindow?.sunrise.toISOString() ?? null,
      sunsetTimestamp: daylightWindow?.sunset.toISOString() ?? null,
    });
  }

  return output;
}

function isValidDate(value: Date | null): value is Date {
  return !!value && !Number.isNaN(value.getTime());
}

function getTideLevelForTime(slot: Date, conditions: PaddleConditions): number | null {
  const events = (conditions.tide.events ?? [])
    .map((event) => ({
      time: toValidDate(event.datetime),
      level: event.type === 'high' ? 1 : -1,
    }))
    .filter((event): event is { time: Date; level: 1 | -1 } => event.time !== null)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  if (events.length < 2) {
    return null;
  }

  const slotMs = slot.getTime();
  for (let i = 0; i < events.length - 1; i += 1) {
    const current = events[i];
    const next = events[i + 1];
    const startMs = current.time.getTime();
    const endMs = next.time.getTime();
    if (slotMs < startMs || slotMs > endMs || endMs <= startMs) continue;
    const progress = (slotMs - startMs) / (endMs - startMs);
    const eased = 0.5 - 0.5 * Math.cos(Math.PI * progress);
    return clamp(current.level + (next.level - current.level) * eased, -1, 1);
  }

  return null;
}

function toValidDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function findNearestLivePoint(
  points: HourlySourcePoint[],
  slot: Date,
) {
  let nearest: (typeof points)[number] | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const distance = Math.abs(point.time.getTime() - slot.getTime());
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = point;
    }
  }
  // keep match strict to one hour proximity
  return nearestDistance <= 60 * 60 * 1000 ? nearest : null;
}

function findExactLivePoint(
  points: HourlySourcePoint[],
  slot: Date,
) {
  return (
    points.find(
      (point) =>
        point.isWindForecastPoint === true &&
        Math.abs(point.time.getTime() - slot.getTime()) <= 15 * 60 * 1000,
    ) ?? null
  );
}

// Forecast graph path intentionally uses exact source points only (no interpolation).

function interpolateNullableNumber(
  start: number | null,
  end: number | null,
  progress: number,
): number | null {
  if (start === null || end === null) {
    return null;
  }

  return start + (end - start) * progress;
}

function interpolateDirection(
  start: number | null,
  end: number | null,
  progress: number,
): number | null {
  if (start === null || end === null) {
    return start ?? end;
  }

  const delta = ((end - start + 540) % 360) - 180;
  return normalizeDegrees(start + delta * progress);
}

function applyLivePointToConditions(
  base: PaddleConditions,
  point: {
    windSpeed: number | null;
    windGust: number | null;
    windDirectionDegrees: number | null;
    airTempC: number | null;
    feelsLikeTempC: number | null;
    waterTempC: number | null;
    swellHeightM: number | null;
    visibilityKm: number | null;
    weatherCode: number | null;
  },
  slot: Date,
  sunrise: Date | null,
  sunset: Date | null,
): PaddleConditions {
  const daylightRemainingMinutes = calculateDaylightRemainingMinutes(base, slot, sunrise, sunset);
  const thunderstormRisk = deriveThunderstormRisk(point.weatherCode);

  return {
    ...base,
    marine: {
      ...base.marine,
      wind: {
        ...base.marine.wind,
        speed: point.windSpeed,
        gust: point.windGust,
        directionDegrees: point.windDirectionDegrees,
      },
      airTempC: point.airTempC,
      feelsLikeTempC: point.feelsLikeTempC,
      waterTempC: point.waterTempC,
      swellHeightM: point.swellHeightM,
      visibilityKm: point.visibilityKm,
      roughWater: (point.swellHeightM ?? 0) >= 1.1,
      forecast: {
        ...base.marine.forecast,
        thunderstormRisk,
        weatherChangingSoon: false,
      },
      warnings:
        thunderstormRisk === 'high'
          ? [{ title: 'Thunderstorm conditions nearby', severity: 'warning', active: true }]
          : [],
    },
    sun: {
      ...base.sun,
      daylightRemainingMinutes,
    },
  };
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

function projectConditionsForHour(
  base: PaddleConditions,
  slot: Date,
  sunrise: Date | null,
  sunset: Date | null,
): PaddleConditions {
  const now = new Date();
  const hoursFromNow = Math.max(0, (slot.getTime() - now.getTime()) / 3600000);
  const baseWind = base.marine.wind.speed ?? 0;
  const baseGust = base.marine.wind.gust ?? baseWind + 5;

  const cycle = Math.sin((slot.getHours() - 12) / 3);
  const drift = hoursFromNow * 0.8;
  const projectedWind = clamp(Math.round(baseWind + cycle * 3 + drift), 0, 60);
  const projectedGust = clamp(Math.round(baseGust + cycle * 4 + drift * 1.5), projectedWind, 75);
  const daylightRemainingMinutes = calculateDaylightRemainingMinutes(base, slot, sunrise, sunset);

  return {
    ...base,
    marine: {
      ...base.marine,
      wind: {
        ...base.marine.wind,
        speed: projectedWind,
        gust: projectedGust,
      },
      forecast: {
        ...base.marine.forecast,
        weatherChangingSoon: hoursFromNow >= 3,
      },
    },
    sun: {
      ...base.sun,
      daylightRemainingMinutes,
    },
  };
}

function calculateDaylightRemainingMinutes(
  base: PaddleConditions,
  slot: Date,
  sunrise: Date | null,
  sunset: Date | null,
): number | null {
  if (sunrise && sunset) {
    if (slot < sunrise || slot > sunset) {
      return 0;
    }
    return Math.max(0, Math.round((sunset.getTime() - slot.getTime()) / 60000));
  }

  if (sunset) {
    return Math.max(0, Math.round((sunset.getTime() - slot.getTime()) / 60000));
  }

  return base.sun.daylightRemainingMinutes;
}


function roundToCurrentHour(value: Date): Date {
  const rounded = new Date(value);
  rounded.setMinutes(0, 0, 0);
  return rounded;
}

function getDaylightWindowForDate(
  slot: Date,
  sunriseTemplate: Date,
  sunsetTemplate: Date,
): { sunrise: Date; sunset: Date } {
  const sunrise = new Date(slot);
  sunrise.setHours(sunriseTemplate.getHours(), sunriseTemplate.getMinutes(), 0, 0);

  const sunset = new Date(slot);
  sunset.setHours(sunsetTemplate.getHours(), sunsetTemplate.getMinutes(), 0, 0);

  return { sunrise, sunset };
}

function addHours(value: Date, hours: number): Date {
  const next = new Date(value);
  next.setHours(next.getHours() + hours);
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized >= 0 ? normalized : normalized + 360;
}
