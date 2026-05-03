import type { DecisionReason, DecisionResult, PaddleConditions, SportType } from '../types/conditions';

type SportProfile = {
  id: SportType;
  label: string;
  wind: {
    amberKn?: number;
    redKn?: number;
    minimumKn?: number;
    tooLowKn?: number;
  };
  gust: {
    amberRatio: number;
    redRatio: number;
    amberSpreadKn: number;
    redSpreadKn: number;
    amberKn: number;
    redKn: number;
  };
  swell: {
    amberM?: number;
    redM?: number;
    requiredMinM?: number;
    poorBelowM?: number;
  };
  offshore: {
    safetyRisk: boolean;
    amberKn?: number;
    redKn?: number;
    qualityBonus?: boolean;
  };
  shore: {
    offshore?: {
      safetyAmberKn?: number;
      safetyRedKn?: number;
      safetyAlwaysRed?: boolean;
      qualityBonus?: boolean;
      qualityBonusMaxKn?: number;
    };
    onshore?: {
      qualityPenaltyKn?: number;
      safetyRedKn?: number;
    };
    crossShore?: {
      safetyAmberKn?: number;
      qualityPenaltyKn?: number;
      qualityBonusKn?: number;
    };
    variable?: {
      safetyAmber?: boolean;
    };
  };
  daylight: {
    redMinutes: number;
  };
};

const SPORT_PROFILES: Record<SportType, SportProfile> = {
  paddle: {
    id: 'paddle',
    label: 'Paddle',
    wind: { amberKn: 12, redKn: 16 },
    gust: { amberRatio: 1.2, redRatio: 1.3, amberSpreadKn: 5, redSpreadKn: 8, amberKn: 16, redKn: 22 },
    swell: { amberM: 0.45, redM: 0.8 },
    offshore: { safetyRisk: true, amberKn: 8, redKn: 12 },
    shore: {
      offshore: { safetyAmberKn: 8, safetyRedKn: 12 },
      crossShore: { safetyAmberKn: 14 },
      variable: { safetyAmber: true },
    },
    daylight: { redMinutes: 90 },
  },
  kayak: {
    id: 'kayak',
    label: 'Kayak',
    wind: { amberKn: 15, redKn: 20 },
    gust: { amberRatio: 1.25, redRatio: 1.4, amberSpreadKn: 6, redSpreadKn: 10, amberKn: 20, redKn: 28 },
    swell: { amberM: 0.6, redM: 1.0 },
    offshore: { safetyRisk: true, amberKn: 12, redKn: 16 },
    shore: {
      offshore: { safetyAmberKn: 12, safetyRedKn: 16 },
      crossShore: { safetyAmberKn: 18 },
      variable: { safetyAmber: true },
    },
    daylight: { redMinutes: 90 },
  },
  surf: {
    id: 'surf',
    label: 'Surf',
    wind: { amberKn: 20, redKn: 28 },
    gust: { amberRatio: 1.3, redRatio: 1.5, amberSpreadKn: 8, redSpreadKn: 12, amberKn: 28, redKn: 38 },
    swell: { poorBelowM: 0.8, redM: 2.5 },
    offshore: { safetyRisk: false, qualityBonus: true },
    shore: {
      offshore: { qualityBonus: true, qualityBonusMaxKn: 28, safetyRedKn: 28 },
      onshore: { qualityPenaltyKn: 12 },
      crossShore: { qualityPenaltyKn: 14 },
      variable: { safetyAmber: false },
    },
    daylight: { redMinutes: 60 },
  },
  kite: {
    id: 'kite',
    label: 'Kite',
    wind: { tooLowKn: 12, minimumKn: 15, amberKn: 40, redKn: 50 },
    gust: { amberRatio: 1.35, redRatio: 1.6, amberSpreadKn: 8, redSpreadKn: 12, amberKn: 32, redKn: 42 },
    swell: { redM: 2.2 },
    offshore: { safetyRisk: true, redKn: 1 },
    shore: {
      offshore: { safetyAlwaysRed: true },
      crossShore: { qualityBonusKn: 12 },
      variable: { safetyAmber: true },
    },
    daylight: { redMinutes: 75 },
  },
};

export const SPORT_OPTIONS: Array<{ id: SportType; label: string }> = [
  { id: 'kayak', label: 'Kayaking' },
  { id: 'kite', label: 'Kiteboarding' },
  { id: 'paddle', label: 'Paddle Boarding' },
  { id: 'surf', label: 'Surfing' },
];

export function evaluateConditions(conditions: PaddleConditions, sport: SportType): DecisionResult {
  const profile = SPORT_PROFILES[sport];
  const redReasons: DecisionReason[] = [];
  const amberReasons: DecisionReason[] = [];
  const flags: string[] = [];
  const windKn = Math.max(0, conditions.marine.wind.speed ?? 0);
  const gustKn = Math.max(0, conditions.marine.wind.gust ?? 0);
  const gustRatio = windKn > 0 ? gustKn / windKn : 1;
  const gustSpreadKn = Math.max(0, gustKn - windKn);
  const swell = Math.max(0, conditions.marine.swellHeightM ?? 0);
  const visibility = conditions.marine.visibilityKm ?? Number.POSITIVE_INFINITY;
  let safety: DecisionResult['safety'] = 'green';
  let quality: DecisionResult['quality'] = 'good';
  let viability: DecisionResult['viability'] = 'usable';

  if (conditions.marine.warnings.some((warning) => warning.active)) {
    push(redReasons, flags, 'red', 'Active weather warning', 'warning');
  }
  if (['moderate', 'high'].includes(conditions.marine.forecast.thunderstormRisk)) {
    push(redReasons, flags, 'red', 'Storm/lightning risk', 'storm');
  }
  if (visibility <= 5) {
    push(redReasons, flags, 'red', 'Poor visibility', 'visibility');
  } else if (visibility <= 8) {
    push(amberReasons, flags, 'amber', 'Reduced visibility', 'visibility-caution');
  }

  if ((profile.wind.redKn ?? Number.POSITIVE_INFINITY) <= windKn) {
    push(redReasons, flags, 'red', 'Strong wind', 'wind-red');
  } else if ((profile.wind.amberKn ?? Number.POSITIVE_INFINITY) <= windKn) {
    push(amberReasons, flags, 'amber', 'Marginal wind', 'wind-amber');
  }

  if (
    gustKn >= profile.gust.redKn ||
    (windKn >= (profile.wind.amberKn ?? 0) && gustRatio >= profile.gust.redRatio && gustSpreadKn >= profile.gust.redSpreadKn)
  ) {
    push(redReasons, flags, 'red', 'Strong gusts', 'gust-red');
  } else if (
    gustKn >= profile.gust.amberKn ||
    (windKn >= (profile.wind.amberKn ?? 0) && gustRatio >= profile.gust.amberRatio && gustSpreadKn >= profile.gust.amberSpreadKn)
  ) {
    push(amberReasons, flags, 'amber', 'Gusty conditions', 'gust-amber');
  }

  if (conditions.marine.roughWater || (profile.swell.redM !== undefined && swell >= profile.swell.redM)) {
    push(redReasons, flags, 'red', 'Rough water', 'swell-red');
  } else if (profile.swell.amberM !== undefined && swell >= profile.swell.amberM) {
    push(amberReasons, flags, 'amber', 'Moderate chop or swell', 'swell-amber');
  }

  const shore = profile.shore;
  const relation = conditions.marine.wind.shoreRelation;
  if (relation === 'variable') {
    push(amberReasons, flags, 'amber', 'Wind direction uncertain', 'shore-uncertain');
    if (shore.variable?.safetyAmber) {
      push(amberReasons, flags, 'amber', 'Variable wind direction', 'shore-variable-amber');
    }
  } else if (relation === 'offshore') {
    if (shore.offshore?.safetyAlwaysRed) {
      push(redReasons, flags, 'red', 'Offshore wind risk', 'offshore-red');
    } else {
      if ((shore.offshore?.safetyRedKn ?? Number.POSITIVE_INFINITY) <= windKn) {
        push(redReasons, flags, 'red', 'Strong offshore wind', 'offshore-red');
      } else if ((shore.offshore?.safetyAmberKn ?? Number.POSITIVE_INFINITY) <= windKn) {
        push(amberReasons, flags, 'amber', 'Offshore wind', 'offshore-amber');
      }
      if (
        shore.offshore?.qualityBonus &&
        windKn <= (shore.offshore.qualityBonusMaxKn ?? Number.POSITIVE_INFINITY)
      ) {
        quality = improveQuality(quality);
        push(
          amberReasons,
          flags,
          'amber',
          'Offshore wind helps',
          'offshore-quality-bonus',
        );
      }
    }
  } else if (relation === 'cross-shore') {
    if ((shore.crossShore?.safetyAmberKn ?? Number.POSITIVE_INFINITY) <= windKn) {
      push(amberReasons, flags, 'amber', 'Cross-shore wind risk', 'cross-shore-amber');
    }
    if ((shore.crossShore?.qualityPenaltyKn ?? Number.POSITIVE_INFINITY) <= windKn) {
      quality = quality === 'good' ? 'ok' : quality;
      const crossShoreQualityLabel = sport === 'surf' ? 'Cross-shore affects wave quality' : 'Cross-shore affects quality';
      push(
        amberReasons,
        flags,
        'amber',
        crossShoreQualityLabel,
        'cross-shore-quality',
      );
    }
    if ((shore.crossShore?.qualityBonusKn ?? Number.NEGATIVE_INFINITY) <= windKn) {
      quality = improveQuality(quality);
      push(amberReasons, flags, 'amber', 'Cross-shore preferred', 'cross-shore-quality-bonus');
    }
  } else if (relation === 'onshore') {
    if ((shore.onshore?.safetyRedKn ?? Number.POSITIVE_INFINITY) <= windKn) {
      push(redReasons, flags, 'red', 'Strong onshore wind', 'onshore-red');
    }
    if ((shore.onshore?.qualityPenaltyKn ?? Number.POSITIVE_INFINITY) <= windKn) {
      quality = quality === 'good' ? 'ok' : quality;
      push(
        amberReasons,
        flags,
        'amber',
        'Onshore affects quality',
        'onshore-quality',
      );
    }
  }

  if (
    conditions.sun.daylightRemainingMinutes !== null &&
    conditions.sun.daylightRemainingMinutes <= profile.daylight.redMinutes
  ) {
    push(redReasons, flags, 'red', 'Not enough daylight left', 'daylight');
  }

  if (conditions.marine.forecast.weatherChangingSoon) {
    push(amberReasons, flags, 'amber', 'Weather may shift soon', 'forecast-shift');
  }

  if (sport === 'surf') {
    if (profile.swell.poorBelowM !== undefined && swell < profile.swell.poorBelowM) {
      quality = 'poor';
      push(amberReasons, flags, 'amber', 'Low swell', 'surf-swell-low');
    }
  }

  if (sport === 'kite') {
    if ((profile.wind.tooLowKn ?? -1) > windKn) {
      viability = 'not-enough';
      quality = 'poor';
      push(amberReasons, flags, 'amber', 'Not enough wind', 'kite-low');
    } else if ((profile.wind.minimumKn ?? -1) > windKn) {
      viability = 'not-enough';
      quality = 'poor';
      push(amberReasons, flags, 'amber', 'Wind a bit light', 'kite-min');
    }
    if ((profile.wind.redKn ?? Number.POSITIVE_INFINITY) <= windKn) viability = 'too-much';
  } else {
    if ((profile.wind.redKn ?? Number.POSITIVE_INFINITY) <= windKn) viability = 'too-much';
  }

  if (redReasons.length > 0) safety = 'red';
  else if (amberReasons.length > 0) safety = 'amber';

  const displayStatus = deriveDisplayStatus(safety, quality, viability);
  const reasonPool = selectReasonsForDisplay(redReasons, amberReasons, safety, quality, viability);
  const directionReason = buildShoreDirectionReason(conditions);
  const reasonsWithDirection = directionReason ? [...reasonPool, directionReason] : reasonPool;
  const { primaryReason, secondaryReasons, explanationLine } = buildReasonHierarchy(
    reasonsWithDirection,
    safety,
    quality,
    viability,
  );

  return {
    sport,
    safety,
    quality,
    viability,
    displayStatus,
    status: displayStatus,
    title: displayStatus === 'green' ? "Let's go!" : displayStatus === 'amber' ? 'Be careful' : 'Maybe not',
    sentence:
      displayStatus === 'green'
        ? `Conditions look suitable for ${sportLabel(sport)}.`
        : displayStatus === 'amber'
        ? `Marginal for ${sportLabel(sport)}.`
        : `Unsafe for ${sportLabel(sport)} now.`,
    primaryReason,
    secondaryReasons,
    explanationLine,
    reasons: primaryReason
      ? [primaryReason, ...secondaryReasons]
      : [
          { label: 'Conditions in ideal range', severity: 'green', category: 'quality', priorityWeight: 10 },
          { label: 'Manageable wind profile', severity: 'green', category: 'quality', priorityWeight: 9 },
          { label: 'Enough daylight', severity: 'green', category: 'safety', priorityWeight: 8 },
        ],
    recommendation:
      displayStatus === 'green'
        ? 'Keep a conservative plan and monitor for changes.'
        : displayStatus === 'amber'
        ? 'Use extra caution, stay conservative, and be ready to return early.'
        : 'Delay your session and wait for safer conditions.',
    triggeredFlags: flags,
  };
}

function buildShoreDirectionReason(conditions: PaddleConditions): DecisionReason | null {
  const relation = conditions.marine.wind.shoreRelation;
  if (relation === 'variable') {
    return { label: 'Variable wind', severity: 'amber', category: 'uncertainty', priorityWeight: 48 };
  }
  if (relation === 'offshore') {
    return { label: 'Offshore wind', severity: 'green', category: 'quality', priorityWeight: 8 };
  }
  if (relation === 'onshore') {
    return { label: 'Onshore wind', severity: 'green', category: 'quality', priorityWeight: 8 };
  }
  if (relation === 'cross-shore') {
    return { label: 'Cross-shore wind', severity: 'green', category: 'quality', priorityWeight: 8 };
  }
  return null;
}

function selectReasonsForDisplay(
  redReasons: DecisionReason[],
  amberReasons: DecisionReason[],
  safety: DecisionResult['safety'],
  quality: DecisionResult['quality'],
  viability: DecisionResult['viability'],
): DecisionReason[] {
  const positiveLabels = new Set(['Offshore wind helps', 'Cross-shore preferred']);
  const combined = [...redReasons, ...amberReasons];

  if (safety === 'red') {
    return combined.filter((reason) => !positiveLabels.has(reason.label)).slice(0, 3);
  }

  if (safety === 'amber' || viability !== 'usable' || quality === 'poor') {
    return combined.filter((reason) => !positiveLabels.has(reason.label)).slice(0, 3);
  }

  return combined.slice(0, 3);
}

function deriveDisplayStatus(
  safety: DecisionResult['safety'],
  quality: DecisionResult['quality'],
  viability: DecisionResult['viability'],
): DecisionResult['displayStatus'] {
  if (safety === 'red') return 'red';
  if (safety === 'amber') return 'amber';
  if (viability === 'not-enough' || viability === 'too-much') return 'amber';
  if (quality === 'poor') return 'amber';
  return 'green';
}

function improveQuality(current: DecisionResult['quality']): DecisionResult['quality'] {
  if (current === 'poor') return 'ok';
  return 'good';
}

function sportLabel(sport: SportType): string {
  if (sport === 'kite') return 'kiteboarding/windsurfing';
  if (sport === 'surf') return 'surfing';
  if (sport === 'kayak') return 'kayaking';
  return 'paddle boarding';
}

function push(
  bucket: DecisionReason[],
  flags: string[],
  severity: DecisionReason['severity'],
  label: string,
  flag: string,
): void {
  if (!bucket.some((reason) => reason.label === label)) {
    bucket.push({
      label,
      severity,
      category: inferReasonCategory(flag),
      priorityWeight: inferReasonPriority(flag, severity),
    });
  }
  if (!flags.includes(flag)) flags.push(flag);
}

function inferReasonCategory(flag: string): DecisionReason['category'] {
  if (flag.startsWith('kite-')) return 'viability';
  if (flag.includes('quality')) return 'quality';
  if (flag.includes('uncertain') || flag.includes('variable')) return 'uncertainty';
  return 'safety';
}

function inferReasonPriority(flag: string, severity: DecisionReason['severity']): number {
  if (flag === 'daylight') return 100;
  if (flag === 'warning' || flag === 'storm') return 98;
  if (flag === 'offshore-red' || flag === 'wind-red' || flag === 'gust-red' || flag === 'swell-red') return 95;
  if (flag === 'visibility') return 92;
  if (severity === 'red') return 90;
  if (flag.startsWith('kite-')) return 70;
  if (flag.includes('uncertain') || flag.includes('variable')) return 62;
  if (flag.includes('quality')) return 40;
  if (severity === 'amber') return 60;
  return 10;
}

function buildReasonHierarchy(
  reasons: DecisionReason[],
  safety: DecisionResult['safety'],
  quality: DecisionResult['quality'],
  viability: DecisionResult['viability'],
): { primaryReason?: DecisionReason; secondaryReasons: DecisionReason[]; explanationLine: string } {
  const deduped = reasons.filter((reason, index, all) => all.findIndex((item) => item.label === reason.label) === index);
  const sorted = [...deduped].sort((a, b) => (b.priorityWeight ?? 0) - (a.priorityWeight ?? 0));
  const primaryReason = sorted[0];
  const secondaryReasons = sorted.slice(1, 3);
  const composed = primaryReason ? [primaryReason, ...secondaryReasons] : [];

  if (composed.length === 0) {
    const fallback =
      safety === 'green' && quality === 'good' && viability === 'usable'
        ? ['Conditions look suitable', 'Manageable wind', 'Enough daylight']
        : ['Conditions need caution'];
    return { primaryReason: undefined, secondaryReasons: [], explanationLine: fallback.join(' • ') };
  }

  return {
    primaryReason,
    secondaryReasons,
    explanationLine: composed.map((reason) => reason.label).join(' • '),
  };
}
