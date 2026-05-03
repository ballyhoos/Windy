import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusCard } from './components/StatusCard';
import { BUILD_VERSION } from './generated/buildInfo';
import { evaluateConditions } from './lib/decisionEngine';
import { buildHourlyOutlook } from './lib/hourlyOutlook';
import { fetchSunData } from './lib/sunApi';
import { fetchTideData } from './lib/tideApi';
import { fetchMarineWeather, resolveNearestLocation, searchLocations } from './lib/weatherApi';
import type {
  DecisionResult,
  LocationOption,
  PaddleConditions,
  SportType,
} from './types/conditions';

const STORAGE_KEYS = {
  location: 'paddle-check:last-location',
  recentLocations: 'paddle-check:recent-locations',
  isSubscribed: 'paddle-check:is-subscribed',
  selectedSport: 'windy:selected-sport',
};

const INITIAL_LOCATION = loadStoredLocation();
const EMPTY_LOCATION: LocationOption = {
  id: 'location-unset',
  name: 'Set location',
  region: '',
  latitude: 0,
  longitude: 0,
};
const isLocationUnset = (location: LocationOption | null): boolean => !location || location.id === EMPTY_LOCATION.id;

export default function App() {
  const [isSubscribed, setIsSubscribed] = useState<boolean>(loadSubscriptionState());
  const [location, setLocation] = useState<LocationOption | null>(INITIAL_LOCATION);
  const [selectedSport, setSelectedSport] = useState<SportType>(loadSelectedSport());
  const [recentLocations, setRecentLocations] = useState<LocationOption[]>(loadRecentLocations());
  const [searchResults, setSearchResults] = useState<LocationOption[]>([]);
  const [conditions, setConditions] = useState<PaddleConditions | null>(
    createPlaceholderConditions(INITIAL_LOCATION ?? EMPTY_LOCATION),
  );
  const [loading, setLoading] = useState(Boolean(INITIAL_LOCATION));
  const [findingCurrentLocation, setFindingCurrentLocation] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRequestIdRef = useRef(0);
  const conditionsRequestIdRef = useRef(0);
  const inFlightLocationKeyRef = useRef<string | null>(null);
  const lastLoadedLocationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('relockGraph') === '1') {
      setIsSubscribed(false);
      window.sessionStorage.setItem(STORAGE_KEYS.isSubscribed, 'false');
    }
  }, []);

  useEffect(() => {
    if (!location) {
      return;
    }
    const activeLocation = location;
    const key = buildLocationKey(activeLocation);
    if (lastLoadedLocationKeyRef.current === key || inFlightLocationKeyRef.current === key) {
      return;
    }
    void loadConditions(activeLocation);
  }, [location]);

  const decision = useMemo<DecisionResult | null>(() => {
    if (!conditions) {
      return null;
    }

    return evaluateConditions(conditions, selectedSport);
  }, [conditions, selectedSport]);

  const hourlyOutlook = useMemo(() => {
    if (!conditions) {
      return [];
    }
    return buildHourlyOutlook(conditions, selectedSport);
  }, [conditions, selectedSport]);

  async function loadConditions(nextLocation: LocationOption) {
    const locationKey = buildLocationKey(nextLocation);
    if (inFlightLocationKeyRef.current === locationKey || lastLoadedLocationKeyRef.current === locationKey) {
      return;
    }
    inFlightLocationKeyRef.current = locationKey;
    const requestId = ++conditionsRequestIdRef.current;
    setLoading(true);
    setError(null);
    setConditions((current) =>
      current
        ? {
            ...current,
            marine: {
              ...current.marine,
              location: nextLocation,
            },
          }
        : createPlaceholderConditions(nextLocation),
    );

    try {
      const [marine, tide, sun] = await Promise.all([
        fetchMarineWeather(nextLocation),
        fetchTideData(nextLocation, { mockMode: false }),
        fetchSunData(nextLocation, { mockMode: false }),
      ]);

      const nextConditions: PaddleConditions = {
        marine,
        tide,
        sun,
        updatedAt: new Date().toISOString(),
        isMock: false,
      };

      if (requestId !== conditionsRequestIdRef.current) {
        return;
      }

      setConditions(nextConditions);
      window.localStorage.setItem(STORAGE_KEYS.location, JSON.stringify(nextLocation));
      setRecentLocations((current) => {
        const next = upsertRecentLocations(current, nextLocation, 4);
        window.localStorage.setItem(STORAGE_KEYS.recentLocations, JSON.stringify(next));
        return next;
      });
      lastLoadedLocationKeyRef.current = locationKey;
    } catch (caught) {
      if (requestId !== conditionsRequestIdRef.current) {
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Unable to load conditions.');
    } finally {
      if (inFlightLocationKeyRef.current === locationKey) {
        inFlightLocationKeyRef.current = null;
      }
      if (requestId === conditionsRequestIdRef.current) {
        setLoading(false);
      }
    }
  }

  const handleSearch = useCallback(async (query: string): Promise<LocationOption[]> => {
    const requestId = ++searchRequestIdRef.current;
    if (query.trim().length < 2) {
      if (requestId === searchRequestIdRef.current) {
        setSearchResults([]);
        setSearching(false);
      }
      return [];
    }

    setSearching(true);
    try {
      const matches = await searchLocations(query);
      if (requestId === searchRequestIdRef.current) {
        setSearchResults(matches);
        setSearching(false);
      }
      return matches;
    } catch (caught) {
      if (requestId === searchRequestIdRef.current) {
        setError(caught instanceof Error ? caught.message : 'Unable to search locations.');
        setSearching(false);
      }
      return [];
    }
  }, []);

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device.');
      return;
    }

    setFindingCurrentLocation(true);
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          const nearest = await resolveNearestLocation(latitude, longitude);
          setLocation((current) => (isSameLocation(current, nearest) ? current : nearest));
        } catch {
          setLoading(false);
          setError('Unable to resolve your current location.');
        } finally {
          setFindingCurrentLocation(false);
        }
      },
      () => {
        setFindingCurrentLocation(false);
        setLoading(false);
        setError('Unable to access your current location.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <main className="app-shell">
      <div className="app-shell__inner">
        {!conditions && error && (
          <section className="panel panel--state panel--error">
            <strong>Could not load conditions</strong>
            <p>{error}</p>
          </section>
        )}

        {conditions && decision && (
          <>
            <StatusCard
              decision={decision}
              marine={conditions.marine}
              hourlyOutlook={hourlyOutlook}
              isSubscribed={isSubscribed}
              onSubscribeUnlock={() => {
                setIsSubscribed(true);
                window.sessionStorage.setItem(STORAGE_KEYS.isSubscribed, 'true');
              }}
              loading={loading || isLocationUnset(location)}
              onUseCurrentLocation={handleUseCurrentLocation}
              onSearchLocation={handleSearch}
              onPickLocation={(nextLocation) => {
                setLocation(nextLocation);
                setSearchResults([]);
              }}
              selectedSport={selectedSport}
              onSelectSport={(sport) => {
                setSelectedSport(sport);
                window.localStorage.setItem(STORAGE_KEYS.selectedSport, sport);
              }}
              recentLocations={recentLocations.filter((item) => item.id !== conditions.marine.location.id)}
              locationOptions={searchResults}
              searchingLocations={searching}
              findingCurrentLocation={findingCurrentLocation}
              loadingLocationData={loading && !isLocationUnset(location)}
            />
          </>
        )}

        <footer className="app-footer">
          <a href="https://sunrise-sunset.org/api" target="_blank" rel="noreferrer" className="app-footer__sun-link">
            Sunrise-Sunset API
          </a>
          <span className="app-footer__sep" aria-hidden="true">
            |
          </span>
          <span className="app-footer__version">Version: {BUILD_VERSION}</span>
          <span className="app-footer__sep" aria-hidden="true">
            |
          </span>
          <a
            href="https://x.com/intent/tweet?text=%40_ballyhoos%20%23windy"
            target="_blank"
            rel="noreferrer"
            className="app-footer__x-link"
            aria-label="Send feedback on X"
          >
            Feedback
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M18.244 2H21.5l-7.11 8.129L22.75 22h-6.545l-5.128-6.707L5.21 22H1.95l7.607-8.695L1.5 2h6.712l4.63 6.114L18.244 2Zm-1.14 18h1.803L7.23 3.895H5.293L17.104 20Z"
                fill="currentColor"
              />
            </svg>
          </a>
        </footer>
      </div>
    </main>
  );
}

function loadSelectedSport(): SportType {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.selectedSport);
    if (stored === 'paddle' || stored === 'kayak' || stored === 'surf' || stored === 'kite') {
      return stored;
    }
  } catch {
    // ignore
  }
  return 'paddle';
}

function loadSubscriptionState(): boolean {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEYS.isSubscribed);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    const envDefault = String(import.meta.env.VITE_SUBSCRIPTION_DEFAULT ?? '').trim().toLowerCase();
    return envDefault === '1' || envDefault === 'true' || envDefault === 'yes';
  } catch {
    return false;
  }
}

function loadRecentLocations(): LocationOption[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.recentLocations);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocationOption[];
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (item) =>
        !!item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.latitude === 'number' &&
        typeof item.longitude === 'number',
    );
    return valid.filter(
      (item, index, array) =>
        array.findIndex((candidate) => normalizeRecentLocationKey(candidate) === normalizeRecentLocationKey(item)) ===
        index,
    );
  } catch {
    return [];
  }
}

function upsertRecentLocations(
  current: LocationOption[],
  nextLocation: LocationOption,
  max: number,
): LocationOption[] {
  const nextKey = normalizeRecentLocationKey(nextLocation);
  const deduped = current.filter(
    (item) =>
      normalizeRecentLocationKey(item) !== nextKey &&
      item.id !== nextLocation.id &&
      !isCoordinateNear(item, nextLocation, 0.15),
  );
  return [nextLocation, ...deduped].slice(0, max);
}

function normalizeRecentLocationKey(location: LocationOption): string {
  const name = location.name.trim().toLowerCase().replace(/\s+/g, ' ');
  const region = (location.region ?? '').trim().toLowerCase();
  return `${name}|${region}`;
}

function isCoordinateNear(a: LocationOption, b: LocationOption, thresholdKm: number): boolean {
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) <= thresholdKm;
}

function loadStoredLocation(): LocationOption | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.location);
    return raw ? (JSON.parse(raw) as LocationOption) : null;
  } catch {
    return null;
  }
}

function isSameLocation(a: LocationOption | null, b: LocationOption | null): boolean {
  if (!a || !b) {
    return false;
  }

  const sameId = a.id === b.id;
  const distanceKm = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
  const sameCoordinates = distanceKm <= 2;
  const sameName =
    normalizeLocationName(a.name) === normalizeLocationName(b.name);
  const sameRegion = (a.region ?? '') === (b.region ?? '');
  return sameId || (sameCoordinates && sameRegion) || (sameName && sameRegion);
}

function normalizeLocationName(value: string): string {
  return value
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function createPlaceholderConditions(location: LocationOption): PaddleConditions {
  const now = new Date();
  const sunrise = new Date(now);
  sunrise.setHours(6, 30, 0, 0);
  const sunset = new Date(now);
  sunset.setHours(18, 0, 0, 0);

  return {
    marine: {
      location,
      wind: {
        speed: null,
        gust: null,
        directionDegrees: 0,
        cardinal: 'N',
        shoreRelation: 'variable',
      },
      airTempC: null,
      feelsLikeTempC: null,
      waterTempC: null,
      swellHeightM: null,
      visibilityKm: null,
      warnings: [],
      forecast: {
        summary: 'Loading conditions',
        thunderstormRisk: 'none',
        weatherChangingSoon: false,
      },
      roughWater: false,
      sourceLabel: 'Loading',
      forecastSourceLabel: 'Loading',
      hourly: [],
    },
    tide: {
      nextHigh: null,
      nextLow: null,
      state: 'unknown',
      currentRisk: 'low',
      note: 'Loading tide data',
      sourceLabel: 'Loading',
    },
    sun: {
      sunrise: sunrise.toISOString(),
      sunset: sunset.toISOString(),
      moonPhase: 'unknown',
      daylightRemainingMinutes: null,
      safeReturnBufferMinutes: 90,
      sourceLabel: 'Loading',
    },
    updatedAt: now.toISOString(),
    isMock: true,
  };
}

function buildLocationKey(location: LocationOption): string {
  return `${location.id}|${location.region ?? ''}|${location.latitude.toFixed(4)}|${location.longitude.toFixed(4)}`;
}
