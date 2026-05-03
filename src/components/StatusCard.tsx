import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { HourlyOutlook } from './HourlyOutlook';
import { ShorelineOrientationCircle } from './ShorelineOrientationCircle';
import forecastSubscribeBg from '../assets/forecast-subscribe-bg.png';
import type { HourlyOutlookItem } from '../lib/hourlyOutlook';
import type { DecisionResult, LocationOption, MarineConditionSet } from '../types/conditions';

type StatusCardProps = {
  decision: DecisionResult;
  marine: MarineConditionSet;
  hourlyOutlook: HourlyOutlookItem[];
  isSubscribed: boolean;
  onSubscribeUnlock: () => void;
  loading: boolean;
  onUseCurrentLocation: () => void;
  onSearchLocation: (query: string) => Promise<LocationOption[]>;
  onPickLocation: (location: LocationOption) => void;
  recentLocations: LocationOption[];
  locationOptions: LocationOption[];
  searchingLocations: boolean;
  findingCurrentLocation: boolean;
};

const statusMeta = {
  green: { label: "Let's go!", color: '#2b8a57' },
  amber: { label: 'Be careful', color: '#ffb86b' },
  red: { label: "Don't go", color: '#d64045' },
};
const loadingMeta = { label: '---', color: '#d9e1e8' };

export function StatusCard({
  decision,
  marine,
  hourlyOutlook,
  isSubscribed,
  onSubscribeUnlock,
  loading,
  onUseCurrentLocation,
  onSearchLocation,
  onPickLocation,
  recentLocations,
  locationOptions,
  searchingLocations,
  findingCurrentLocation,
}: StatusCardProps) {
  const meta = loading ? loadingMeta : statusMeta[decision.status];
  const direction = getArrowRotation(marine.wind.directionDegrees, marine.wind.cardinal);
  const windSpeedLabel = formatWindSpeed(marine.wind.speed);
  const isCalm = windSpeedLabel === '0';
  const windDirectionLabel = isCalm ? 'Calm' : marine.wind.cardinal;
  const airTempLabel = loading || marine.airTempC === null ? '--' : `${marine.airTempC}°C`;
  const windLabel = loading ? '--' : `${windSpeedLabel}kn ${windDirectionLabel}`;
  const currentWeatherCode = marine.hourly.find((point) => point.weatherCode !== null)?.weatherCode ?? null;
  const evaluationText = loading ? '---' : decision.title;
  const reasonsText = loading
    ? '---'
    : decision.reasons
        .slice(0, 3)
        .map((reason) => reason.label)
        .join(' · ');
  const [locationQuery, setLocationQuery] = useState(marine.location.name);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [locationQueryDirty, setLocationQueryDirty] = useState(false);
  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const locationPopoverRef = useRef<HTMLDivElement | null>(null);
  const locationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const trimmedQuery = locationQuery.trim();
  const showSuggestions = isLocationOpen && locationQueryDirty && trimmedQuery.length >= 2;
  const visibleOptions = showSuggestions ? locationOptions : [];
  const canRenderShoreline =
    Number.isFinite(marine.location.latitude) &&
    Number.isFinite(marine.location.longitude) &&
    marine.location.id !== 'location-unset';
  const shouldRenderGraph = !loading && hourlyOutlook.length > 0;
  const visibleRecentLocations = recentLocations
    .filter((option, index, array) => array.findIndex((item) => item.id === option.id) === index)
    .slice(0, 3);

  useEffect(() => {
    setLocationQuery('');
    setLocationQueryDirty(false);
  }, [marine.location.id, marine.location.name]);

  useEffect(() => {
    if (!showSuggestions) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void onSearchLocation(trimmedQuery);
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [onSearchLocation, showSuggestions, trimmedQuery]);

  useEffect(() => {
    if (!isLocationOpen) return;
    const id = window.requestAnimationFrame(() => {
      locationInputRef.current?.focus();
      locationInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isLocationOpen]);

  useEffect(() => {
    if (!isLocationOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (locationPopoverRef.current?.contains(target)) return;
      if (locationTriggerRef.current?.contains(target)) return;
      setIsLocationOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsLocationOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isLocationOpen]);

  useEffect(() => {
    if (loading) return;
    const label = getStationLabel(marine.sourceLabel);
    if (!label) return;
    // Debug visibility without occupying UI space.
    console.info(`[Windy] Location: ${marine.location.name} | Station: ${label}`);
  }, [loading, marine.location.name, marine.sourceLabel]);

  return (
    <section className={`status-card ${loading ? 'status-card--updating' : ''}`}>
      <div className="status-hero">
        <div className="location-chip-row">
          <button
            ref={locationTriggerRef}
            type="button"
            className="temp-chip location-chip location-chip__trigger"
            onClick={() => setIsLocationOpen((current) => !current)}
            aria-expanded={isLocationOpen}
            aria-label="Change location"
          >
            <LocationIcon />
            <span>{marine.location.name}</span>
          </button>
          {searchingLocations || findingCurrentLocation ? (
            <span className="location-chip-spinner" aria-label="Loading" />
          ) : (
            <button
              type="button"
              className="location-chip-action"
              aria-label="Use current location"
              onClick={() => {
                onUseCurrentLocation();
                setIsLocationOpen(false);
              }}
            >
              <TargetIcon />
            </button>
          )}
        </div>
        {isLocationOpen && (
          <div ref={locationPopoverRef} className="location-popover" role="dialog" aria-label="Location search">
            {visibleRecentLocations.length > 0 && (
              <div className="location-recents location-recents--in-popover" aria-label="Recent locations">
                {visibleRecentLocations.map((option, index) => (
                  <button
                    key={`recent-${option.id}-${index}`}
                    type="button"
                    className="location-recent-pill"
                    onClick={() => {
                      onPickLocation(option);
                      setIsLocationOpen(false);
                    }}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            )}
            <div className="location-popover__search-row">
              <input
                ref={locationInputRef}
                className="location-popover__input"
                value={locationQuery}
                onChange={(event) => {
                  setLocationQuery(event.target.value);
                  setLocationQueryDirty(true);
                }}
                placeholder="Type location"
              />
            </div>

            <div className="location-popover__suggestions">
              {visibleOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`location-popover__option ${marine.location.id === option.id ? 'location-popover__option--active' : ''} ${option.region ? '' : 'location-popover__option--single'}`}
                  onClick={() => {
                    onPickLocation(option);
                    setLocationQuery('');
                    setLocationQueryDirty(false);
                    setIsLocationOpen(false);
                  }}
                >
                  <span>{option.name}</span>
                  {option.region && <small>{option.region}</small>}
                </button>
              ))}
              {!searchingLocations && showSuggestions && visibleOptions.length === 0 && (
                <div className="location-popover__empty">No matches</div>
              )}
            </div>
          </div>
        )}
        <div className="status-hero__metrics">
          <span className="temp-chip">
            <AirTempIcon weatherCode={currentWeatherCode} />
            <span>{airTempLabel}</span>
          </span>
          <span className="temp-chip wind-chip">
            <WindIcon />
            <span>{windLabel}</span>
          </span>
          {marine.waterTempC !== null && (
            <span className="temp-chip">
              <WaterTempIcon />
              <span>{marine.waterTempC}°C</span>
            </span>
          )}
        </div>

        <div className="status-hero__signal-wrap">
          {canRenderShoreline && (
            <ShorelineOrientationCircle lat={marine.location.latitude} lon={marine.location.longitude} />
          )}
          <div
            className={`status-hero__signal ${loading ? 'status-hero__signal--loading' : ''}`}
            style={
              {
                '--signal-color': meta.color,
              } as CSSProperties
            }
          >
            <div
              className={`status-hero__arrow ${isCalm ? 'status-hero__arrow--calm' : ''}`}
              style={{ transform: `translate(-50%, -50%) rotate(${direction}deg)` }}
              aria-label={`Wind direction ${marine.wind.cardinal}`}
            >
              {isCalm ? (
                '●'
              ) : (
                <svg className="status-hero__triangle" viewBox="0 0 140 140" aria-hidden="true">
                  <polygon points="70,8 118,126 70,104 22,126" />
                </svg>
              )}
            </div>
          </div>
        </div>
        <div className="status-card__evaluation">
          <p>{evaluationText}</p>
          <small>{reasonsText}</small>
        </div>
      </div>

      <div className={`forecast-gate ${isSubscribed ? '' : 'forecast-gate--locked'}`}>
        {shouldRenderGraph ? <HourlyOutlook items={hourlyOutlook} embedded /> : null}
        {!isSubscribed && (
          <div className="forecast-gate__overlay" role="region" aria-label="Forecast subscription gate">
            <img
              className="forecast-gate__image"
              src={forecastSubscribeBg}
              alt="Forecast preview locked"
            />
            <div className="forecast-gate__card">
              <strong>Subscribe for full forecast</strong>
              <p>Unlock the 36-hour wind and tide forecast graph.</p>
              <button type="button" className="forecast-gate__button" onClick={onSubscribeUnlock}>
                Subscribe
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="status-card__disclaimer">
        Conditions change quickly. Guidance only — check warnings and use your judgement.
      </p>
    </section>
  );
}

function getArrowRotation(directionDegrees: number | null, cardinal: string): number {
  if (directionDegrees !== null) {
    return normalizeDegrees(directionDegrees + 180);
  }

  return normalizeDegrees(cardinalToDegrees(cardinal) + 180);
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized >= 0 ? normalized : normalized + 360;
}

function cardinalToDegrees(cardinal: string): number {
  const lookup: Record<string, number> = {
    N: 0,
    NE: 45,
    E: 90,
    SE: 135,
    S: 180,
    SW: 225,
    W: 270,
    NW: 315,
  };

  return lookup[cardinal.toUpperCase()] ?? 0;
}

function AirTempIcon({ weatherCode }: { weatherCode: number | null }) {
  if (weatherCode !== null && weatherCode >= 60) {
    return (
      <svg className="temp-icon temp-icon--air" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7a4.2 4.2 0 0 1 7.8-1.7A3.3 3.3 0 1 1 16.5 12H7.2A2.8 2.8 0 1 1 7 7Z" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M9 14.5 8 16M13 14.5 12 16M17 14.5 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (weatherCode !== null && weatherCode >= 3) {
    return (
      <svg className="temp-icon temp-icon--air" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7a4.2 4.2 0 0 1 7.8-1.7A3.3 3.3 0 1 1 16.5 12H7.2A2.8 2.8 0 1 1 7 7Z" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg className="temp-icon temp-icon--air" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function WaterTempIcon() {
  return (
    <svg className="temp-icon temp-icon--water" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3c3.2 4.4 5.8 7.1 5.8 10.1a5.8 5.8 0 1 1-11.6 0C6.2 10.1 8.8 7.4 12 3Z" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function WindIcon() {
  return (
    <svg className="temp-icon temp-icon--wind" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 9h10a2.5 2.5 0 1 0-2.5-2.5M3 15h14a2.5 2.5 0 1 1-2.5 2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getStationLabel(sourceLabel: string): string {
  const parts = sourceLabel.split('·').map((part) => part.trim());
  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }
  return sourceLabel || 'Unknown';
}

function LocationIcon() {
  return (
    <svg className="temp-icon temp-icon--location" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="11" r="2" fill="currentColor" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg className="temp-icon temp-icon--location" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function formatWindSpeed(speed: number | null): string {
  if (speed === null) {
    return '--';
  }

  return Math.round(speed).toString();
}
