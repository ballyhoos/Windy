import { evaluatePaddleConditions } from './decisionEngine';
import type { DecisionStatus, PaddleConditions } from '../types/conditions';

export interface HourlyOutlookItem {
  timestamp: string;
  status: DecisionStatus;
  windKmh: number | null;
  windDirectionDegrees: number;
  isInterpolatedWind: boolean;
  tideLevel: number;
  isDaylight: boolean;
  sunriseTimestamp: string | null;
  sunsetTimestamp: string | null;
}

type HourlySourcePoint = {
  timestamp: string;
  time: Date;
  windSpeedKmh: number | null;
  windGustKmh: number | null;
  windDirectionDegrees: number | null;
  isWindForecastPoint?: boolean;
  airTempC: number | null;
  waterTempC: number | null;
  swellHeightM: number | null;
  visibilityKm: number | null;
  weatherCode: number | null;
  isInterpolatedWind?: boolean;
};

export function buildHourlyOutlook(conditions: PaddleConditions): HourlyOutlookItem[] {
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
  const currentDecision = evaluatePaddleConditions(conditions);
  const forecastSource = conditions.marine.forecastSourceLabel.startsWith('BOM place forecast');
  const slots = Array.from({ length: 36 }, (_, index) => addHours(start, index));

  for (const slot of slots) {
    const daylightWindow = hasSunTemplates
      ? getDaylightWindowForDate(slot, sunriseTemplate as Date, sunsetTemplate as Date)
      : null;
    const isDaylight = daylightWindow
      ? slot >= daylightWindow.sunrise && slot <= daylightWindow.sunset
      : false;
    const isCurrentSlot = slot.getTime() === start.getTime();

    const livePoint = forecastSource ? findOrInterpolateLivePoint(liveHourly, slot) : findNearestLivePoint(liveHourly, slot);
    const projected = isCurrentSlot
      ? conditions
      : livePoint
        ? applyLivePointToConditions(conditions, livePoint, slot, daylightWindow?.sunset ?? null)
        : projectConditionsForHour(conditions, slot, daylightWindow?.sunset ?? null);
    const decision = isCurrentSlot ? currentDecision : evaluatePaddleConditions(projected);
    output.push({
      timestamp: slot.toISOString(),
      status: decision.status,
      windKmh: forecastSource
        ? isCurrentSlot
          ? conditions.marine.wind.speedKmh ?? livePoint?.windSpeedKmh ?? null
          : livePoint?.windSpeedKmh ?? null
        : isCurrentSlot
          ? conditions.marine.wind.speedKmh ?? livePoint?.windSpeedKmh ?? projected.marine.wind.speedKmh ?? null
          : livePoint?.windSpeedKmh ?? projected.marine.wind.speedKmh ?? null,
      windDirectionDegrees: normalizeDegrees(
        forecastSource
          ? isCurrentSlot
            ? conditions.marine.wind.directionDegrees ?? livePoint?.windDirectionDegrees ?? projected.marine.wind.directionDegrees ?? 0
            : livePoint?.windDirectionDegrees ?? projected.marine.wind.directionDegrees ?? 0
          : isCurrentSlot
            ? conditions.marine.wind.directionDegrees ?? livePoint?.windDirectionDegrees ?? projected.marine.wind.directionDegrees ?? 0
          : livePoint?.windDirectionDegrees ?? projected.marine.wind.directionDegrees ?? 0,
      ),
      isInterpolatedWind: Boolean(livePoint?.isInterpolatedWind),
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

function getTideLevelForTime(slot: Date, conditions: PaddleConditions): number {
  const tidalPeriodMs = 12.4 * 60 * 60 * 1000;
  const twoPi = Math.PI * 2;
  const nextHigh = toValidDate(conditions.tide.nextHigh);
  const nextLow = toValidDate(conditions.tide.nextLow);

  if (nextHigh) {
    const phase = ((slot.getTime() - nextHigh.getTime()) / tidalPeriodMs) * twoPi;
    return clamp(Math.cos(phase), -1, 1);
  }

  if (nextLow) {
    const phase = ((slot.getTime() - nextLow.getTime()) / tidalPeriodMs) * twoPi;
    return clamp(-Math.cos(phase), -1, 1);
  }

  const statePhaseOffset =
    conditions.tide.state === 'incoming'
      ? -Math.PI / 2
      : conditions.tide.state === 'outgoing'
        ? Math.PI / 2
        : 0;
  const phase = ((slot.getTime() - Date.now()) / tidalPeriodMs) * twoPi + statePhaseOffset;
  return clamp(Math.sin(phase), -1, 1);
}

function toValidDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

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

function findOrInterpolateLivePoint(points: HourlySourcePoint[], slot: Date): HourlySourcePoint | null {
  const exact = findExactLivePoint(points, slot);
  if (exact) {
    return exact;
  }

  const anchors = points
    .filter((point) => point.isWindForecastPoint === true && point.windSpeedKmh !== null)
    .sort((a, b) => a.time.getTime() - b.time.getTime());
  const slotTime = slot.getTime();
  const before = [...anchors].reverse().find((point) => point.time.getTime() < slotTime) ?? null;
  const after = anchors.find((point) => point.time.getTime() > slotTime) ?? null;

  if (!before || !after) {
    return null;
  }

  const totalMs = after.time.getTime() - before.time.getTime();
  if (totalMs <= 0 || totalMs > 4 * 60 * 60 * 1000) {
    return null;
  }

  const progress = (slotTime - before.time.getTime()) / totalMs;
  const windSpeedKmh = interpolateNullableNumber(before.windSpeedKmh, after.windSpeedKmh, progress);
  if (windSpeedKmh === null) {
    return null;
  }

  return {
    ...before,
    timestamp: slot.toISOString(),
    time: slot,
    windSpeedKmh,
    windGustKmh: interpolateNullableNumber(before.windGustKmh, after.windGustKmh, progress),
    windDirectionDegrees: interpolateDirection(before.windDirectionDegrees, after.windDirectionDegrees, progress),
    airTempC: interpolateNullableNumber(before.airTempC, after.airTempC, progress),
    waterTempC: interpolateNullableNumber(before.waterTempC, after.waterTempC, progress),
    swellHeightM: interpolateNullableNumber(before.swellHeightM, after.swellHeightM, progress),
    visibilityKm: interpolateNullableNumber(before.visibilityKm, after.visibilityKm, progress),
    weatherCode: before.weatherCode,
    isInterpolatedWind: true,
  };
}

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
    windSpeedKmh: number | null;
    windGustKmh: number | null;
    windDirectionDegrees: number | null;
    airTempC: number | null;
    waterTempC: number | null;
    swellHeightM: number | null;
    visibilityKm: number | null;
    weatherCode: number | null;
  },
  slot: Date,
  sunset: Date | null,
): PaddleConditions {
  const daylightRemainingMinutes = calculateDaylightRemainingMinutes(base, slot, sunset);
  const thunderstormRisk = deriveThunderstormRisk(point.weatherCode);

  return {
    ...base,
    marine: {
      ...base.marine,
      wind: {
        ...base.marine.wind,
        speedKmh: point.windSpeedKmh,
        gustKmh: point.windGustKmh,
        directionDegrees: point.windDirectionDegrees,
      },
      airTempC: point.airTempC,
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
  sunset: Date | null,
): PaddleConditions {
  const now = new Date();
  const hoursFromNow = Math.max(0, (slot.getTime() - now.getTime()) / 3600000);
  const baseWind = base.marine.wind.speedKmh ?? 0;
  const baseGust = base.marine.wind.gustKmh ?? baseWind + 5;

  const cycle = Math.sin((slot.getHours() - 12) / 3);
  const drift = hoursFromNow * 0.8;
  const projectedWind = clamp(Math.round(baseWind + cycle * 3 + drift), 0, 60);
  const projectedGust = clamp(Math.round(baseGust + cycle * 4 + drift * 1.5), projectedWind, 75);
  const daylightRemainingMinutes = calculateDaylightRemainingMinutes(base, slot, sunset);

  return {
    ...base,
    marine: {
      ...base.marine,
      wind: {
        ...base.marine.wind,
        speedKmh: projectedWind,
        gustKmh: projectedGust,
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
  sunset: Date | null,
): number | null {
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
