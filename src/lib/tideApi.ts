import type { LocationOption, TideCondition, TideEvent } from '../types/conditions';

export async function fetchTideData(
  location: LocationOption,
  options?: { mockMode?: boolean },
): Promise<TideCondition> {
  if (options?.mockMode) {
    return buildUnavailableTide('Tide data unavailable');
  }
  try {
    const base = weatherProxyBaseUrl();
    const url = new URL(`${base}/tides`);
    url.searchParams.set('lat', String(location.latitude));
    url.searchParams.set('lon', String(location.longitude));
    if (location.region) {
      url.searchParams.set('state', normalizeAustralianStateCode(location.region) ?? location.region);
    }
    url.searchParams.set('locationName', location.name);
    const response = await fetch(url.toString());
    if (!response.ok) return buildUnavailableTide('BOM tides unavailable');
    const payload = (await response.json()) as {
      next_high_time?: string | null;
      next_low_time?: string | null;
      tides?: Array<{ datetime?: string; type?: 'high' | 'low'; height_m?: number | null }>;
      tide_state?: 'incoming' | 'outgoing' | 'slack' | 'unknown';
      current_risk?: 'low' | 'moderate' | 'high';
      note?: string;
      source_label?: string;
    };
    const events: TideEvent[] = Array.isArray(payload.tides)
      ? payload.tides
          .map((event) => {
            if (!event?.datetime || (event.type !== 'high' && event.type !== 'low')) return null;
            return {
              datetime: event.datetime,
              type: event.type,
              heightM: typeof event.height_m === 'number' ? event.height_m : null,
            };
          })
          .filter((event): event is TideEvent => event !== null)
      : [];
    return {
      nextHigh: payload.next_high_time ?? null,
      nextLow: payload.next_low_time ?? null,
      events,
      state: payload.tide_state ?? 'unknown',
      currentRisk: payload.current_risk ?? 'low',
      note: payload.note ?? 'Tide data unavailable right now.',
      sourceLabel: payload.source_label ?? 'BOM tides unavailable',
    };
  } catch {
    return buildUnavailableTide('BOM tides unavailable');
  }
}

function buildUnavailableTide(sourceLabel: string): TideCondition {
  return {
    nextHigh: null,
    nextLow: null,
    events: [],
    state: 'unknown',
    currentRisk: 'low',
    note: 'Tide data unavailable right now.',
    sourceLabel,
  };
}

function weatherProxyBaseUrl(): string {
  const configured = import.meta.env.VITE_WEATHER_PROXY_BASE_URL;
  if (!configured || configured.trim().length === 0) {
    throw new Error('Missing VITE_WEATHER_PROXY_BASE_URL');
  }
  return configured.replace(/\/+$/, '');
}

function normalizeAustralianStateCode(region: string | undefined): string | null {
  if (!region) return null;
  const normalized = region.trim().toUpperCase();
  if (['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT'].includes(normalized)) return normalized;
  if (normalized === 'NEW SOUTH WALES') return 'NSW';
  if (normalized === 'VICTORIA') return 'VIC';
  if (normalized === 'QUEENSLAND') return 'QLD';
  if (normalized === 'WESTERN AUSTRALIA') return 'WA';
  if (normalized === 'SOUTH AUSTRALIA') return 'SA';
  if (normalized === 'TASMANIA') return 'TAS';
  if (normalized === 'NORTHERN TERRITORY') return 'NT';
  return null;
}
