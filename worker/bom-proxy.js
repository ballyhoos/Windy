const BOM_API_BASE = 'https://api.weather.bom.gov.au';
const BOM_WWW_BASE = 'https://www.bom.gov.au';

const MARINE_KEYWORDS = ['beacon', 'harbour', 'harbor', 'pier', 'jetty', 'port', 'bay', 'beach', 'heads', 'point'];
const CURATED_COASTAL_STATIONS = [
  {
    id: 'coastal:IDV60701.95872',
    name: 'Fawkner Beacon',
    state: 'VIC',
    aliases: ['hampton', 'hampton vic', 'hampton victoria', 'black rock', 'sandringham'],
    productPath: 'IDV60701/IDV60701.95872',
  },
  {
    id: 'coastal:IDV60701.95864',
    name: 'St Kilda Harbour - RMYS',
    state: 'VIC',
    aliases: ['st kilda', 'st kilda vic', 'st kilda victoria', 'elwood', 'port melbourne'],
    productPath: 'IDV60701/IDV60701.95864',
  },
];
const RESOLVE_STATION_TTL_SECONDS = 60 * 60 * 24;
const TIDE_INDEX_TTL_SECONDS = 60 * 60 * 24;
const TIDE_RESOLUTION_TTL_SECONDS = 60 * 60 * 24;
const TIDE_PREDICTION_TTL_SECONDS = 60 * 60 * 24;
const TIDE_DISTANCE_WARNING_KM = 20;
const AEST_OFFSET = '+10:00';
const TIDE_CACHE_VERSION = 'v2';
const BOM_TIDE_STATIONS = [
  {
    name: 'Sydney (Fort Denison)',
    state: 'NSW',
    aac: 'NSW_TP007',
    lat: -33.856,
    lon: 151.225,
    timezone: 'Australia/Sydney',
    location_type: 'primary',
    source_url: 'https://www.bom.gov.au/oceanography/projects/ntc/tide_tables.shtml',
  },
  {
    name: 'Gold Coast Seaway',
    state: 'QLD',
    aac: 'QLD_TP011',
    lat: -27.94,
    lon: 153.43,
    timezone: 'Australia/Brisbane',
    location_type: 'primary',
    source_url: 'https://www.bom.gov.au/oceanography/projects/ntc/tide_tables.shtml',
  },
  {
    name: 'Melbourne (Williamstown)',
    state: 'VIC',
    aac: 'VIC_TP009',
    lat: -37.863,
    lon: 144.902,
    timezone: 'Australia/Melbourne',
    location_type: 'primary',
    source_url: 'https://www.bom.gov.au/oceanography/projects/ntc/vic_tide_tables.shtml',
  },
  {
    name: 'Port Phillip Heads (Point Lonsdale)',
    state: 'VIC',
    aac: 'VIC_TP248',
    lat: -38.283,
    lon: 144.616,
    timezone: 'Australia/Melbourne',
    location_type: 'primary',
    source_url: 'https://www.bom.gov.au/oceanography/projects/ntc/vic_tide_tables.shtml',
  },
  {
    name: 'Geelong',
    state: 'VIC',
    aac: 'VIC_TP006',
    lat: -38.147,
    lon: 144.361,
    timezone: 'Australia/Melbourne',
    location_type: 'primary',
    source_url: 'https://www.bom.gov.au/oceanography/projects/ntc/vic_tide_tables.shtml',
  },
  {
    name: 'Wallaroo',
    state: 'SA',
    aac: 'SA_TP007',
    lat: -33.932,
    lon: 137.633,
    timezone: 'Australia/Adelaide',
    location_type: 'primary',
    source_url: 'https://www.bom.gov.au/oceanography/projects/ntc/tide_tables.shtml',
  },
  {
    name: 'Fremantle',
    state: 'WA',
    aac: 'WA_TP001',
    lat: -32.056,
    lon: 115.743,
    timezone: 'Australia/Perth',
    location_type: 'primary',
    source_url: 'https://www.bom.gov.au/oceanography/projects/ntc/tide_tables.shtml',
  },
  {
    name: 'Stanley',
    state: 'TAS',
    aac: 'TAS_TP008',
    lat: -40.763,
    lon: 145.295,
    timezone: 'Australia/Hobart',
    location_type: 'primary',
    source_url: 'https://www.bom.gov.au/oceanography/projects/ntc/tide_tables.shtml',
  },
  {
    name: 'Darwin',
    state: 'NT',
    aac: 'NT_TP001',
    lat: -12.463,
    lon: 130.845,
    timezone: 'Australia/Darwin',
    location_type: 'primary',
    source_url: 'https://www.bom.gov.au/oceanography/projects/ntc/tide_tables.shtml',
  },
  {
    name: 'Stony Point',
    state: 'VIC',
    aac: 'VIC_TP011',
    lat: -38.373,
    lon: 145.221,
    timezone: 'Australia/Melbourne',
    location_type: 'primary',
    source_url: 'https://www.bom.gov.au/oceanography/projects/ntc/vic_tide_tables.shtml',
  },
  {
    name: 'West Channel Pile',
    state: 'VIC',
    aac: 'VIC_TP145',
    lat: -38.309,
    lon: 144.823,
    timezone: 'Australia/Melbourne',
    location_type: 'secondary',
    source_url: 'https://www.bom.gov.au/oceanography/projects/ntc/vic_tide_tables.shtml',
  },
  {
    name: 'South Channel Pile',
    state: 'VIC',
    aac: 'VIC_TP146',
    lat: -38.306,
    lon: 144.837,
    timezone: 'Australia/Melbourne',
    location_type: 'secondary',
    source_url: 'https://www.bom.gov.au/oceanography/projects/ntc/vic_tide_tables.shtml',
  },
];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const headers = corsHeaders();

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    try {
      if (url.pathname === '/locations') {
        return withCors(await handleLocations(url), headers);
      }
      if (url.pathname === '/resolve-station') {
        return withCors(await handleResolveStation(request, url), headers);
      }
      if (url.pathname === '/observations') {
        return withCors(await handleObservations(url), headers);
      }
      if (url.pathname === '/forecast') {
        return withCors(await handleForecast(url), headers);
      }
      if (url.pathname === '/tides') {
        return withCors(await handleTides(request, url), headers);
      }
      return withCors(json({ error: 'Not found' }, 404), headers);
    } catch (error) {
      return withCors(json({ error: 'Worker error', detail: String(error) }, 500), headers);
    }
  },
};

async function handleLocations(url) {
  const query = (url.searchParams.get('query') ?? '').trim();
  if (!query) {
    return json({ selected: null, locations: [] });
  }
  const searches = buildLocationSearchTerms(query);
  const bucket = [];
  for (const term of searches) {
    const response = await fetch(`${BOM_API_BASE}/v1/locations?search=${encodeURIComponent(term)}`);
    if (!response.ok) continue;
    const payload = await response.json();
    for (const item of payload.data ?? []) {
      bucket.push({
        id: item.id ?? item.geohash ?? '',
        name: item.name ?? '',
        geohash: item.geohash ?? '',
        state: normalizeState(item.state),
        latitude: toNumber(item.latitude),
        longitude: toNumber(item.longitude),
      });
    }
    if (bucket.length > 0) break;
  }
  const locations = dedupeBy(bucket, (x) => x.id || `${x.name}-${x.geohash}`);
  const selected = locations[0] ?? null;
  return json({ selected, locations });
}

async function handleTides(request, url) {
  const lat = toNumber(url.searchParams.get('lat'));
  const lon = toNumber(url.searchParams.get('lon'));
  const state = normalizeState(url.searchParams.get('state'));
  const locationName = normalizeTextCell(url.searchParams.get('locationName') ?? '');
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return json({ error: 'lat/lon required' }, 400);
  }

  const bypassCache = shouldBypassCache(request, url);
  const tideIndex = await loadTideIndex(bypassCache);
  if (!tideIndex || tideIndex.length === 0) {
    return withTideHeaders(json(unavailableTidePayload('BOM tides unavailable', null), 200), 'miss');
  }

  const resolution = await resolveNearestTideStationWithCache(
    { lat, lon, state, locationName, distanceWarningKm: TIDE_DISTANCE_WARNING_KM },
    tideIndex,
    bypassCache,
  );
  if (!resolution.station) {
    return withTideHeaders(json(unavailableTidePayload('BOM tides unavailable', resolution.debug), 200), resolution.cacheStatus);
  }

  const prediction = await fetchTidePredictionWithCache(resolution.station, bypassCache);
  const payload = {
    input: { lat, lon },
    station: {
      name: resolution.station.name,
      state: resolution.station.state,
      distance_km: resolution.distance_km,
      source: 'BOM',
      location_type: resolution.station.location_type,
      aac: resolution.station.aac ?? null,
    },
    selection_method: 'nearest_bom_tide_prediction_location',
    confidence: resolution.confidence,
    warnings: resolution.warnings,
    tides: prediction.tides,
    next_high_time: prediction.tides.find((x) => x.type === 'high')?.datetime ?? null,
    next_low_time: prediction.tides.find((x) => x.type === 'low')?.datetime ?? null,
    tide_state: deriveTideState(prediction.tides),
    current_risk: deriveTideRisk(prediction.tides),
    note: prediction.tides.length > 0 ? 'BOM tide predictions.' : 'Tide data unavailable right now.',
    source_label: `BOM tides · ${resolution.station.name}`,
    as_of: prediction.as_of,
    debug: {
      matched_port: resolution.station.name,
      distance_km: resolution.distance_km,
      source_url: resolution.station.source_url,
      resolver: 'nearest_bom_tide_prediction_location',
      cache: { resolution: resolution.cacheStatus, prediction: prediction.cacheStatus },
    },
  };

  return withTideHeaders(json(payload, 200), `${resolution.cacheStatus}/${prediction.cacheStatus}`);
}

async function loadTideIndex(bypassCache) {
  const cacheKey = new Request(`${BOM_WWW_BASE}/__cache/tides-index-${TIDE_CACHE_VERSION}`, { method: 'GET' });
  if (!bypassCache) {
    const hit = await caches.default.match(cacheKey);
    if (hit) {
      const payload = await hit.json();
      return Array.isArray(payload?.items) ? payload.items : [];
    }
  }
  const items = BOM_TIDE_STATIONS;
  if (!bypassCache) {
    await caches.default.put(cacheKey, createCacheableResponse(json({ items }, 200), TIDE_INDEX_TTL_SECONDS));
  }
  return items;
}

function resolveNearestTideLocation(items, target) {
  const withDistance = items
    .filter((item) => item.lat !== null && item.lon !== null && !item.isTidalStream)
    .map((item) => ({
      ...item,
      distance_m: distanceMeters(target.lat, target.lon, item.lat, item.lon),
      nameScore: scoreNameMatch(item.name, target.locationName),
      stateScore: target.state && item.state === target.state ? 1 : 0,
    }))
    .filter((item) => item.distance_m !== null);

  if (withDistance.length === 0) return null;
  withDistance.sort((a, b) => {
    if (a.stateScore !== b.stateScore) return b.stateScore - a.stateScore;
    if (a.nameScore !== b.nameScore) return b.nameScore - a.nameScore;
    return a.distance_m - b.distance_m;
  });
  return { ...withDistance[0], resolver: 'nearest+state+name' };
}

async function resolveNearestTideStationWithCache(input, stations, bypassCache) {
  const key = `${TIDE_CACHE_VERSION}:tide-resolution:${input.lat.toFixed(3)}:${input.lon.toFixed(3)}:${input.state ?? ''}:${input.distanceWarningKm}`;
  const cacheReq = new Request(`${BOM_WWW_BASE}/__cache/${encodeURIComponent(key)}`, { method: 'GET' });
  if (!bypassCache) {
    const hit = await caches.default.match(cacheReq);
    if (hit) {
      const payload = await hit.json();
      return { ...payload, cacheStatus: 'hit' };
    }
  }
  const resolved = resolveNearestTideLocation(stations, {
    lat: input.lat,
    lon: input.lon,
    state: input.state,
    locationName: input.locationName,
  });
  if (!resolved) {
    return { station: null, distance_km: null, confidence: 'nearest_station_fallback', warnings: [], debug: null, cacheStatus: bypassCache ? 'bypass' : 'miss' };
  }
  const distanceKm = Number(((resolved.distance_m ?? 0) / 1000).toFixed(2));
  const confidence = distanceKm <= 1 ? 'exact_station_match' : 'nearest_station_fallback';
  const warnings = distanceKm > input.distanceWarningKm ? [`Nearest BOM tide station is ${distanceKm} km away.`] : [];
  const payload = { station: resolved, distance_km: distanceKm, confidence, warnings, debug: null };
  if (!bypassCache) {
    await caches.default.put(cacheReq, createCacheableResponse(json(payload, 200), TIDE_RESOLUTION_TTL_SECONDS));
  }
  return { ...payload, cacheStatus: bypassCache ? 'bypass' : 'miss' };
}

async function fetchTidePredictionWithCache(station, bypassCache) {
  const cacheReq = new Request(`${BOM_WWW_BASE}/__cache/tide-prediction/${TIDE_CACHE_VERSION}/${encodeURIComponent(station.aac ?? station.name)}`, { method: 'GET' });
  if (!bypassCache) {
    const hit = await caches.default.match(cacheReq);
    if (hit) {
      const payload = await hit.json();
      return { ...payload, cacheStatus: 'hit' };
    }
  }
  const parsed = await fetchAndParseTidePrediction(station);
  const payload = parsed ? { tides: parsed.tides, as_of: parsed.as_of } : { tides: [], as_of: null };
  if (!bypassCache) {
    await caches.default.put(cacheReq, createCacheableResponse(json(payload, 200), TIDE_PREDICTION_TTL_SECONDS));
  }
  return { ...payload, cacheStatus: bypassCache ? 'bypass' : 'miss' };
}

function scoreNameMatch(name, locationName) {
  if (!locationName) return 0;
  const n = normalizeTextCell(name).toLowerCase();
  const q = normalizeTextCell(locationName).toLowerCase();
  if (n === q) return 3;
  if (n.includes(q) || q.includes(n)) return 2;
  const qBase = q.split(',')[0].trim();
  if (qBase && (n.includes(qBase) || qBase.includes(n))) return 1;
  return 0;
}

async function fetchAndParseTidePrediction(port) {
  try {
    if (!port.aac) return null;
    const tideUrl = buildBomTidePrintUrl(port);
    const response = await fetch(tideUrl);
    if (!response.ok) return null;
    const html = await response.text();
    const rows = extractTideEvents(html);
    if (rows.length < 2) return null;
    const now = Date.now();
    const upcoming = rows.filter((row) => row.timeMs >= now).sort((a, b) => a.timeMs - b.timeMs);
    return {
      tides: upcoming.slice(0, 8).map((row) => ({
        datetime: toIsoWithOffset(new Date(row.timeMs), AEST_OFFSET),
        type: row.type,
        height_m: row.heightM,
      })),
      as_of: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function buildBomTidePrintUrl(port) {
  const tz = port.timezone || 'Australia/Melbourne';
  const region = port.state || 'VIC';
  const aac = port.aac || '';
  return `${BOM_WWW_BASE}/australia/tides/print.php?aac=${encodeURIComponent(aac)}&days=7&region=${encodeURIComponent(
    region,
  )}&type=tide&tz=${encodeURIComponent(tz)}`;
}

function deriveTideState(tides) {
  if (!tides || tides.length === 0) return 'unknown';
  return tides[0].type === 'high' ? 'incoming' : 'outgoing';
}

function deriveTideRisk(tides) {
  if (!tides || tides.length === 0) return 'low';
  const first = tides[0];
  if (first.height_m !== null && first.height_m >= 2.2) return 'moderate';
  return 'low';
}

function toIsoWithOffset(date, offset) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}:${s}${offset}`;
}

function withTideHeaders(response, cacheStatus) {
  const headers = new Headers(response.headers);
  headers.set('x-worker-tide-source', 'bom-tides');
  headers.set('x-tide-cache', cacheStatus);
  return new Response(response.body, { status: response.status, headers });
}

function extractTideEvents(html) {
  const events = [];
  const text = normalizeTextCell(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\r/g, ''),
  );
  const dayBlocks = text.split(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\s+[A-Za-z]{3}/g);
  const dayHeaders = text.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\s+[A-Za-z]{3}/g) ?? [];
  if (dayHeaders.length === 0) return events;

  for (let i = 0; i < dayHeaders.length; i += 1) {
    const day = dayHeaders[i];
    const block = dayBlocks[i + 1] ?? '';
    const eventRegex = /(High|Low)\s+(\d{1,2}:\d{2}\s*[ap]m)\s+(\d+(?:\.\d+)?)\s*m/gi;
    let match = eventRegex.exec(block);
    while (match) {
      const type = match[1].toLowerCase() === 'high' ? 'high' : 'low';
      const timeText = match[2];
      const heightM = toNumber(match[3]);
      const parsed = new Date(`${day} ${new Date().getFullYear()} ${timeText}`);
      if (Number.isFinite(parsed.getTime())) {
        events.push({ type, timeMs: parsed.getTime(), heightM });
      }
      match = eventRegex.exec(block);
    }
  }
  return events;
}

function unavailableTidePayload(sourceLabel, debug) {
  return {
    next_high_time: null,
    next_low_time: null,
    tide_state: 'unknown',
    current_risk: 'low',
    note: 'Tide data unavailable right now.',
    source_label: sourceLabel,
    as_of: null,
    debug: debug ?? undefined,
  };
}

async function handleResolveStation(request, url) {
  const query = (url.searchParams.get('query') ?? '').trim();
  const state = normalizeState(url.searchParams.get('state'));
  if (!query || !state) {
    return jsonWithHeaders({ station: null, candidates: [] }, 400, { 'x-worker-cache': 'bypass' });
  }

  const bypassCache = shouldBypassCache(request, url);
  const cacheKey = buildResolveStationCacheKey(url, query, state);
  if (!bypassCache) {
    const hit = await caches.default.match(cacheKey);
    if (hit) {
      return cloneResponseWithHeaders(hit, { 'x-worker-cache': 'hit' });
    }
  }

  const curated = resolveCuratedCoastalStation(query, state);
  if (curated) {
    const payload = {
      station: {
        id: curated.id,
        geohash: null,
        name: curated.name,
        state: curated.state,
        distance_m: null,
        isMarine: true,
      },
      candidates: [],
    };
    const response = jsonWithHeaders(payload, 200, { 'x-worker-cache': bypassCache ? 'bypass' : 'miss' });
    if (!bypassCache) {
      const cacheResponse = createCacheableResponse(json(payload, 200), RESOLVE_STATION_TTL_SECONDS);
      await caches.default.put(cacheKey, cacheResponse);
    }
    return response;
  }

  const locationSearches = buildLocationSearchTerms(query);
  const locationCandidates = [];
  for (const term of locationSearches) {
    const response = await fetch(`${BOM_API_BASE}/v1/locations?search=${encodeURIComponent(term)}`);
    if (!response.ok) continue;
    const payload = await response.json();
    locationCandidates.push(
      ...(payload.data ?? []).filter((item) => normalizeState(item.state) === state && item.geohash),
    );
    if (locationCandidates.length > 0) break;
  }
  if (locationCandidates.length === 0) {
    return jsonWithHeaders({ station: null, candidates: [] }, 200, {
      'x-worker-cache': bypassCache ? 'bypass' : 'miss',
    });
  }

  const stationCandidates = [];
  for (const item of locationCandidates.slice(0, 8)) {
    const geohash = String(item.geohash ?? '');
    const obsResponse = await fetch(
      `${BOM_API_BASE}/v1/locations/${encodeURIComponent(geohash.slice(0, -1))}/observations`,
    );
    if (!obsResponse.ok) continue;
    const obsPayload = await obsResponse.json();
    const obs = obsPayload.data ?? {};
    const stationName = String(obs.station?.name ?? '').trim();
    const stationId = String(obs.station?.bom_id ?? geohash).trim();
    stationCandidates.push({
      id: stationId || geohash,
      geohash,
      name: stationName || String(item.name ?? ''),
      state,
      distance_m: toNumber(obs.station?.distance),
      isMarine: isMarineName(stationName || String(item.name ?? '')),
    });
  }

  const candidates = dedupeBy(stationCandidates, (x) => x.id).sort((a, b) => {
    if (a.isMarine !== b.isMarine) return a.isMarine ? -1 : 1;
    return (a.distance_m ?? Number.MAX_SAFE_INTEGER) - (b.distance_m ?? Number.MAX_SAFE_INTEGER);
  });

  const payload = {
    station: candidates[0] ?? null,
    candidates: candidates.slice(0, 10),
  };
  const response = jsonWithHeaders(payload, 200, { 'x-worker-cache': bypassCache ? 'bypass' : 'miss' });
  if (!bypassCache && payload.station) {
    const cacheResponse = createCacheableResponse(json(payload, 200), RESOLVE_STATION_TTL_SECONDS);
    await caches.default.put(cacheKey, cacheResponse);
  }
  return response;
}

function buildResolveStationCacheKey(url, query, state) {
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedState = state.toLowerCase().trim();
  const keyUrl = new URL(url.toString());
  keyUrl.pathname = '/__cache/resolve-station';
  keyUrl.search = `k=${encodeURIComponent(`${normalizedQuery}|${normalizedState}`)}`;
  return new Request(keyUrl.toString(), { method: 'GET' });
}

function shouldBypassCache(request, url) {
  const origin = (request.headers.get('origin') ?? '').toLowerCase();
  const host = (request.headers.get('host') ?? url.host ?? '').toLowerCase();
  return (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    host.includes('localhost') ||
    host.includes('127.0.0.1')
  );
}

function createCacheableResponse(response, ttlSeconds) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', `public, max-age=0, s-maxage=${ttlSeconds}`);
  headers.delete('x-worker-cache');
  return new Response(response.body, { status: response.status, headers });
}

function cloneResponseWithHeaders(response, extraHeaders) {
  const clone = response.clone();
  const headers = new Headers(clone.headers);
  Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(clone.body, { status: clone.status, headers });
}

function jsonWithHeaders(data, status = 200, extraHeaders = {}) {
  const response = json(data, status);
  const headers = new Headers(response.headers);
  Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

async function handleObservations(url) {
  const stationId = (url.searchParams.get('stationId') ?? '').trim();
  if (!stationId) return json({ error: 'stationId required' }, 400);

  if (stationId.startsWith('coastal:')) {
    const coastal = CURATED_COASTAL_STATIONS.find((item) => item.id === stationId);
    if (!coastal) {
      return json({ error: 'Unknown coastal station id' }, 404);
    }
    const coastalObs = await fetchCoastalObservationFromJson(coastal);
    if (!coastalObs) {
      return json({ error: 'Coastal observation fetch failed' }, 502);
    }
    return json(coastalObs);
  }

  const geohash = stationId.length > 1 ? stationId.slice(0, -1) : stationId;
  const response = await fetch(`${BOM_API_BASE}/v1/locations/${encodeURIComponent(geohash)}/observations`);
  if (!response.ok) return json({ error: 'Observation fetch failed' }, response.status);
  const payload = await response.json();
  const obs = payload.data ?? {};

  return json({
    observation_time: payload.metadata?.observation_time ?? null,
    temp_air_c: toNumber(obs.temp),
    temp_feels_like_c: toNumber(obs.temp_feels_like),
    wind: {
      speed_knot: toNumber(obs.wind?.speed_knot),
      gust_knot: toNumber(obs.gust?.speed_knot),
      direction: obs.wind?.direction ?? null,
    },
    station: {
      id: String(obs.station?.bom_id ?? ''),
      name: obs.station?.name ?? '',
      distance_m: toNumber(obs.station?.distance),
    },
  });
}

async function fetchCoastalObservationFromJson(station) {
  const jsonUrl = `${BOM_WWW_BASE}/fwo/${station.productPath}.json`;
  const response = await fetch(jsonUrl);
  if (!response.ok) return null;
  const payload = await response.json();
  const first = payload?.observations?.data?.[0];
  if (!first) return null;

  const observationTime = normalizeTextCell(first.local_date_time_full ?? first.local_date_time ?? '');
  const direction = normalizeTextCell(first.wind_dir ?? first.wDir ?? '');
  const speedKnot = firstDefinedNumber(
    toNumber(first.wind_spd_kmh),
    toNumber(first.wind_spd_kt),
    toNumber(first.wind_speed_knot),
  );
  const gustKnot = firstDefinedNumber(
    toNumber(first.gust_kmh),
    toNumber(first.gust_kt),
    toNumber(first.wind_gust_knot),
  );
  const tempAir = firstDefinedNumber(
    toNumber(first.air_temp),
    toNumber(first.temp),
  );
  const tempWater = firstDefinedNumber(
    toNumber(first.sea_temp),
    toNumber(first.water_temp),
    toNumber(first.sea_temperature),
  );

  return {
    observation_time: observationTime || null,
    temp_air_c: tempAir,
    temp_feels_like_c: null,
    temp_water_c: tempWater,
    wind: {
      speed_knot: speedKnot,
      gust_knot: gustKnot,
      direction: direction || null,
    },
    station: {
      id: station.id,
      name: station.name,
      distance_m: null,
    },
  };
}

async function handleForecast(url) {
  const locationId = (url.searchParams.get('locationId') ?? '').trim();
  const state = normalizeState(url.searchParams.get('state'));
  const name = (url.searchParams.get('name') ?? '').trim();
  if (!locationId || !state || !name) return json({ points: [] }, 400);

  const geohash = extractGeohashFromLocationId(locationId);
  if (geohash) {
    const modifiedGeohash = geohash.slice(0, -1);
    const apiUrl = `${BOM_API_BASE}/v1/locations/${encodeURIComponent(modifiedGeohash)}/forecasts/hourly`;
    const response = await fetch(apiUrl);
    if (response.ok) {
      const payload = await response.json();
      const points = (payload.data ?? [])
        .map((item) => {
          const timestamp = item?.time;
          const wind = item?.wind;
          if (!timestamp || !wind) return null;
          const date = new Date(timestamp);
          if (!Number.isFinite(date.getTime())) return null;
          if (!isBomDetailedForecastHour(date)) return null;
          const speedKnot = toNumber(wind.speed_knot);
          if (speedKnot === null) return null;
          return {
            speed_knot: speedKnot,
            direction: normalizeTextCell(wind.direction ?? ''),
            time_iso: date.toISOString(),
          };
        })
        .filter((point) => point !== null);
      if (points.length > 0) {
        return json({ points, source: apiUrl, source_type: 'bom_hourly_api', source_tz: 'UTC' });
      }
    }
  }

  return json({ points: [], source_type: 'none', source_tz: 'UTC' });
}

function extractGeohashFromLocationId(locationId) {
  const match = String(locationId).match(/-([a-z0-9]{6,8})$/i);
  return match ? match[1] : null;
}

function isBomDetailedForecastHour(date) {
  const hours = new Set([1, 4, 7, 10, 13, 16, 19, 22]);
  return date.getMinutes() === 0 && hours.has(date.getHours());
}

function formatHourLabelLocal(date) {
  let hour = date.getHours();
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:00 ${suffix}`;
}

function buildSlugCandidates(name) {
  const base = name.split(',')[0].trim().toLowerCase();
  const normalized = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const stripped = normalized
    .replace(/-(beach|cove|bay|harbour|harbor|point|foreshore|marina|jetty|wharf|island|north|south|east|west)$/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return Array.from(new Set([normalized, stripped].filter(Boolean)));
}

function normalizeState(value) {
  if (!value) return null;
  const v = value.toString().trim().toUpperCase();
  if (['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT'].includes(v)) return v;
  if (v === 'VICTORIA') return 'VIC';
  if (v === 'NEW SOUTH WALES') return 'NSW';
  if (v === 'QUEENSLAND') return 'QLD';
  if (v === 'WESTERN AUSTRALIA') return 'WA';
  if (v === 'SOUTH AUSTRALIA') return 'SA';
  if (v === 'TASMANIA') return 'TAS';
  if (v === 'NORTHERN TERRITORY') return 'NT';
  if (v === 'AUSTRALIAN CAPITAL TERRITORY') return 'ACT';
  return null;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstDefinedNumber(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function resolveCuratedCoastalStation(query, state) {
  const normalized = normalizeTextCell(query).toLowerCase();
  const noState = normalized
    .replace(/\b(vic|victoria|nsw|new south wales|qld|queensland|wa|western australia|sa|south australia|tas|tasmania|nt|northern territory|act|australian capital territory)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    CURATED_COASTAL_STATIONS.find(
      (item) =>
        item.state === state &&
        item.aliases.some((alias) => {
          const a = alias.toLowerCase();
          return normalized.includes(a) || noState.includes(a) || a.includes(noState);
        }),
    ) ?? null
  );
}

function normalizeTextCell(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLocationSearchTerms(query) {
  const normalized = query.replace(/\s+/g, ' ').trim();
  const decomma = normalized.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const base = decomma
    .replace(/\b(vic|victoria|nsw|new south wales|qld|queensland|wa|western australia|sa|south australia|tas|tasmania|nt|northern territory|act|australian capital territory)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(new Set([normalized, decomma, base].filter((x) => x.length > 1)));
}

function isMarineName(name) {
  const n = (name ?? '').toLowerCase();
  const tokens = n.split(/[^a-z]+/g).filter(Boolean);
  return MARINE_KEYWORDS.some((k) => tokens.includes(k));
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  if (lat2 === null || lon2 === null) return null;
  const R = 6371e3;
  const f1 = (lat1 * Math.PI) / 180;
  const f2 = (lat2 * Math.PI) / 180;
  const df = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}

function withCors(response, headers) {
  const merged = new Headers(response.headers);
  Object.entries(headers).forEach(([k, v]) => merged.set(k, v));
  return new Response(response.body, { status: response.status, headers: merged });
}
