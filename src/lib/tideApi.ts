import type { LocationOption, TideCondition, TideState } from '../types/conditions';

type BomTideStation = {
  id: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  timezone: string;
  aliases: string[];
};

type TideEvent = {
  type: 'high' | 'low';
  time: string;
  heightM: number | null;
};

const BOM_TIDE_BASE_URL = 'https://www.bom.gov.au/australia/tides/index.shtml';

// Keep this list deliberately small and high-confidence. Unknown locations use the nearest
// station in the same broad area, then fall back safely if no nearby station is available.
const BOM_TIDE_STATIONS: BomTideStation[] = [
  {
    id: 'vic-st-kilda',
    name: 'St Kilda',
    state: 'VIC',
    latitude: -37.865,
    longitude: 144.967,
    timezone: 'Australia/Melbourne',
    aliases: ['st kilda', 'st kilda beach'],
  },
  {
    id: 'vic-point-lonsdale',
    name: 'Point Lonsdale',
    state: 'VIC',
    latitude: -38.291,
    longitude: 144.614,
    timezone: 'Australia/Melbourne',
    aliases: ['torquay', 'torquay front beach', 'point lonsdale', 'bells beach', 'jan juc'],
  },
  {
    id: 'vic-queenscliff',
    name: 'Queenscliff',
    state: 'VIC',
    latitude: -38.267,
    longitude: 144.661,
    timezone: 'Australia/Melbourne',
    aliases: ['queenscliff', 'swan bay'],
  },
  {
    id: 'vic-melbourne-williamstown',
    name: 'Melbourne (Williamstown)',
    state: 'VIC',
    latitude: -37.864,
    longitude: 144.905,
    timezone: 'Australia/Melbourne',
    aliases: ['melbourne', 'williamstown', 'port melbourne', 'brighton', 'sandringham'],
  },
  {
    id: 'nsw-sydney-fort-denison',
    name: 'Sydney (Fort Denison)',
    state: 'NSW',
    latitude: -33.855,
    longitude: 151.225,
    timezone: 'Australia/Sydney',
    aliases: ['sydney', 'fort denison', 'manly', 'manly cove', 'balmoral', 'rose bay'],
  },
  {
    id: 'nsw-port-hacking',
    name: 'Port Hacking',
    state: 'NSW',
    latitude: -34.067,
    longitude: 151.15,
    timezone: 'Australia/Sydney',
    aliases: ['port hacking', 'cronulla', 'bundeena'],
  },
  {
    id: 'wa-fremantle',
    name: 'Fremantle',
    state: 'WA',
    latitude: -32.052,
    longitude: 115.745,
    timezone: 'Australia/Perth',
    aliases: ['fremantle', 'scarborough', 'scarborough beach', 'cottesloe', 'perth'],
  },
  {
    id: 'wa-hillarys',
    name: 'Hillarys Boat Harbour',
    state: 'WA',
    latitude: -31.823,
    longitude: 115.739,
    timezone: 'Australia/Perth',
    aliases: ['hillarys', 'sorrento', 'trigg'],
  },
  {
    id: 'qld-brisbane-bar',
    name: 'Brisbane Bar',
    state: 'QLD',
    latitude: -27.34,
    longitude: 153.18,
    timezone: 'Australia/Brisbane',
    aliases: ['brisbane', 'brisbane bar', 'moreton bay', 'manly qld'],
  },
  {
    id: 'sa-outer-harbor',
    name: 'Outer Harbor',
    state: 'SA',
    latitude: -34.78,
    longitude: 138.48,
    timezone: 'Australia/Adelaide',
    aliases: ['adelaide', 'outer harbor', 'semaphore', 'glenelg'],
  },
  {
    id: 'tas-hobart',
    name: 'Hobart',
    state: 'TAS',
    latitude: -42.88,
    longitude: 147.33,
    timezone: 'Australia/Hobart',
    aliases: ['hobart', 'sandy bay'],
  },
];

export async function fetchTideData(
  location: LocationOption,
  options?: { mockMode?: boolean },
): Promise<TideCondition> {
  if (options?.mockMode !== false) {
    return buildMockTide(location);
  }

  try {
    return await fetchBomTideData(location);
  } catch {
    return buildUnavailableTide(location);
  }
}

async function fetchBomTideData(location: LocationOption): Promise<TideCondition> {
  const station = resolveBomTideStation(location);
  if (!station) {
    return buildUnavailableTide(location);
  }

  const text = await fetchFirstUsableBomResponse(station);
  const events = parseBomTideEvents(text, station.timezone);
  const now = new Date();
  const futureEvents = events
    .filter((event) => new Date(event.time).getTime() > now.getTime() - 10 * 60 * 1000)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  if (futureEvents.length === 0) {
    return buildUnavailableTide(location, station);
  }

  const nextHigh = futureEvents.find((event) => event.type === 'high') ?? null;
  const nextLow = futureEvents.find((event) => event.type === 'low') ?? null;
  const nextEvent = futureEvents[0];
  const state = deriveTideState(nextEvent, now);
  const currentRisk = deriveCurrentRisk(futureEvents, now);

  return {
    nextHigh: nextHigh?.time ?? null,
    nextLow: nextLow?.time ?? null,
    state,
    currentRisk,
    note: buildTideNote(currentRisk, state, station.name),
    sourceLabel: `BOM tide predictions · ${station.name}`,
  };
}

async function fetchFirstUsableBomResponse(station: BomTideStation): Promise<string> {
  const urls = buildBomTideUrls(station);

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }
      const text = await response.text();
      if (looksLikeTidePayload(text, station)) {
        return text;
      }
    } catch {
      // Try the next known URL shape. BOM has changed the tide UI before, so keep this defensive.
    }
  }

  throw new Error('BOM tide predictions were unavailable.');
}

function buildBomTideUrls(station: BomTideStation): string[] {
  const today = formatDateForBom(new Date());
  const encodedName = encodeURIComponent(station.name);
  const encodedState = encodeURIComponent(station.state);
  const encodedTimezone = encodeURIComponent(station.timezone);

  return [
    `${BOM_TIDE_BASE_URL}?location=${encodedName}&date=${today}`,
    `${BOM_TIDE_BASE_URL}?target=${encodedName}&date=${today}`,
    `${BOM_TIDE_BASE_URL}?state=${encodedState}&location=${encodedName}&date=${today}`,
    `${BOM_TIDE_BASE_URL}?tz=${encodedTimezone}&location=${encodedName}&date=${today}`,
    `${BOM_TIDE_BASE_URL}#!/${station.id}`,
    `${BOM_TIDE_BASE_URL}`,
  ];
}

function parseBomTideEvents(payload: string, timezone: string): TideEvent[] {
  const trimmed = payload.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return parseJsonTideEvents(JSON.parse(trimmed), timezone);
    } catch {
      // Fall through to text parsing.
    }
  }

  return parseTextTideEvents(payload, timezone);
}

function parseJsonTideEvents(value: unknown, timezone: string): TideEvent[] {
  const events: TideEvent[] = [];

  walkJson(value, (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      return;
    }

    const record = node as Record<string, unknown>;
    const typeValue = getString(record, ['type', 'event', 'tide_type', 'tideType', 'name', 'label']);
    const timeValue = getString(record, ['time', 'dateTime', 'datetime', 'date_time', 'timestamp', 'local_time']);
    const dateValue = getString(record, ['date', 'localDate', 'local_date']);
    const heightValue = getNumber(record, ['height', 'heightM', 'height_m', 'value', 'level']);
    const type = normalizeTideType(typeValue);
    const time = parseBomDateTime(timeValue, dateValue, timezone);

    if (type && time) {
      events.push({ type, time, heightM: heightValue });
    }
  });

  return dedupeAndSortEvents(events);
}

function parseTextTideEvents(text: string, timezone: string): TideEvent[] {
  const events: TideEvent[] = [];
  const normalized = stripHtml(text)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '\n');
  const currentYear = new Date().getFullYear();
  const eventRegex = /\b(High|Low)\b[^\n]{0,80}?\b(\d{1,2}:\d{2})\b[^\n]{0,80}?(?:(\d+(?:\.\d+)?)\s*m)?[^\n]{0,80}?(?:(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})?)?/gi;
  let match: RegExpExecArray | null;

  while ((match = eventRegex.exec(normalized)) !== null) {
    const type = normalizeTideType(match[1]);
    const time = match[2];
    const heightM = match[3] === undefined ? null : Number(match[3]);
    const day = match[4] === undefined ? new Date().getDate() : Number(match[4]);
    const month = match[5] ?? formatMonthShort(new Date());
    const year = match[6] === undefined ? currentYear : Number(match[6]);
    const iso = parseBomDateTime(`${day} ${month} ${year} ${time}`, null, timezone);

    if (type && iso) {
      events.push({ type, time: iso, heightM: Number.isFinite(heightM) ? heightM : null });
    }
  }

  return dedupeAndSortEvents(events);
}

function walkJson(value: unknown, visit: (node: unknown) => void): void {
  visit(value);
  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, visit));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => walkJson(item, visit));
  }
}

function resolveBomTideStation(location: LocationOption): BomTideStation | null {
  const normalizedName = normalizeText(location.name);
  const aliasMatch = BOM_TIDE_STATIONS.find((station) =>
    station.aliases.some((alias) => normalizedName.includes(normalizeText(alias))),
  );
  if (aliasMatch) {
    return aliasMatch;
  }

  const nearest = BOM_TIDE_STATIONS
    .map((station) => ({
      station,
      distance: haversineDistanceKm(location.latitude, location.longitude, station.latitude, station.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  return nearest && nearest.distance <= 120 ? nearest.station : null;
}

function deriveTideState(nextEvent: TideEvent, now: Date): TideState {
  const minutesToNext = Math.abs(new Date(nextEvent.time).getTime() - now.getTime()) / 60000;
  if (minutesToNext <= 25) {
    return 'slack';
  }
  return nextEvent.type === 'high' ? 'incoming' : 'outgoing';
}

function deriveCurrentRisk(events: TideEvent[], now: Date): TideCondition['currentRisk'] {
  const nextEvent = events[0];
  const previousComparable = events.find((event) => new Date(event.time).getTime() <= now.getTime());
  const minutesToNext = nextEvent ? (new Date(nextEvent.time).getTime() - now.getTime()) / 60000 : Number.POSITIVE_INFINITY;
  const rangeM = previousComparable?.heightM !== null && nextEvent?.heightM !== null && previousComparable?.heightM !== undefined && nextEvent?.heightM !== undefined
    ? Math.abs(nextEvent.heightM - previousComparable.heightM)
    : null;

  if (minutesToNext <= 25 || (rangeM !== null && rangeM >= 1.7 && minutesToNext <= 90)) {
    return 'high';
  }
  if (minutesToNext <= 60 || (rangeM !== null && rangeM >= 1.0)) {
    return 'moderate';
  }
  return 'low';
}

function buildTideNote(
  currentRisk: TideCondition['currentRisk'],
  state: TideState,
  stationName: string,
): string {
  if (currentRisk === 'high') {
    return `BOM tide prediction near ${stationName} suggests a tide turn or stronger tidal flow window.`;
  }
  if (currentRisk === 'moderate') {
    return `BOM tide prediction near ${stationName} suggests ${state} tide may add effort.`;
  }
  return `BOM tide prediction near ${stationName} looks manageable for most paddlers.`;
}

function buildUnavailableTide(
  location: LocationOption,
  station?: BomTideStation,
): TideCondition {
  return {
    nextHigh: null,
    nextLow: null,
    state: 'unknown',
    currentRisk: 'moderate',
    note: station
      ? `BOM tide predictions for ${station.name} could not be loaded. Check the BOM tide table before launching.`
      : `No nearby BOM tide prediction station was matched for ${location.name}. Check local tide tables before launching.`,
    sourceLabel: station ? `BOM tide predictions unavailable · ${station.name}` : 'BOM tide predictions unavailable',
  };
}

function buildMockTide(location: LocationOption): TideCondition {
  const seed = Math.abs(Math.round(location.latitude * 1000) + Math.round(location.longitude * 100));
  const hourOffset = (seed % 5) + 1;
  const now = new Date();
  const nextHigh = new Date(now.getTime() + hourOffset * 60 * 60 * 1000);
  const nextLow = new Date(now.getTime() + (hourOffset + 3) * 60 * 60 * 1000);
  const stateIndex = seed % 3;
  const state = stateIndex === 0 ? 'incoming' : stateIndex === 1 ? 'outgoing' : 'slack';
  const currentRisk = seed % 8 === 0 ? 'high' : seed % 3 === 0 ? 'moderate' : 'low';

  return {
    nextHigh: nextHigh.toISOString(),
    nextLow: nextLow.toISOString(),
    state,
    currentRisk,
    note:
      currentRisk === 'high'
        ? 'Strong current around tide turn.'
        : currentRisk === 'moderate'
          ? 'Tide flow may add effort on the way back.'
          : 'Tide looks manageable for most paddlers.',
    sourceLabel: 'Mock tide data',
  };
}

function looksLikeTidePayload(text: string, station: BomTideStation): boolean {
  const normalized = normalizeText(text);
  return (
    normalized.includes('tide') &&
    (normalized.includes(normalizeText(station.name)) || normalized.includes('high') || normalized.includes('low'))
  );
}

function normalizeTideType(value: string | null): TideEvent['type'] | null {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  if (normalized.includes('high')) {
    return 'high';
  }
  if (normalized.includes('low')) {
    return 'low';
  }
  return null;
}

function parseBomDateTime(timeValue: string | null, dateValue: string | null, timezone: string): string | null {
  const candidate = [dateValue, timeValue].filter(Boolean).join(' ').trim();
  if (!candidate) {
    return null;
  }

  const direct = new Date(candidate);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  const parsed = candidate.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!parsed) {
    return null;
  }

  const [, day, monthName, year, hour, minute] = parsed;
  const month = monthNameToIndex(monthName);
  if (month === null) {
    return null;
  }

  return zonedDateToIso(Number(year), month, Number(day), Number(hour), Number(minute), timezone);
}

function zonedDateToIso(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): string {
  const utcGuess = new Date(Date.UTC(year, monthIndex, day, hour, minute));
  const offsetMinutes = getTimezoneOffsetMinutes(utcGuess, timezone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000).toISOString();
}

function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUtc - date.getTime()) / 60000;
}

function getString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }
  return null;
}

function getNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function dedupeAndSortEvents(events: TideEvent[]): TideEvent[] {
  const seen = new Set<string>();
  return events
    .filter((event) => {
      const key = `${event.type}-${event.time}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function formatDateForBom(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthShort(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', { month: 'short' }).format(date);
}

function monthNameToIndex(value: string): number | null {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];
  const index = months.indexOf(value.slice(0, 4).toLowerCase());
  if (index === -1) {
    const shortIndex = months.indexOf(value.slice(0, 3).toLowerCase());
    return shortIndex === -1 ? null : Math.min(shortIndex, 11);
  }
  return Math.min(index, 11);
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
