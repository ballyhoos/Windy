import type { PaddleConditions } from '../types/conditions';

type ConditionGridProps = {
  conditions: PaddleConditions;
};

export function ConditionGrid({ conditions }: ConditionGridProps) {
  const { marine, tide, sun } = conditions;

  const items = [
    ['Wind', marine.wind.speedKmh !== null ? `${marine.wind.speedKmh} km/h` : 'Unavailable'],
    ['Gusts', marine.wind.gustKmh !== null ? `${marine.wind.gustKmh} km/h` : 'Unavailable'],
    ['Direction', `${marine.wind.cardinal} • ${formatShoreRelation(marine.wind.shoreRelation)}`],
    ['Air temp', marine.airTempC !== null ? `${marine.airTempC}°C` : 'Unavailable'],
    ['Water temp', marine.waterTempC !== null ? `${marine.waterTempC}°C` : 'Unavailable'],
    ['Tide', `${capitalize(tide.state)} • ${tide.note}`],
    ['Sunrise / sunset', `${formatTime(sun.sunrise)} / ${formatTime(sun.sunset)}`],
    ['Swell / waves', marine.swellHeightM !== null ? `${marine.swellHeightM.toFixed(1)} m` : 'Unavailable'],
  ];

  return (
    <section className="panel">
      <div className="section-label">Conditions</div>
      <div className="condition-grid">
        {items.map(([label, value]) => (
          <article key={label} className="condition-tile">
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatTime(value: string | null): string {
  if (!value) {
    return '--';
  }

  return new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatShoreRelation(value: string): string {
  if (value === 'cross-shore') {
    return 'Cross-shore';
  }
  return capitalize(value);
}
