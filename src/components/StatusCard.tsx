import { useEffect, useState, type CSSProperties } from 'react';
import { HourlyOutlook } from './HourlyOutlook';
import type { HourlyOutlookItem } from '../lib/hourlyOutlook';
import type { DecisionResult, LocationOption, MarineConditionSet } from '../types/conditions';

type StatusCardProps = {
  decision: DecisionResult;
  marine: MarineConditionSet;
  hourlyOutlook: HourlyOutlookItem[];
  loading: boolean;
  onUseCurrentLocation: () => void;
  onSearchLocation: (query: string) => Promise<LocationOption[]>;
  onPickLocation: (location: LocationOption) => void;
  locationOptions: LocationOption[];
  searchingLocations: boolean;
};

const statusMeta = {
  green: { label: "Let's go!", color: '#2b8a57' },
  amber: { label: 'Be careful', color: '#ffb86b' },
  red: { label: "Don't go", color: '#d64045' },
};
const loadingMeta = { label: '---', color: '#9aa6b2' };

export function StatusCard({
  decision,
  marine,
  hourlyOutlook,
  loading,
  onUseCurrentLocation,
  onSearchLocation,
  onPickLocation,
  locationOptions,
  searchingLocations,
}: StatusCardProps) {
  const meta = loading ? loadingMeta : statusMeta[decision.status];
  const direction = getArrowRotation(marine.wind.directionDegrees, marine.wind.cardinal);
  const windSpeedKnots = toKnots(marine.wind.speedKmh);
  const isCalm = windSpeedKnots === '0';
  const windDirectionLabel = isCalm ? 'Calm' : marine.wind.cardinal;
  const stationLabel = loading ? '---' : getStationLabel(marine.sourceLabel);
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
  const trimmedQuery = locationQuery.trim();
  const showSuggestions = isLocationOpen && locationQueryDirty && trimmedQuery.length >= 2;
  const visibleOptions = showSuggestions ? locationOptions : [];

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

  return (
    <section className={`status-card ${loading ? 'status-card--updating' : ''}`}>
      <div className="status-hero">
        <div className="location-chip-row">
          <button
            type="button"
            className="temp-chip location-chip location-chip__trigger"
            onClick={() => setIsLocationOpen((current) => !current)}
            aria-expanded={isLocationOpen}
            aria-label="Change location"
          >
            <LocationIcon />
            <span>{marine.location.name}</span>
          </button>
          {searchingLocations || loading ? (
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
          <div className="location-popover" role="dialog" aria-label="Location search">
            <div className="location-popover__search-row">
              <input
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
            <AirTempIcon />
            <span>{marine.airTempC ?? '--'}°C</span>
          </span>
          <span className="temp-chip">
            <WaterTempIcon />
            <span>{marine.waterTempC ?? '--'}°C</span>
          </span>
        </div>

        <div
          className="status-hero__signal"
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
        <span className="temp-chip wind-chip">
          <WindIcon />
          <span>{`${windSpeedKnots}kn ${windDirectionLabel}`}</span>
        </span>
        <div className="status-card__evaluation">
          <p>{evaluationText}</p>
          <small>{reasonsText}</small>
        </div>
        <div className="status-card__source" aria-label="Data sources">
          <div>Station: {stationLabel}</div>
        </div>
      </div>

      <HourlyOutlook items={hourlyOutlook} embedded />
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

function AirTempIcon() {
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

function toKnots(speedKmh: number | null): string {
  if (speedKmh === null) {
    return '--';
  }

  return Math.round(speedKmh * 0.539957).toString();
}
