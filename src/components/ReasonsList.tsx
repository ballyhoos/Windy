import type { DecisionReason } from '../types/conditions';

type ReasonsListProps = {
  title: string;
  sentence: string;
  reasons: DecisionReason[];
  recommendation: string;
  loading?: boolean;
};

export function ReasonsList({
  title,
  sentence,
  reasons,
  recommendation,
  loading = false,
}: ReasonsListProps) {
  return (
    <section className={`panel ${loading ? 'panel--updating' : ''}`}>
      <h1>{loading ? '---' : title}</h1>
      <p className="lead">{loading ? '---' : sentence}</p>

      <div className="section-label">Reasons</div>
      <ul className="reason-list">
        {(loading ? [{ label: '---' }] : reasons).map((reason) => (
          <li key={reason.label}>{reason.label}</li>
        ))}
      </ul>

      <div className="section-label">Recommendation</div>
      <p>{loading ? '---' : recommendation}</p>
    </section>
  );
}
