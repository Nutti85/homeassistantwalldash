import type { BriefingItem, BriefingViewModel } from './briefingModel';

const BriefingIcon = ({ name }: { name: string }) => <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;

function BriefingMetric({ item }: { item: BriefingItem<'weather' | 'temperature' | 'wind' | 'rain' | 'clothing'> }) {
  return <article className={`briefing-metric briefing-tone-${item.tone}`} data-testid="briefing-metric" data-metric={item.id}>
    <BriefingIcon name={item.icon}/>
    <div className="briefing-metric-copy"><span>{item.label}</span><strong>{item.value}</strong><small>{item.context}</small></div>
  </article>;
}

function BriefingPractical({ item }: { item: BriefingItem<'calendar' | 'travel' | 'school' | 'kindergarten' | 'home' | 'warnings'> }) {
  return <section className={`briefing-practical briefing-tone-${item.tone}`} data-testid="briefing-practical" data-practical={item.id}>
    <h3><BriefingIcon name={item.icon}/>{item.label}</h3>
    <strong>{item.value}</strong>
    <small>{item.context}</small>
  </section>;
}

export function BriefingOverview({ model, compact = false }: { model: BriefingViewModel; compact?: boolean }) {
  return <div className={`briefing-overview${compact ? ' is-compact' : ''}`}>
    <p className="briefing-period"><BriefingIcon name="schedule"/>{model.period.label}</p>
    <div className="briefing-metrics" aria-label="Vær og klær">
      {model.metrics.map((item) => <BriefingMetric key={item.id} item={item}/>) }
    </div>
    {!compact && <div className="briefing-practical-grid" data-testid="briefing-practical-grid" aria-label="Praktisk oversikt">
      {model.practical.map((item) => <BriefingPractical key={item.id} item={item}/>) }
    </div>}
  </div>;
}
