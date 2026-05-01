import { useState } from 'react';
import type { HourlyOutlookItem } from '../lib/hourlyOutlook';

type HourlyOutlookProps = {
  items: HourlyOutlookItem[];
  embedded?: boolean;
};

const GRAPH = {
  width: 700,
  height: 220,
  left: 28,
  right: 10,
  top: 14,
  bottom: 38,
};

export function HourlyOutlook({ items, embedded = false }: HourlyOutlookProps) {
  const Wrapper = embedded ? 'div' : 'section';
  const wrapperClass = embedded ? 'hourly-embedded' : 'panel panel--compact';
  const [activeTimestamp, setActiveTimestamp] = useState<string | null>(null);
  const [activeSunMarkerKey, setActiveSunMarkerKey] = useState<string | null>(null);
  const [hoverTideMarkerKey, setHoverTideMarkerKey] = useState<string | null>(null);
  const [pinnedTideMarkerKey, setPinnedTideMarkerKey] = useState<string | null>(null);
  const daylightGradientId = 'hourly-daylight-gradient';
  const nightGradientId = 'hourly-night-gradient';
  const renderWidth = GRAPH.width * 2;

  if (items.length === 0) {
    return (
      <Wrapper className={wrapperClass}>
        <div className="section-label">Outlook (36h)</div>
        <p className="hourly-empty">No hourly outlook available for the next 36 hours.</p>
      </Wrapper>
    );
  }

  const maxWind = Math.max(20, ...items.map((item) => (item.windSpeed === null ? 0 : Math.round(item.windSpeed))));
  const yMax = Math.ceil(maxWind / 5) * 5;
  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, index) =>
    Math.round(yMax - (index * yMax) / yTickCount),
  );
  const xStep = items.length > 1 ? (renderWidth - GRAPH.left - GRAPH.right) / (items.length - 1) : 0;
  const yRange = GRAPH.height - GRAPH.top - GRAPH.bottom;

  const points = items.map((item, index) => {
    const x = GRAPH.left + index * xStep;
    const windKnots = item.windSpeed === null ? null : Math.round(item.windSpeed);
    const y = windKnots === null ? null : GRAPH.top + (1 - windKnots / yMax) * yRange;
    const tideY =
      item.tideLevel === null ? null : GRAPH.top + (1 - (item.tideLevel + 1) / 2) * yRange;
    return { ...item, windKnots, x, y, tideY };
  });
  const daylightSegments = getDaylightSegments(points, xStep, GRAPH.left, renderWidth - GRAPH.right);
  const nightSegments = getNightSegments(points, xStep, GRAPH.left, renderWidth - GRAPH.right);
  const sunTransitions = getSunTransitions(points);

  const hasTideData = points.some((point) => point.tideLevel !== null && point.tideY !== null);
  const tidePath = hasTideData
    ? buildSmoothPath(
        points
          .filter((point): point is typeof point & { tideY: number } => point.tideY !== null)
          .map((point) => ({ x: point.x, y: point.tideY })),
      )
    : '';
  const windPath = buildSmoothPath(
    points
      .filter((point): point is typeof point & { windKnots: number; y: number } => point.windKnots !== null && point.y !== null)
      .map((point) => ({ x: point.x, y: point.y })),
  );
  const tideExtremes = hasTideData ? getTideExtremes(points, GRAPH.top, yRange, xStep) : [];
  const dayBreaks = points
    .map((point, index) => ({ point, index }))
    .filter(({ index, point }) => {
      if (index === 0) {
        return false;
      }
      const prev = new Date(points[index - 1].timestamp);
      const curr = new Date(point.timestamp);
      return prev.toDateString() !== curr.toDateString();
    });
  const activePoint = points.find((point) => point.timestamp === activeTimestamp && point.windKnots !== null) ?? null;
  const activeSunMarker =
    sunTransitions.find((transition) => transition.key === activeSunMarkerKey) ?? null;
  const activeTideMarkerKey = pinnedTideMarkerKey ?? hoverTideMarkerKey;
  const activeTideMarker =
    tideExtremes.find((extreme) => extreme.key === activeTideMarkerKey) ?? null;
  const graphBounds = {
    minX: GRAPH.left,
    maxX: renderWidth - GRAPH.right,
    minY: GRAPH.top,
    maxY: GRAPH.height - GRAPH.bottom,
  };
  const windTooltipPlacement = activePoint
    ? getTooltipPlacement({
        anchorX: activePoint.x,
        anchorY: activePoint.y ?? GRAPH.top + yRange,
        tooltipWidth: 84,
        tooltipHeight: 24,
        graphBounds,
        gap: 8,
        belowExtraOffset: 8,
        preferredSide: 'above',
      })
    : null;
  const sunTooltipPlacement = activeSunMarker
    ? getTooltipPlacement({
        anchorX: activeSunMarker.x,
        anchorY: GRAPH.top + 16,
        tooltipWidth: 136,
        tooltipHeight: 22,
        graphBounds,
        gap: 8,
        belowExtraOffset: 8,
        preferredSide: 'below',
      })
    : null;
  const tideTooltipPlacement = activeTideMarker
    ? getTooltipPlacement({
        anchorX: activeTideMarker.x,
        anchorY: activeTideMarker.y,
        tooltipWidth: 140,
        tooltipHeight: 24,
        graphBounds,
        gap: 8,
        belowExtraOffset: 10,
        preferredSide: activeTideMarker.type === 'high' ? 'below' : 'above',
      })
    : null;

  return (
    <Wrapper className={wrapperClass}>
      <div className="hourly-scroll" aria-label="Scrollable 36-hour outlook">
        <svg
          className="hourly-graph"
          viewBox={`0 0 ${renderWidth} ${GRAPH.height}`}
          style={{ width: `${renderWidth}px`, height: `${GRAPH.height}px` }}
          role="img"
          aria-label="Hourly wind speed outlook with traffic-light status points"
        >
        <defs>
          <linearGradient id={nightGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1f4e9e" stopOpacity="0" />
            <stop offset="18%" stopColor="#1f4e9e" stopOpacity="0.12" />
            <stop offset="50%" stopColor="#1f4e9e" stopOpacity="0.24" />
            <stop offset="82%" stopColor="#1f4e9e" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#1f4e9e" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={daylightGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffea00" stopOpacity="0" />
            <stop offset="18%" stopColor="#ffea00" stopOpacity="0.24" />
            <stop offset="50%" stopColor="#ffea00" stopOpacity="0.42" />
            <stop offset="82%" stopColor="#ffea00" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#ffea00" stopOpacity="0" />
          </linearGradient>
        </defs>

        {nightSegments.map((segment) => (
          <rect
            key={`night-${segment.start}-${segment.end}`}
            x={segment.start}
            y={GRAPH.height - GRAPH.bottom}
            width={Math.max(0, segment.end - segment.start)}
            height={GRAPH.bottom}
            fill={`url(#${nightGradientId})`}
            className="hourly-night-band"
          />
        ))}

        {daylightSegments.map((segment) => (
          <rect
            key={`daylight-${segment.start}-${segment.end}`}
            x={segment.start}
            y={GRAPH.height - GRAPH.bottom}
            width={Math.max(0, segment.end - segment.start)}
            height={GRAPH.bottom}
            fill={`url(#${daylightGradientId})`}
            className="hourly-daylight-band"
          />
        ))}

        {points.map((point) => (
          <line
            key={`time-guide-${point.timestamp}`}
            x1={point.x}
            y1={GRAPH.top}
            x2={point.x}
            y2={GRAPH.height - GRAPH.bottom}
            className="hourly-time-guide"
          />
        ))}

        {yTicks.map((tick) => {
          const y = GRAPH.top + (1 - tick / yMax) * yRange;
          return (
            <text
              key={`y-tick-${tick}`}
              x={GRAPH.left - 6}
              y={y}
              className="hourly-y-label"
            >
              {tick}
            </text>
          );
        })}

        {sunTransitions.map((transition) => (
          <g key={`sun-transition-${transition.key}`}>
            <line
              x1={transition.x}
              y1={GRAPH.top}
              x2={transition.x}
              y2={GRAPH.height - GRAPH.bottom}
              className={`hourly-sun-marker hourly-sun-marker--${transition.type}`}
            />
            <line
              x1={transition.x}
              y1={GRAPH.top}
              x2={transition.x}
              y2={GRAPH.height - GRAPH.bottom}
              className="hourly-sun-marker-hitbox"
              onMouseEnter={() => setActiveSunMarkerKey(transition.key)}
              onMouseLeave={() => setActiveSunMarkerKey(null)}
              onClick={() => setActiveSunMarkerKey(transition.key)}
              onFocus={() => setActiveSunMarkerKey(transition.key)}
              onBlur={() => setActiveSunMarkerKey(null)}
              tabIndex={0}
            />
          </g>
        ))}

        {dayBreaks.map(({ point }) => (
          <line
            key={`day-break-${point.timestamp}`}
            x1={point.x}
            y1={GRAPH.top}
            x2={point.x}
            y2={GRAPH.height - GRAPH.bottom}
            className="hourly-day-separator"
          />
        ))}

        {hasTideData && tidePath && <path d={tidePath} className="hourly-tide-line" />}
        {tideExtremes.map((extreme) => (
          <g
            key={`tide-extreme-${extreme.key}`}
            className={`hourly-tide-extreme hourly-tide-extreme--${extreme.type}`}
          >
            <circle className="hourly-tide-extreme-dot" cx={extreme.x} cy={extreme.y} r={3.2} />
            <circle
              cx={extreme.x}
              cy={extreme.y}
              r={11}
              className="hourly-tide-extreme-hitbox"
              onMouseEnter={() => setHoverTideMarkerKey(extreme.key)}
              onMouseLeave={() => setHoverTideMarkerKey(null)}
              onClick={() =>
                setPinnedTideMarkerKey((current) => (current === extreme.key ? null : extreme.key))
              }
              onFocus={() => setHoverTideMarkerKey(extreme.key)}
              onBlur={() => setHoverTideMarkerKey(null)}
              tabIndex={0}
            />
          </g>
        ))}
        {windPath && <path d={windPath} className="hourly-line hourly-line--wind" />}

        {points.map((point) =>
          point.windKnots === null ? null : point.windKnots <= 0 ? (
            <circle
              key={point.timestamp}
              cx={point.x}
              cy={point.y ?? GRAPH.top + yRange}
              r={4}
              className={`hourly-point ${point.isInterpolatedWind ? 'hourly-point--interpolated' : `hourly-point--${point.status}`}`}
              onMouseEnter={() => setActiveTimestamp(point.timestamp)}
              onMouseLeave={() => setActiveTimestamp(null)}
              onClick={() => setActiveTimestamp(point.timestamp)}
              onFocus={() => setActiveTimestamp(point.timestamp)}
              onBlur={() => setActiveTimestamp(null)}
              tabIndex={0}
            >
              <title>{`${formatHour(point.timestamp)}: calm (${point.status})`}</title>
            </circle>
          ) : (
            <g
              key={point.timestamp}
              transform={`translate(${point.x} ${point.y ?? GRAPH.top + yRange}) rotate(${point.windDirectionDegrees + 180})`}
              className={`hourly-point ${point.isInterpolatedWind ? 'hourly-point--interpolated' : `hourly-point--${point.status}`}`}
              onMouseEnter={() => setActiveTimestamp(point.timestamp)}
              onMouseLeave={() => setActiveTimestamp(null)}
              onClick={() => setActiveTimestamp(point.timestamp)}
              onFocus={() => setActiveTimestamp(point.timestamp)}
              onBlur={() => setActiveTimestamp(null)}
              tabIndex={0}
            >
              <polygon points="0,-8 5,6 -5,6" className="hourly-point-marker" />
              <title>{`${formatHour(point.timestamp)}: ${point.windKnots} kn ${Math.round(
                point.windDirectionDegrees,
              )}° (${point.status})`}</title>
            </g>
          ),
        )}

        {points.map((point) => (
          <text key={`label-${point.timestamp}`} x={point.x} y={GRAPH.height - 16} className="hourly-label">
            {formatHour(point.timestamp)}
          </text>
        ))}

        {activePoint && (
          <g
            className={`hourly-tooltip ${activePoint.isInterpolatedWind ? 'hourly-tooltip--interpolated' : `hourly-tooltip--${activePoint.status}`}`}
            transform={`translate(${windTooltipPlacement?.x ?? 0} ${windTooltipPlacement?.y ?? 0})`}
          >
            <rect x={-42} y={-18} width={84} height={24} rx={12} ry={12} />
            <text x={0} y={-6} className="hourly-tooltip-text">
              {`${activePoint.windKnots} kn ${degreesToCardinal(activePoint.windDirectionDegrees)}`}
            </text>
          </g>
        )}

        {activeSunMarker && (
          <g
            className="hourly-sun-tooltip"
            transform={`translate(${sunTooltipPlacement?.x ?? 0} ${sunTooltipPlacement?.y ?? 0})`}
          >
            <rect x={-68} y={-16} width={136} height={22} rx={11} ry={11} />
            <text x={0} y={-5} className="hourly-sun-tooltip-text">
              {`${activeSunMarker.type === 'sunrise' ? 'Sunrise' : 'Sunset'} ${formatSunTime(
                activeSunMarker.timestamp,
              )}`}
            </text>
          </g>
        )}

        {activeTideMarker && (
          <g
            className="hourly-tide-tooltip"
            transform={`translate(${tideTooltipPlacement?.x ?? 0} ${tideTooltipPlacement?.y ?? 0})`}
          >
            <rect x={-70} y={-18} width={140} height={24} rx={12} ry={12} />
            <text x={0} y={-6} className="hourly-tide-tooltip-text">
              {`${activeTideMarker.type === 'high' ? 'High Tide' : 'Low Tide'} ${formatExactTime(
                activeTideMarker.timestamp,
              )}`}
            </text>
          </g>
        )}
        </svg>
      </div>
    </Wrapper>
  );
}

function getDaylightSegments(
  points: Array<{ x: number; isDaylight: boolean }>,
  xStep: number,
  minX: number,
  maxX: number,
): Array<{ start: number; end: number }> {
  if (points.length === 0) {
    return [];
  }

  const segments: Array<{ start: number; end: number }> = [];
  let segmentStartIndex: number | null = null;

  for (let i = 0; i < points.length; i += 1) {
    const isActive = points[i].isDaylight;

    if (isActive && segmentStartIndex === null) {
      segmentStartIndex = i;
    }

    const isSegmentEnd =
      segmentStartIndex !== null &&
      (!isActive || i === points.length - 1);

    if (isSegmentEnd) {
      const startIndex = segmentStartIndex;
      if (startIndex === null) {
        continue;
      }
      const endIndex = isActive ? i : i - 1;
      const startPoint = points[startIndex];
      const endPoint = points[endIndex];
      const halfStep = xStep > 0 ? xStep / 2 : 10;
      segments.push({
        start: clamp(startPoint.x - halfStep, minX, maxX),
        end: clamp(endPoint.x + halfStep, minX, maxX),
      });
      segmentStartIndex = null;
    }
  }

  return segments;
}

function getNightSegments(
  points: Array<{ x: number; isDaylight: boolean }>,
  xStep: number,
  minX: number,
  maxX: number,
): Array<{ start: number; end: number }> {
  return getDaylightSegments(
    points.map((point) => ({ ...point, isDaylight: !point.isDaylight })),
    xStep,
    minX,
    maxX,
  );
}

function getSunTransitions(
  points: Array<{
    timestamp: string;
    x: number;
    isDaylight: boolean;
    sunriseTimestamp: string | null;
    sunsetTimestamp: string | null;
  }>,
): Array<{ key: string; x: number; type: 'sunrise' | 'sunset'; timestamp: string }> {
  const transitions: Array<{ key: string; x: number; type: 'sunrise' | 'sunset'; timestamp: string }> = [];

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];

    if (prev.isDaylight === curr.isDaylight) {
      continue;
    }

    transitions.push({
      key: `${curr.isDaylight ? 'sunrise' : 'sunset'}-${curr.x.toFixed(2)}`,
      x: (prev.x + curr.x) / 2,
      type: curr.isDaylight ? 'sunrise' : 'sunset',
      timestamp:
        (curr.isDaylight ? curr.sunriseTimestamp : prev.sunsetTimestamp) ??
        (curr.isDaylight ? curr.timestamp : prev.timestamp),
    });
  }

  return transitions;
}

function getTideExtremes(
  points: Array<{ timestamp: string; x: number; tideY: number | null; tideLevel: number | null }>,
  graphTop: number,
  yRange: number,
  xStep: number,
): Array<{ key: string; timestamp: string; x: number; y: number; type: 'high' | 'low' }> {
  const tidePoints = points.filter(
    (point): point is { timestamp: string; x: number; tideY: number; tideLevel: number } =>
      point.tideY !== null && point.tideLevel !== null,
  );
  if (tidePoints.length < 3) {
    return [];
  }

  const output: Array<{ key: string; timestamp: string; x: number; y: number; type: 'high' | 'low' }> = [];

  for (let i = 1; i < tidePoints.length - 1; i += 1) {
    const prev = tidePoints[i - 1];
    const curr = tidePoints[i];
    const next = tidePoints[i + 1];
    const isHigh = curr.tideLevel >= prev.tideLevel && curr.tideLevel > next.tideLevel;
    const isLow = curr.tideLevel <= prev.tideLevel && curr.tideLevel < next.tideLevel;

    if (!isHigh && !isLow) {
      continue;
    }

    const numerator = prev.tideLevel - next.tideLevel;
    const denominator = prev.tideLevel - 2 * curr.tideLevel + next.tideLevel;
    const offset = denominator === 0 ? 0 : clamp(0.5 * (numerator / denominator), -0.5, 0.5);
    const refinedX = curr.x + offset * xStep;
    const refinedLevel =
      curr.tideLevel - 0.25 * (prev.tideLevel - next.tideLevel) * offset;
    const refinedY = graphTop + (1 - (refinedLevel + 1) / 2) * yRange;
    const refinedTimestamp = new Date(
      new Date(curr.timestamp).getTime() + offset * 60 * 60 * 1000,
    ).toISOString();

    output.push({
      key: `${isHigh ? 'high' : 'low'}-${refinedTimestamp}`,
      timestamp: refinedTimestamp,
      x: refinedX,
      y: refinedY,
      type: isHigh ? 'high' : 'low',
    });
  }

  return output;
}

function formatSunTime(value: string): string {
  return new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(new Date(value))
    .replace(/\s+/g, '');
}

function formatExactTime(value: string): string {
  return new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(new Date(value))
    .replace(/\s+/g, '');
}

function formatHour(value: string): string {
  const parts = new Intl.DateTimeFormat([], {
    hour: 'numeric',
    hour12: true,
  }).formatToParts(new Date(value));
  return parts.find((part) => part.type === 'hour')?.value ?? '';
}

function degreesToCardinal(degrees: number): string {
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return cardinals[Math.round(degrees / 45) % 8];
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  const tension = 0.22;
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path;
}

function getTooltipPlacement(input: {
  anchorX: number;
  anchorY: number;
  tooltipWidth: number;
  tooltipHeight: number;
  graphBounds: { minX: number; maxX: number; minY: number; maxY: number };
  gap: number;
  belowExtraOffset?: number;
  preferredSide: 'above' | 'below';
}): { x: number; y: number } {
  const halfWidth = input.tooltipWidth / 2;
  const halfHeight = input.tooltipHeight / 2;
  const minCenterX = input.graphBounds.minX + halfWidth;
  const maxCenterX = input.graphBounds.maxX - halfWidth;
  const x = clamp(input.anchorX, minCenterX, maxCenterX);

  const aboveY = input.anchorY - input.gap - halfHeight;
  const belowExtra = input.belowExtraOffset ?? 0;
  const belowY = input.anchorY + input.gap + halfHeight + belowExtra;
  const minCenterY = input.graphBounds.minY + halfHeight;
  const maxCenterY = input.graphBounds.maxY - halfHeight;
  const canPlaceAbove = aboveY >= minCenterY;
  const canPlaceBelow = belowY <= maxCenterY;

  let y: number;
  if (input.preferredSide === 'above') {
    if (canPlaceAbove) {
      y = aboveY;
    } else if (canPlaceBelow) {
      y = belowY;
    } else {
      y = clamp(aboveY, minCenterY, maxCenterY);
    }
  } else if (canPlaceBelow) {
    y = belowY;
  } else if (canPlaceAbove) {
    y = aboveY;
  } else {
    y = clamp(belowY, minCenterY, maxCenterY);
  }

  return { x, y };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
