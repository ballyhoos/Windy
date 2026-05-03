export type DecisionStatus = 'green' | 'amber' | 'red';
export type SportType = 'paddle' | 'kayak' | 'surf' | 'kite';
export type ShoreRelation = 'onshore' | 'offshore' | 'cross-shore' | 'variable';
export type TideState = 'incoming' | 'outgoing' | 'slack' | 'unknown';
export type WarningSeverity = 'watch' | 'warning' | 'severe';

export interface LocationOption {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  region?: string;
  stationQuery?: string;
  isPoi?: boolean;
}

export interface WarningInfo {
  title: string;
  severity: WarningSeverity;
  active: boolean;
}

export interface ForecastWindow {
  summary: string;
  thunderstormRisk: 'none' | 'low' | 'moderate' | 'high';
  weatherChangingSoon: boolean;
}

export interface WindCondition {
  speed: number | null;
  gust: number | null;
  directionDegrees: number | null;
  cardinal: string;
  shoreRelation: ShoreRelation;
}

export interface MarineHourlyPoint {
  timestamp: string;
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
  iconDescriptor?: string | null;
  isNight?: boolean | null;
}

export interface MarineConditionSet {
  location: LocationOption;
  wind: WindCondition;
  airTempC: number | null;
  feelsLikeTempC: number | null;
  waterTempC: number | null;
  swellHeightM: number | null;
  visibilityKm: number | null;
  warnings: WarningInfo[];
  forecast: ForecastWindow;
  roughWater: boolean;
  sourceLabel: string;
  forecastSourceLabel: string;
  hourly: MarineHourlyPoint[];
}

export interface TideCondition {
  nextHigh: string | null;
  nextLow: string | null;
  events?: TideEvent[];
  state: TideState;
  currentRisk: 'low' | 'moderate' | 'high';
  note: string;
  sourceLabel: string;
}

export interface TideEvent {
  datetime: string;
  type: 'high' | 'low';
  heightM: number | null;
}

export interface SunCondition {
  sunrise: string | null;
  sunset: string | null;
  moonPhase: 'new' | 'crescent' | 'quarter' | 'gibbous' | 'full' | 'unknown';
  daylightRemainingMinutes: number | null;
  safeReturnBufferMinutes: number;
  sourceLabel: string;
}

export interface PaddleConditions {
  marine: MarineConditionSet;
  tide: TideCondition;
  sun: SunCondition;
  updatedAt: string;
  isMock: boolean;
}

export interface DecisionReason {
  label: string;
  severity: DecisionStatus;
  category?: 'safety' | 'quality' | 'viability' | 'uncertainty';
  priorityWeight?: number;
}

export interface DecisionResult {
  sport?: SportType;
  safety: DecisionStatus;
  quality: 'poor' | 'ok' | 'good';
  viability: 'not-enough' | 'usable' | 'too-much';
  displayStatus: DecisionStatus;
  status: DecisionStatus;
  title: string;
  sentence: string;
  primaryReason?: DecisionReason;
  secondaryReasons: DecisionReason[];
  explanationLine: string;
  reasons: DecisionReason[];
  recommendation: string;
  triggeredFlags: string[];
}

export interface UnitConfig {
  windSpeed: 'kn';
  temperature: 'C';
  distance: 'm';
}

export const DEFAULT_UNITS: UnitConfig = {
  windSpeed: 'kn',
  temperature: 'C',
  distance: 'm',
};
