import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusCard } from './components/StatusCard';
import { evaluatePaddleConditions } from './lib/decisionEngine';
import { buildHourlyOutlook } from './lib/hourlyOutlook';
import { fetchSunData } from './lib/sunApi';
import { fetchTideData } from './lib/tideApi';
import { fetchMarineWeather, resolveNearestLocation, searchLocations } from './lib/weatherApi';
import type {
  DecisionResult,
  LocationOption,
  PaddleConditions,
} from './types/conditions';

const STORAGE_KEYS = {
  location: 'paddle-check:last-location',
};

const DEFAULT_LOCATION: LocationOption = {
  id: 'st-kilda',
  name: 'St Kilda Beach',
  latitude: -37.8676,
  longitude: 144.9747,
  region: 'VIC',
};
const INITIAL_LOCATION = loadStoredLocation() ?? DEFAULT_LOCATION;

export default function App() {
  const [location, setLocation] = useState<LocationOption | null>(INITIAL_LOCATION);
  const [searchResults, setSearchResults] = useState<LocationOption[]>([]);
  const [conditions, setConditions] = useState<PaddleConditions | null>(
    createPlaceholderConditions(INITIAL_LOCATION),
  );
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRequestIdRef = useRef(0);
  const conditionsRequestIdRef = useRef(0);

  useEffect(() => {
    const activeLocation = location ?? DEFAULT_LOCATION;
    void loadConditions(activeLocation);
  }, [location]);

  const decision = useMemo<DecisionResult | null>(() => {
    if (!conditions) {
      return null;
    }

    return evaluatePaddleConditions(conditions);
  }, [conditions]);

  const hourlyOutlook = useMemo(() => {
    if (!conditions) {
      return [];
    }
    return buildHourlyOutlook(conditions);
  }, [conditions]);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const nearest = await resolveNearestLocation(latitude, longitude);
        setLocation((current) => (isSameLocation(current, nearest) ? current : nearest));
      },
      () => {
        // Keep last known/default location if permission denied or unavailable.
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    );
  }, []);

  async function loadConditions(nextLocation: LocationOption) {
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
        fetchMarineWeather(nextLocation, { mockMode: false }),
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
    } catch (caught) {
      if (requestId !== conditionsRequestIdRef.current) {
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Unable to load conditions.');
    } finally {
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

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const nearest = await resolveNearestLocation(latitude, longitude);
        setLocation((current) => (isSameLocation(current, nearest) ? current : nearest));
      },
      () => {
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
              loading={loading}
              onUseCurrentLocation={handleUseCurrentLocation}
              onSearchLocation={handleSearch}
              onPickLocation={(nextLocation) => {
                setLocation(nextLocation);
                setSearchResults([]);
              }}
              locationOptions={searchResults}
              searchingLocations={searching}
            />
          </>
        )}
      </div>
    </main>
  );
}

function loadStoredLocation(): LocationOption | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.location);
    return raw ? (JSON.parse(raw) as LocationOption) : DEFAULT_LOCATION;
  } catch {
    return DEFAULT_LOCATION;
  }
}

function isSameLocation(a: LocationOption | null, b: LocationOption | null): boolean {
  if (!a || !b) {
    return false;
  }

  const sameId = a.id === b.id;
  const sameCoordinates =
    Math.abs(a.latitude - b.latitude) < 0.0001 && Math.abs(a.longitude - b.longitude) < 0.0001;
  const sameRegion = (a.region ?? '') === (b.region ?? '');
  return sameId || (sameCoordinates && sameRegion);
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
        speedKmh: null,
        gustKmh: null,
        directionDegrees: 0,
        cardinal: 'N',
        shoreRelation: 'variable',
      },
      airTempC: null,
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
      daylightRemainingMinutes: null,
      safeReturnBufferMinutes: 90,
      sourceLabel: 'Loading',
    },
    updatedAt: now.toISOString(),
    isMock: true,
  };
}
