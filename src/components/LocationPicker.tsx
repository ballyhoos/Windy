import { useEffect, useState } from 'react';
import type { LocationOption } from '../types/conditions';

type LocationPickerProps = {
  currentLocation: LocationOption | null;
  onUseCurrentLocation: () => void;
  onSearch: (query: string) => Promise<LocationOption[]>;
  onPickLocation: (location: LocationOption) => void;
  options: LocationOption[];
  searching: boolean;
};

export function LocationPicker({
  currentLocation,
  onUseCurrentLocation,
  onSearch,
  onPickLocation,
  options,
  searching,
}: LocationPickerProps) {
  const [query, setQuery] = useState(currentLocation?.name ?? '');
  const [showTypeahead, setShowTypeahead] = useState(false);
  const typed = query.trim();
  const searchingEnabled = showTypeahead && typed.length >= 2;
  const visibleOptions = searchingEnabled ? options : [];

  useEffect(() => {
    setQuery(currentLocation?.name ?? '');
  }, [currentLocation?.id, currentLocation?.name]);

  useEffect(() => {
    if (!searchingEnabled) {
      return;
    }

    const next = query.trim();
    const timeoutId = window.setTimeout(() => {
      void onSearch(next);
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [query, onSearch, searchingEnabled]);

  return (
    <section className="panel panel--compact">
      <div className="section-label">Location</div>

      <div className="field-group">
        <div className="location-label-row">
          <label htmlFor="location-typeahead">Type location</label>
          {searching && <span className="location-searching">Searching...</span>}
        </div>
        <input
          id="location-typeahead"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShowTypeahead(true);
          }}
          placeholder="Start typing a location"
        />
      </div>

      <div className="location-suggestions">
        {visibleOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`location-suggestion ${currentLocation?.id === option.id ? 'location-suggestion--active' : ''}`}
            onClick={() => {
              onPickLocation(option);
              setQuery(option.name);
              setShowTypeahead(false);
            }}
          >
            <span>{option.name}</span>
            {option.region && <small>{option.region}</small>}
          </button>
        ))}
        {!searching && searchingEnabled && options.length === 0 && (
          <div className="location-suggestion location-suggestion--empty">
            <span>No matches</span>
          </div>
        )}
      </div>

      <div className="location-actions">
        <button type="button" className="button button--ghost" onClick={onUseCurrentLocation}>
          Use current
        </button>
      </div>
    </section>
  );
}
