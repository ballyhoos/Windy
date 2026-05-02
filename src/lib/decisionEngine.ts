import type {
  DecisionReason,
  DecisionResult,
  PaddleConditions,
} from '../types/conditions';

type Thresholds = {
  strongWind: number;
  cautionWind: number;
  strongGust: number;
  cautionGust: number;
  highSwellM: number;
  cautionSwellM: number;
  poorVisibilityKm: number;
  cautionVisibilityKm: number;
  coldAirC: number;
  coldWaterC: number;
};

const thresholds: Thresholds = {
  strongWind: 12,
  cautionWind: 8,
  strongGust: 15,
  cautionGust: 11,
  highSwellM: 0.8,
  cautionSwellM: 0.45,
  poorVisibilityKm: 5,
  cautionVisibilityKm: 8,
  coldAirC: 16,
  coldWaterC: 18,
};

export function evaluatePaddleConditions(
  conditions: PaddleConditions,
): DecisionResult {
  const redReasons: DecisionReason[] = [];
  const amberReasons: DecisionReason[] = [];
  const triggeredFlags: string[] = [];
  const { marine, sun } = conditions;

  if (marine.warnings.some((warning) => warning.active)) {
    pushReason(redReasons, triggeredFlags, 'red', 'Active marine or weather warning', 'warning');
  }

  if (marine.forecast.thunderstormRisk === 'moderate' || marine.forecast.thunderstormRisk === 'high') {
    pushReason(redReasons, triggeredFlags, 'red', 'Thunderstorm or lightning risk', 'storm');
  } else if (marine.forecast.thunderstormRisk === 'low') {
    pushReason(amberReasons, triggeredFlags, 'amber', 'Unsettled weather nearby', 'weather-shift');
  }

  if ((marine.wind.speed ?? 0) >= thresholds.strongWind) {
    pushReason(redReasons, triggeredFlags, 'red', 'Strong wind', 'wind');
  } else if ((marine.wind.speed ?? 0) >= thresholds.cautionWind) {
    pushReason(amberReasons, triggeredFlags, 'amber', 'Marginal wind', 'wind-caution');
  }

  if ((marine.wind.gust ?? 0) >= thresholds.strongGust) {
    pushReason(redReasons, triggeredFlags, 'red', 'Strong gusts', 'gusts');
  } else if ((marine.wind.gust ?? 0) >= thresholds.cautionGust) {
    pushReason(amberReasons, triggeredFlags, 'amber', 'Gusty conditions', 'gusts-caution');
  }

  if (marine.wind.shoreRelation === 'offshore') {
    if ((marine.wind.speed ?? 0) >= thresholds.cautionWind) {
      pushReason(redReasons, triggeredFlags, 'red', 'Offshore wind risk', 'offshore-wind');
    } else {
      pushReason(amberReasons, triggeredFlags, 'amber', 'Offshore wind', 'offshore-wind');
    }
  } else if (marine.wind.shoreRelation === 'cross-shore') {
    pushReason(amberReasons, triggeredFlags, 'amber', 'Cross-shore wind', 'cross-shore-wind');
  }

  if (marine.roughWater || (marine.swellHeightM ?? 0) >= thresholds.highSwellM) {
    pushReason(redReasons, triggeredFlags, 'red', 'High swell or rough water', 'swell');
  } else if ((marine.swellHeightM ?? 0) >= thresholds.cautionSwellM) {
    pushReason(amberReasons, triggeredFlags, 'amber', 'Moderate chop or swell', 'swell-caution');
  }

  if ((marine.visibilityKm ?? Number.POSITIVE_INFINITY) <= thresholds.poorVisibilityKm) {
    pushReason(redReasons, triggeredFlags, 'red', 'Poor visibility', 'visibility');
  } else if ((marine.visibilityKm ?? Number.POSITIVE_INFINITY) <= thresholds.cautionVisibilityKm) {
    pushReason(amberReasons, triggeredFlags, 'amber', 'Visibility is reduced', 'visibility-caution');
  }

  if (
    sun.daylightRemainingMinutes !== null &&
    sun.daylightRemainingMinutes <= sun.safeReturnBufferMinutes
  ) {
    pushReason(redReasons, triggeredFlags, 'red', 'Not enough daylight to return safely', 'daylight');
  }

  if ((marine.airTempC ?? 99) <= thresholds.coldAirC || (marine.waterTempC ?? 99) <= thresholds.coldWaterC) {
    pushReason(amberReasons, triggeredFlags, 'amber', 'Cold air or water temperature', 'temperature');
  }

  if (marine.forecast.weatherChangingSoon) {
    pushReason(amberReasons, triggeredFlags, 'amber', 'Weather may change soon', 'forecast-shift');
  }

  if (redReasons.length > 0) {
    return {
      status: 'red',
      title: "Don't go",
      sentence: 'Conditions look unsafe for paddle boarding right now.',
      reasons: redReasons.slice(0, 3),
      recommendation:
        'Wait for safer conditions, check local warnings, and choose a more sheltered session later.',
      triggeredFlags,
    };
  }

  if (amberReasons.length > 0) {
    return {
      status: 'amber',
      title: 'Be careful',
      sentence: 'Conditions are marginal, so extra caution and a shorter plan make sense.',
      reasons: amberReasons.slice(0, 3),
      recommendation:
        'Stay close to shore, wear your leash and PFD, and make a conservative return-time plan.',
      triggeredFlags,
    };
  }

  return {
    status: 'green',
    title: "Let's go!",
    sentence: 'Conditions look suitable for paddle boarding.',
    reasons: [
      { label: 'Light wind', severity: 'green' },
      { label: 'Calm water', severity: 'green' },
      { label: 'Enough daylight', severity: 'green' },
    ],
    recommendation:
      'Take your leash, PFD, phone, and tell someone where you are going before you launch.',
    triggeredFlags,
  };
}

function pushReason(
  bucket: DecisionReason[],
  triggeredFlags: string[],
  severity: DecisionReason['severity'],
  label: string,
  flag: string,
): void {
  if (!bucket.some((reason) => reason.label === label)) {
    bucket.push({ label, severity });
  }

  if (!triggeredFlags.includes(flag)) {
    triggeredFlags.push(flag);
  }
}
