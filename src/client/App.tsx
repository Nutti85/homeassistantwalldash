import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import QRCode from 'qrcode';
import type { DashboardAction, FanSpeed, HeatPumpMode, HomeAssistantState } from '../shared/entities';
import * as browserApi from './api';
import {
  conditionIcon, conditionLabel, currentTemperatureNumber, forecastPoints, isRepairNeeded,
  securityPresentation, stateValue, temperatureNumber, type ForecastPoint,
} from './dashboardModel';

export interface DashboardApi {
  getStates(): Promise<{ states: Record<string, HomeAssistantState> }>;
  runAction(action: DashboardAction, option?: 'Hjemme' | 'Borte' | HeatPumpMode | FanSpeed): Promise<{ states: Record<string, HomeAssistantState> }>;
  setTemperature(temperature: number): Promise<{ states: Record<string, HomeAssistantState> }>;
}

type Mode = 'regular' | 'guest' | 'child';
type WeatherTab = 'today' | 'week';
type GridPlacement = { column: number; row: number; columns: number; rows: number };
type GridLayouts = Record<string, GridPlacement>;
const updateError = 'Kunne ikke oppdatere smarthuset. Prøv igjen.';
const Icon = ({ children, filled = false }: { children: string; filled?: boolean }) => <span className="material-symbols-outlined" style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined} aria-hidden="true">{children}</span>;
const fmt = (value: number | undefined, unit = '') => value === undefined ? '—' : `${value.toLocaleString('nb-NO', { maximumFractionDigits: 1 })}${unit}`;

const WeatherGlyph = ({ condition, large = false }: { condition?: string; large?: boolean }) => (
  <Icon filled={conditionIcon(condition) === 'sunny'}>{conditionIcon(condition)}</Icon>
);

function ModeSelector({ mode, setMode }: { mode: Mode; setMode: (mode: Mode) => void }) {
  return <div className="mode-selector" role="tablist" aria-label="Dashboardmodus">
    {([
      ['regular', 'home', 'Full'], ['guest', 'person', 'Gjest'], ['child', 'child_care', 'Barn'],
    ] as const).map(([value, icon, label]) => <button key={value} type="button" role="tab" aria-selected={mode === value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)}><Icon filled={mode === value}>{icon}</Icon>{label}{mode === value && <Icon>check</Icon>}</button>)}
  </div>;
}

function DashboardHeader({ mode, setMode, repair, openRepair, repairRef, editing, setEditing, resetLayout }: { mode: Mode; setMode: (mode: Mode) => void; repair: boolean; openRepair: () => void; repairRef: React.RefObject<HTMLButtonElement>; editing: boolean; setEditing: (editing: boolean) => void; resetLayout: () => void }) {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setTime(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  const status = mode === 'guest' ? 'Velkommen! Gjestemodus er aktiv.' : mode === 'child' ? 'Hei! Velg hva huset skal gjøre.' : repair ? 'Hei! Huset trenger tilsyn.' : 'Hei! Alt er i orden med smarthuset.';
  return <header className="dashboard-header">
    <div className="header-identity">
      <div className="brand">Smarthjem</div>
      <div className="context"><span>{status}</span>{repair && mode === 'regular' && <button ref={repairRef} type="button" className="repair-inline" onClick={openRepair}><Icon>build</Icon>Reparer smarthuset</button>}</div>
    </div>
    <ModeSelector mode={mode} setMode={setMode} />
    <div className="layout-actions"><button type="button" className={editing ? 'selected' : ''} aria-label={editing ? 'Fullfør tilpassing av oppsett' : 'Tilpass oppsett'} title={editing ? 'Fullfør' : 'Tilpass oppsett'} aria-pressed={editing} onClick={() => setEditing(!editing)}><Icon>dashboard_customize</Icon></button>{editing && <><button type="button" className="reset-layout" onClick={resetLayout}>Tilbakestill</button><span className="layout-hint" role="status">Dra kort med håndtaket · endre størrelse nederst til høyre</span></>}</div>
    <time dateTime={time.toISOString()}>{time.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</time>
  </header>;
}

const defaultLayouts: Record<Mode, GridLayouts> = {
  regular: { access: { column: 1, row: 1, columns: 4, rows: 1 }, weather: { column: 5, row: 1, columns: 8, rows: 2 }, doorbell: { column: 1, row: 2, columns: 4, rows: 2 }, scenes: { column: 5, row: 3, columns: 3, rows: 1 }, heatpump: { column: 8, row: 3, columns: 5, rows: 1 }, metrics: { column: 1, row: 4, columns: 12, rows: 1 } },
  guest: { guest: { column: 1, row: 1, columns: 4, rows: 1 }, weather: { column: 5, row: 1, columns: 8, rows: 1 }, scenes: { column: 1, row: 2, columns: 8, rows: 1 }, heatpump: { column: 1, row: 3, columns: 8, rows: 2 }, wifi: { column: 9, row: 2, columns: 4, rows: 3 } },
  child: { guest: { column: 1, row: 1, columns: 5, rows: 1 }, weather: { column: 6, row: 1, columns: 7, rows: 1 }, scenes: { column: 1, row: 2, columns: 12, rows: 2 }, heatpump: { column: 1, row: 4, columns: 12, rows: 1 } },
};
const layoutKey = (mode: Mode) => `smarthjem-layout-v1-${mode}`;
const clampPlacement = (placement: GridPlacement): GridPlacement => {
  const columns = Math.max(1, Math.min(12, placement.columns)); const rows = Math.max(1, Math.min(8, placement.rows));
  return { columns, rows, column: Math.max(1, Math.min(13 - columns, placement.column)), row: Math.max(1, Math.min(9 - rows, placement.row)) };
};
const loadLayout = (mode: Mode): GridLayouts => {
  try { const saved = JSON.parse(window.localStorage.getItem(layoutKey(mode)) ?? '{}') as GridLayouts; return Object.fromEntries(Object.entries(defaultLayouts[mode]).map(([id, fallback]) => [id, saved[id] ? clampPlacement(saved[id]) : fallback])); } catch { return defaultLayouts[mode]; }
};

function EditableDashboard({ mode, editing, layout, updateLayout, children }: { mode: Mode; editing: boolean; layout: GridLayouts; updateLayout: (id: string, next: GridPlacement) => void; children: Array<{ id: string; label: string; content: ReactElement }> }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; type: 'move' | 'resize'; startX: number; startY: number; placement: GridPlacement } | null>(null);
  const start = (event: ReactPointerEvent<HTMLButtonElement>, id: string, type: 'move' | 'resize') => { if (!editing || !layout[id]) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id, type, startX: event.clientX, startY: event.clientY, placement: layout[id] }; };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => { const active = drag.current; const rect = gridRef.current?.getBoundingClientRect(); if (!active || !rect) return; const x = Math.round((event.clientX - active.startX) / (rect.width / 12)); const y = Math.round((event.clientY - active.startY) / (rect.height / 4)); const next = active.type === 'move' ? { ...active.placement, column: active.placement.column + x, row: active.placement.row + y } : { ...active.placement, columns: active.placement.columns + x, rows: active.placement.rows + y }; updateLayout(active.id, clampPlacement(next)); };
  const end = () => { drag.current = null; };
  return <div ref={gridRef} className={`${mode}-layout editable-dashboard ${editing ? 'is-editing' : ''}`} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>{children.map(({ id, label, content }) => { const placement = layout[id]; const style = editing ? { gridArea: 'auto', gridColumn: `${placement.column} / span ${placement.columns}`, gridRow: `${placement.row} / span ${placement.rows}` } as CSSProperties : undefined; return <div className="layout-item" data-layout-id={id} key={id} style={style}>{content}{editing && <><button type="button" className="drag-handle" aria-label={`Flytt ${label}`} title={`Flytt ${label}`} onPointerDown={(event) => start(event, id, 'move')}><Icon>drag_indicator</Icon><span>{label}</span></button><button type="button" className="resize-handle" aria-label={`Endre størrelse på ${label}`} title={`Endre størrelse på ${label}`} onPointerDown={(event) => start(event, id, 'resize')}><Icon>open_in_full</Icon></button></>}</div>; })}</div>;
}

function WeatherChart({ points, detailed = false }: { points: ForecastPoint[]; detailed?: boolean }) {
  const data = points.slice(0, detailed ? 25 : 22);
  const temperatures = data.map((point) => point.temperature);
  const winds = data.map((point) => point.windSpeed);
  const gusts = data.map((point) => point.windGustSpeed);
  const probabilities = data.map((point) => point.precipitationProbability);
  const clouds = data.map((point) => point.cloudCoverage);
  const temperatureValues = temperatures.filter((value): value is number => value !== undefined);
  const windValues = [...winds, ...gusts].filter((value): value is number => value !== undefined);
  const precipitationValues = data.map((point) => point.precipitation).filter((value): value is number => value !== undefined);
  const min = temperatureValues.length ? Math.floor(Math.min(...temperatureValues) - 2) : 0;
  const max = temperatureValues.length ? Math.ceil(Math.max(...temperatureValues) + 2) : 25;
  const windMax = Math.max(2.5, ...windValues);
  const precipitationMax = Math.max(1, ...precipitationValues);
  const width = 900;
  const height = detailed ? 220 : 150;
  const plot = detailed
    ? { left: 80, right: 96, top: 6, bottom: 25 }
    : { left: 80, right: 96, top: 4, bottom: 21 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const pathFor = (values: Array<number | undefined>, rangeMin: number, rangeMax: number) => values.map((value, index) => {
    if (value === undefined) return '';
    const x = plot.left + (values.length < 2 ? 0 : index * plotWidth / (values.length - 1));
    const y = plot.top + plotHeight - ((value - rangeMin) / Math.max(rangeMax - rangeMin, 1)) * plotHeight;
    return `${index === 0 || values[index - 1] === undefined ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  const tempPath = pathFor(temperatures, min, max);
  const windPath = pathFor(winds, 0, windMax);
  const gustPath = pathFor(gusts, 0, windMax);
  const probabilityPath = pathFor(probabilities, 0, 100);
  const cloudPath = pathFor(clouds, 0, 100);
  const ticks = [0, .25, .5, .75, 1];
  const timeStep = Math.max(1, Math.floor((data.length - 1) / 7));
  const timeIndexes = data.map((_, index) => index).filter((index) => index % timeStep === 0 || index === data.length - 1);
  return <div className="weather-chart-wrap">
    <div className="chart-legend" aria-label="Tegnforklaring"><span className="temp">Temperatur</span><span className="rain">Nedbør</span><span className="probability">Sannsynlighet</span><span className="wind">Vind</span><span className="gust">Kast</span><span className="cloud">Skydekke</span></div>
    {data.length ? <svg className="weather-chart" role="img" aria-label="Samlet graf for temperatur, nedbør, nedbørssannsynlighet, vind, vindkast og skydekke" viewBox={`0 0 ${width} ${height + 28}`} preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id={`temperature-fill-${detailed}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4b17b" stopOpacity=".62"/><stop offset="1" stopColor="#f4b17b" stopOpacity=".08"/></linearGradient><linearGradient id={`cloud-fill-${detailed}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#aeb4b3" stopOpacity=".2"/><stop offset="1" stopColor="#aeb4b3" stopOpacity=".02"/></linearGradient></defs>
      {ticks.map((ratio) => { const y = plot.top + ratio * plotHeight; const temperature = max - ratio * (max - min); const rain = precipitationMax * (1 - ratio); const percent = Math.round(100 - ratio * 100); const wind = windMax * (1 - ratio); return <g key={ratio}><line x1={plot.left} x2={width - plot.right} y1={y} y2={y} className="gridline" /><text className="axis-label axis-left" x={plot.left - 8} y={y + 4}><tspan>{temperature.toFixed(0)}°</tspan><tspan className="axis-rain-value"> · {rain.toFixed(1)} mm</tspan></text><text className="axis-label axis-right" x={width - plot.right + 8} y={y + 4}><tspan>{percent}%</tspan><tspan className="axis-wind-value"> · {wind.toFixed(1)} m/s</tspan></text></g>; })}
      {cloudPath && <><path className="cloud-area" fill={`url(#cloud-fill-${detailed})`} d={`${cloudPath} L ${width - plot.right} ${plot.top + plotHeight} L ${plot.left} ${plot.top + plotHeight} Z`}/><path className="cloud-line" d={cloudPath}/></>}
      {data.map((point, index) => point.precipitation !== undefined && <rect key={point.datetime} className="rainbar" x={plot.left + index * plotWidth / data.length + 2} y={plot.top + plotHeight - Math.min(point.precipitation / precipitationMax * plotHeight, plotHeight)} width={Math.max(4, plotWidth / data.length - 5)} height={Math.min(point.precipitation / precipitationMax * plotHeight, plotHeight)} />)}
      {tempPath && <><path className="temperature-area" d={`${tempPath} L ${width - plot.right} ${plot.top + plotHeight} L ${plot.left} ${plot.top + plotHeight} Z`} /><path className="temperature-line" d={tempPath} /></>}
      {probabilityPath && <path className="probability-line" d={probabilityPath}/>} 
      {windPath && <path className="wind-line" d={windPath} />}
      {gustPath && <path className="gust-line" d={gustPath}/>} 
      {timeIndexes.map((index) => { const point = data[index]; const x = plot.left + (data.length < 2 ? 0 : index * plotWidth / (data.length - 1)); return <text className="time-label" key={point.datetime} x={x} y={height + 19}>{new Date(point.datetime).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</text>; })}
    </svg> : <div className="chart-empty">— <span>Værgraf ikke tilgjengelig</span></div>}
    <table className="sr-only"><caption>Værdata</caption><thead><tr><th>Tid</th><th>Temperatur</th><th>Nedbør</th><th>Sannsynlighet</th><th>Vind</th><th>Vindkast</th><th>Skydekke</th></tr></thead><tbody>{data.map((point) => <tr key={point.datetime}><td>{point.datetime}</td><td>{fmt(point.temperature, ' °C')}</td><td>{fmt(point.precipitation, ' mm')}</td><td>{fmt(point.precipitationProbability, ' %')}</td><td>{fmt(point.windSpeed, ' m/s')}</td><td>{fmt(point.windGustSpeed, ' m/s')}</td><td>{fmt(point.cloudCoverage, ' %')}</td></tr>)}</tbody></table>
  </div>;
}

type WeatherMetric = 'temperature' | 'precipitation' | 'wind' | 'cloud';

const metricValue = (point: ForecastPoint, metric: WeatherMetric, secondary = false): number | undefined => {
  if (metric === 'temperature') return point.temperature;
  if (metric === 'precipitation') return secondary ? point.precipitationProbability : point.precipitation;
  if (metric === 'wind') return secondary ? point.windGustSpeed : point.windSpeed;
  return point.cloudCoverage;
};

const numericRange = (values: Array<number | undefined>, fallback: [number, number], padding = 0): [number, number] => {
  const present = values.filter((value): value is number => value !== undefined);
  if (!present.length) return fallback;
  const min = Math.min(...present);
  const max = Math.max(...present);
  return [Math.floor(min - padding), Math.ceil(max + padding || min + 1)];
};

function WeatherMetricSvg({ points, metric, compact = false }: { points: ForecastPoint[]; metric: WeatherMetric; compact?: boolean }) {
  const data = points.slice(0, 25);
  const width = compact ? 310 : 900;
  const height = compact ? 28 : 112;
  const plot = compact ? { left: 2, right: 2, top: 2, bottom: 2 } : { left: 42, right: 42, top: 6, bottom: 24 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const primary = data.map((point) => metricValue(point, metric));
  const secondary = data.map((point) => metricValue(point, metric, true));
  const tempRange = numericRange(primary, [0, 25], 1);
  const windRange = numericRange([...primary, ...secondary], [0, 10], 0);
  const rainRange: [number, number] = [0, Math.max(1, ...primary.filter((value): value is number => value !== undefined))];
  const range: [number, number] = metric === 'temperature' ? tempRange : metric === 'wind' ? windRange : metric === 'cloud' ? [0, 100] : rainRange;
  const pointX = (index: number) => plot.left + (data.length < 2 ? 0 : index * plotWidth / (data.length - 1));
  const pointY = (value: number, valueRange: [number, number]) => plot.top + plotHeight - ((value - valueRange[0]) / Math.max(valueRange[1] - valueRange[0], 1)) * plotHeight;
  const pathFor = (values: Array<number | undefined>, valueRange: [number, number]) => values.map((value, index) => value === undefined ? '' : `${index === 0 || values[index - 1] === undefined ? 'M' : 'L'}${pointX(index).toFixed(1)} ${pointY(value, valueRange).toFixed(1)}`).join(' ');
  const primaryPath = pathFor(primary, range);
  const secondaryRange: [number, number] = metric === 'precipitation' ? [0, 100] : range;
  const secondaryPath = pathFor(secondary, secondaryRange);
  const timeStep = Math.max(1, Math.ceil((data.length - 1) / 8));
  const timeIndexes = data.map((_, index) => index).filter((index) => index % timeStep === 0 || index === data.length - 1);
  const ticks = compact ? [] : [0, .5, 1];
  const area = metric === 'temperature' || metric === 'cloud';

  if (!data.length) return <div className={compact ? 'weather-spark-empty' : 'chart-empty'}>—</div>;
  return <svg className={`weather-metric-svg ${compact ? 'compact' : 'expanded'} metric-${metric}`} role={compact ? undefined : 'img'} aria-hidden={compact || undefined} aria-label={compact ? undefined : `${metric === 'temperature' ? 'Temperatur' : metric === 'precipitation' ? 'Nedbør og sannsynlighet' : metric === 'wind' ? 'Vind og vindkast' : 'Skydekke'} de neste 24 timene`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
    <defs><linearGradient id={`metric-fill-${metric}-${compact}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".36"/><stop offset="1" stopColor="currentColor" stopOpacity=".05"/></linearGradient></defs>
    {ticks.map((ratio) => { const y = plot.top + ratio * plotHeight; const value = range[1] - ratio * (range[1] - range[0]); return <g key={ratio}><line className="gridline" x1={plot.left} x2={width - plot.right} y1={y} y2={y}/><text className="metric-axis left" x={plot.left - 7} y={y + 4}>{metric === 'precipitation' ? Math.round(100 - ratio * 100) : Math.round(value)}</text>{metric === 'precipitation' && <text className="metric-axis right" x={width - plot.right + 7} y={y + 4}>{(rainRange[1] - ratio * rainRange[1]).toFixed(1)}</text>}</g>; })}
    {metric === 'precipitation' && data.map((point, index) => point.precipitation !== undefined && <rect key={point.datetime} className="metric-rainbar" x={pointX(index) - Math.max(2, plotWidth / data.length * .28)} y={pointY(point.precipitation, rainRange)} width={Math.max(3, plotWidth / data.length * .56)} height={plot.top + plotHeight - pointY(point.precipitation, rainRange)}/>) }
    {area && primaryPath && <path className="metric-area" d={`${primaryPath} L${pointX(data.length - 1)} ${plot.top + plotHeight} L${plot.left} ${plot.top + plotHeight} Z`} fill={`url(#metric-fill-${metric}-${compact})`}/>} 
    {metric !== 'precipitation' && primaryPath && <path className="metric-primary" d={primaryPath}/>} 
    {secondaryPath && <path className="metric-secondary" d={secondaryPath}/>} 
    {!compact && timeIndexes.map((index) => <text className="metric-time" key={data[index].datetime} x={pointX(index)} y={height - 4}>{new Date(data[index].datetime).toLocaleTimeString('nb-NO', { hour: '2-digit' })}</text>)}
  </svg>;
}

function WeatherAccordion({ points, onDetails }: { points: ForecastPoint[]; onDetails?: () => void }) {
  const [expanded, setExpanded] = useState<WeatherMetric | null>('temperature');
  const metrics: Array<{ key: WeatherMetric; label: string; hint: string }> = [
    { key: 'temperature', label: 'Temperatur', hint: '°C' },
    { key: 'precipitation', label: 'Nedbør', hint: 'mm + sannsynlighet' },
    { key: 'wind', label: 'Vind', hint: 'hastighet + kast' },
    { key: 'cloud', label: 'Skydekke', hint: '0–100 %' },
  ];
  return <section className="weather-accordion" aria-label="Vær de neste 24 timene">
    <header><strong>Vær · neste 24 timer</strong><div><span>Kun én graf er åpen om gangen</span><button type="button" onClick={onDetails} aria-label="Åpne detaljert vær">Detaljer <Icon>arrow_forward</Icon></button></div></header>
    <div className={`weather-metric-list ${expanded === null ? 'all-collapsed' : ''}`}>
      {metrics.map((metric) => <div className={`weather-metric ${expanded === metric.key ? 'is-expanded' : ''}`} key={metric.key}>
        <button type="button" aria-expanded={expanded === metric.key} aria-controls={`weather-panel-${metric.key}`} onClick={() => setExpanded((current) => current === metric.key ? null : metric.key)}>
          <span className="weather-metric-copy"><strong>{metric.label}</strong><small>{metric.hint}</small></span>
          <WeatherMetricSvg points={points} metric={metric.key} compact/>
          <Icon>{expanded === metric.key ? 'remove' : 'add'}</Icon>
        </button>
        {expanded === metric.key && <div className="weather-metric-detail" id={`weather-panel-${metric.key}`} role="region" aria-label={`${metric.label}, detaljert graf`}>
          <WeatherMetricSvg points={points} metric={metric.key}/>
        </div>}
      </div>)}
    </div>
  </section>;
}

function ForecastStrip({ points }: { points: ForecastPoint[] }) {
  const days = points.slice(0, 5);
  return <div className="forecast-strip">{days.length ? days.map((point) => <div className="forecast-day" key={point.datetime}><span>{new Date(point.datetime).toLocaleDateString('nb-NO', { weekday: 'short' })}</span><WeatherGlyph condition={point.condition}/><strong>{fmt(point.temperature, '°')}</strong><small>{fmt(point.templow, '°')}</small></div>) : <div className="unavailable">— Prognose ikke tilgjengelig</div>}</div>;
}

function WeatherOverview({ states, regular, onDetails }: { states: Record<string, HomeAssistantState>; regular?: boolean; onDetails?: () => void }) {
  const daily = forecastPoints(states.weatherDaily);
  const hourly = forecastPoints(states.weatherHourly);
  const current = currentTemperatureNumber(states.weatherDaily) ?? currentTemperatureNumber(states.outdoor);
  const condition = stateValue(states.weatherDaily) ?? daily[0]?.condition;
  const summary = stateValue(states.weatherSummary);
  return <section className={`card weather-card ${regular ? 'weather-regular' : ''}`} aria-labelledby={regular ? undefined : 'weather-title'} role={regular ? 'button' : undefined} tabIndex={regular ? 0 : undefined} aria-label={regular ? 'Åpne detaljert vær' : undefined} onClick={regular ? onDetails : undefined} onKeyDown={regular ? (event) => { if ((event.key === 'Enter' || event.key === ' ') && onDetails) { event.preventDefault(); onDetails(); } } : undefined}>
    <div className="weather-top">
      <div className="weather-now"><WeatherGlyph condition={condition} large/><div><h2 id="weather-title">{fmt(current, '°C')}</h2><span>{conditionLabel(condition)}</span></div></div>
      {regular ? <div className="weather-summary"><p>{summary || '— Værmelding ikke tilgjengelig'}</p></div> : <ForecastStrip points={daily}/>} 
    </div>
    {regular && <WeatherChart points={hourly}/>} 
  </section>;
}

function GuestSwitch({ on, pending, action, child = false }: { on: boolean; pending: boolean; action: () => void; child?: boolean }) {
  return <section className="card guest-switch-card" aria-labelledby="guest-mode-title"><div><h2 id="guest-mode-title">Gjestemodus</h2><p>{child ? 'Huset oppfører seg som om noen er hjemme' : 'Huset oppfører seg som om noen er hjemme'}</p></div><button type="button" className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={on ? 'Slå av Gjestemodus' : 'Slå på Gjestemodus'} disabled={pending} onClick={action}><span/></button></section>;
}

const sceneMeta = { morning: ['sunny', 'Morgen'], evening: ['wb_twilight', 'Kveld'], night: ['bedtime', 'Natt'] } as const;
function Scenes({ large = false, action, pending, errors }: { large?: boolean; action: (key: DashboardAction) => void; pending: Record<string, boolean>; errors: Record<string, string> }) {
  return <section className={`card scenes-card ${large ? 'large' : ''}`} aria-labelledby="scenes-title"><h2 id="scenes-title">{large ? 'Hva skal vi gjøre?' : 'Scener'}</h2><div className="scene-buttons">{Object.entries(sceneMeta).map(([key, [icon, label]]) => <button type="button" key={key} className={`scene ${key}`} disabled={pending[key]} onClick={() => action(key as DashboardAction)}><Icon filled>{icon}</Icon><span>{label}</span>{errors[key] && <small role="alert">{errors[key]}</small>}</button>)}</div></section>;
}

function HeatPump({ states, pending, errors, action, adjust, simple = false }: { states: Record<string, HomeAssistantState>; pending: Record<string, boolean>; errors: Record<string, string>; action: (key: DashboardAction, option?: HeatPumpMode | FanSpeed) => void; adjust: (offset: number) => void; simple?: boolean }) {
  const climate = states.climate;
  const current = currentTemperatureNumber(climate);
  const target = temperatureNumber(climate);
  const mode = ['cool', 'heat', 'heat_cool', 'fan_only'].includes(climate?.state) ? climate.state as HeatPumpMode : undefined;
  const fan = typeof climate?.attributes.fan_mode === 'string' ? climate.attributes.fan_mode : undefined;
  const modes: Array<[HeatPumpMode, string, string]> = simple ? [['heat', 'sunny', 'Varme'], ['cool', 'ac_unit', 'Kjøling'], ['fan_only', 'mode_fan', 'Vifte']] : [['heat', 'sunny', 'Varme'], ['cool', 'ac_unit', 'Kjøling'], ['fan_only', 'mode_fan', 'Vifte'], ['heat_cool', 'adjust', 'Balanser']];
  return <section className={`card heatpump-card ${simple ? 'simple' : ''}`} aria-labelledby="heat-title"><div className="heat-title"><Icon>mode_fan</Icon><div><h2 id="heat-title">Varmepumpe</h2><p>Inne {fmt(current, '°C')}</p></div></div><div className="heat-controls"><div className="temperature-stepper"><button type="button" aria-label="Senk temperatur" disabled={pending.temperature || target === undefined} onClick={() => adjust(-1)}><Icon>remove</Icon></button><output aria-label="Temperatur">{fmt(target, '°C')}</output><button type="button" aria-label="Øk temperatur" disabled={pending.temperature || target === undefined} onClick={() => adjust(1)}><Icon>add</Icon></button></div><div className="hvac-modes" role="group" aria-label="Velg varmepumpens driftsmodus">{modes.map(([value, icon, label]) => <button type="button" key={value} className={mode === value ? 'selected' : ''} aria-pressed={mode === value} disabled={pending.heatPump} onClick={() => action('heatPump', value)}><Icon>{icon}</Icon><span>{label}</span></button>)}</div></div><div className="fan-group"><div role="group" aria-label="Velg viftehastighet">{([['quiet', 'Stille'], ['medium', 'Medium'], ['strong', 'Sterk']] as const).map(([value, label]) => <button key={value} type="button" className={fan === value ? 'selected' : ''} aria-pressed={fan === value} disabled={pending.fanSpeed} onClick={() => action('fanSpeed', value)}>{label}</button>)}</div></div>{errors.heatPump && <p className="card-error" role="alert">{errors.heatPump}</p>}{errors.fanSpeed && <p className="card-error" role="alert">{errors.fanSpeed}</p>}{errors.temperature && <p className="card-error" role="alert">{errors.temperature}</p>}</section>;
}

function DoorCard({ state, pending, action, error }: { state?: HomeAssistantState; pending: boolean; action: (key: DashboardAction) => void; error?: string }) {
  const locked = state?.state === 'locked';
  const label = locked ? 'Lås opp ytterdør' : 'Lås ytterdør';
  return <section className="card door-card" aria-labelledby="door-title"><div><h2 id="door-title">Ytterdør</h2><p>{stateValue(state) ? locked ? 'Låst' : 'Ulåst' : '— Ikke tilgjengelig'}</p></div><button type="button" className={`round-icon ${locked ? 'safe' : 'danger'}`} aria-label={label} title={label} disabled={pending} onClick={() => action(locked ? 'unlockDoor' : 'lockDoor')}><Icon filled>{locked ? 'lock' : 'lock_open'}</Icon></button>{error && <p role="alert">{error}</p>}</section>;
}

function SecurityCard({ state, pending, action, error }: { state?: HomeAssistantState; pending: boolean; action: () => void; error?: string }) {
  const status = securityPresentation(state);
  return <button type="button" className={`card security-card ${status.tone}`} disabled={pending} onClick={action}><span className="round-icon"><Icon>{status.icon}</Icon></span><span><strong>Overvåkning</strong><small>{status.label}</small></span>{error && <small role="alert">{error}</small>}</button>;
}

function Doorbell({ available }: { available: boolean }) {
  const [source, setSource] = useState<'stream' | 'snapshot' | 'unavailable'>('stream');
  useEffect(() => { setSource('stream'); }, [available]);
  const cameraAvailable = available && source !== 'unavailable';
  const stream = source === 'stream';
  const imageSource = stream ? '/api/camera/stream' : '/api/camera?frame=fallback';
  return <section className="card doorbell-card" aria-labelledby="doorbell-title"><h2 id="doorbell-title">Ringeklokke</h2><div className="camera-frame">{cameraAvailable ? <img src={imageSource} alt={stream ? 'Direktevideo fra ringeklokke' : 'Siste bilde fra ringeklokke'} onError={() => setSource((current) => current === 'stream' ? 'snapshot' : 'unavailable')}/> : <div className="camera-unavailable"><Icon>videocam_off</Icon><span>— Kamera ikke tilgjengelig</span></div>}{cameraAvailable && <span className="live-badge">{stream ? 'LIVE' : 'BILDE'}</span>}<div className="camera-controls"><button type="button" aria-label="Vis kamera i fullskjerm" onClick={() => document.querySelector('.camera-frame')?.requestFullscreen?.()}><Icon>fullscreen</Icon></button></div></div></section>;
}

const reading = (state: HomeAssistantState | undefined, unit = '') => stateValue(state) ? `${stateValue(state)}${unit}` : '—';
function Metrics({ states }: { states: Record<string, HomeAssistantState> }) {
  const rooms = [['Stue', states.roomLiving], ['Soverom', states.roomBedroom], ['Bad', states.roomBathroom]] as const;
  const events = Array.isArray(states.calendar?.attributes.events) ? states.calendar.attributes.events.slice(0, 2) as Array<Record<string, unknown>> : [];
  return <div className="metric-row">
    <section className="card metric energy"><h3>Energi i dag</h3><strong>{reading(states.energyToday, ` ${typeof states.energyToday?.attributes.unit_of_measurement === 'string' ? states.energyToday.attributes.unit_of_measurement : 'kWh'}`)}</strong><div className="energy-bars" aria-hidden="true">{[38,72,46,82,32,68].map((h, i) => <i key={i} style={{height:`${h}%`}}/>)}</div></section>
    <section className="card metric rooms"><h3>Rom</h3>{rooms.map(([label, value]) => <p key={label}><span>{label}</span><strong>{reading(value, '°C')}</strong></p>)}</section>
    <section className="card metric waste"><h3>Søppeltømming</h3><div><Icon>delete</Icon><strong>{reading(states.waste)}</strong></div><p>{typeof states.waste?.attributes.types === 'string' ? states.waste.attributes.types : 'Ikke tilgjengelig'}</p></section>
    <section className="card metric car"><h3><Icon>directions_car</Icon>Andreas</h3><p>Rekkevidde <strong>{reading(states.carAndreasRange, ' km')}</strong></p><p>Til jobb <strong>{reading(states.andreasTravelTime, ' min')}</strong></p></section>
    <section className="card metric car"><h3><Icon>directions_car</Icon>Hege</h3><p>Rekkevidde <strong>{reading(states.carHegeRange, ' km')}</strong></p><p>Til jobb <strong>{reading(states.hegeTravelTime, ' min')}</strong></p></section>
    <section className="card metric calendar"><h3>Kalender</h3>{events.length ? events.map((event, index) => <p key={index}><strong>{typeof event.when === 'string' ? event.when : '—'}</strong> · {typeof event.summary === 'string' ? event.summary : 'Ikke tilgjengelig'}</p>) : <p>— Ingen kalenderdata</p>}</section>
  </div>;
}

function QrCode({ payload }: { payload?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => { let active = true; if (!payload) { setUrl(''); return; } QRCode.toString(payload, { type: 'svg', width: 220, margin: 1, color: { dark: '#111111', light: '#f4efe7' } }).then((svg) => { if (active) setUrl(`data:image/svg+xml,${encodeURIComponent(svg)}`); }); return () => { active = false; }; }, [payload]);
  return url ? <img className="qr-code" src={url} alt="QR-kode for gjestenettverket"/> : <div className="qr-missing">— QR-kode ikke tilgjengelig</div>;
}

function GuestWifi({ voucher, pending, renew }: { voucher?: string; pending: boolean; renew: () => void }) {
  const payload = voucher ? `WIFI:T:WPA;S:GH_Guest;P:${voucher};;` : undefined;
  return <section className="card wifi-card" aria-labelledby="wifi-title"><h2 id="wifi-title"><Icon>wifi</Icon>Gjeste-WiFi</h2><p>Koble til nettverk: <strong>GH_Guest</strong></p><p>Passord: <output aria-label="Tilgangskode">{voucher || '—'}</output></p><QrCode payload={payload}/><button type="button" disabled={pending} onClick={renew}>Ny kode</button></section>;
}

function RegularDashboard({ states, pending, errors, action, adjust, showWeather, editing, layout, updateLayout }: DashboardProps & { showWeather: () => void; editing: boolean; layout: GridLayouts; updateLayout: (id: string, next: GridPlacement) => void }) {
  return <EditableDashboard mode="regular" editing={editing} layout={layout} updateLayout={updateLayout} children={[
    { id: 'access', label: 'Adgang', content: <div className="upper-left"><DoorCard state={states.frontDoorLock} pending={pending.lockDoor || pending.unlockDoor} action={action} error={errors.lockDoor || errors.unlockDoor}/><SecurityCard state={states.securityMode} pending={pending.securityMode} action={() => action('securityMode')} error={errors.securityMode}/></div> },
    { id: 'weather', label: 'Vær', content: <WeatherOverview states={states} regular onDetails={showWeather}/> }, { id: 'doorbell', label: 'Ringeklokke', content: <Doorbell available={Boolean(stateValue(states.doorbellCamera))}/> },
    { id: 'scenes', label: 'Scener', content: <Scenes action={action} pending={pending} errors={errors}/> }, { id: 'heatpump', label: 'Varmepumpe', content: <HeatPump states={states} pending={pending} errors={errors} action={action} adjust={adjust}/> }, { id: 'metrics', label: 'Oversikt', content: <Metrics states={states}/> },
  ]}/>;
}

interface DashboardProps { states: Record<string, HomeAssistantState>; pending: Record<string, boolean>; errors: Record<string, string>; action: (key: DashboardAction, option?: HeatPumpMode | FanSpeed) => void; adjust: (offset: number) => void }
function GuestDashboard({ states, pending, errors, action, adjust, editing, layout, updateLayout }: DashboardProps & { editing: boolean; layout: GridLayouts; updateLayout: (id: string, next: GridPlacement) => void }) {
  const voucher = stateValue(states.guestVoucher);
  return <EditableDashboard mode="guest" editing={editing} layout={layout} updateLayout={updateLayout} children={[{ id: 'guest', label: 'Gjestemodus', content: <GuestSwitch on={states.guestMode?.state === 'on'} pending={pending.guestMode} action={() => action('guestMode')}/> }, { id: 'weather', label: 'Vær', content: <WeatherOverview states={states}/> }, { id: 'scenes', label: 'Scener', content: <Scenes action={action} pending={pending} errors={errors}/> }, { id: 'heatpump', label: 'Varmepumpe', content: <HeatPump states={states} pending={pending} errors={errors} action={action} adjust={adjust}/> }, { id: 'wifi', label: 'Gjeste-WiFi', content: <GuestWifi voucher={voucher} pending={pending.guestVoucher} renew={() => action('guestVoucher')}/> }]}/>;
}

function ChildDashboard({ states, pending, errors, action, adjust, editing, layout, updateLayout }: DashboardProps & { editing: boolean; layout: GridLayouts; updateLayout: (id: string, next: GridPlacement) => void }) {
  return <EditableDashboard mode="child" editing={editing} layout={layout} updateLayout={updateLayout} children={[{ id: 'guest', label: 'Gjestemodus', content: <GuestSwitch child on={states.guestMode?.state === 'on'} pending={pending.guestMode} action={() => action('guestMode')}/> }, { id: 'weather', label: 'Vær', content: <WeatherOverview states={states}/> }, { id: 'scenes', label: 'Scener', content: <Scenes large action={action} pending={pending} errors={errors}/> }, { id: 'heatpump', label: 'Varmepumpe', content: <HeatPump simple states={states} pending={pending} errors={errors} action={action} adjust={adjust}/> }]}/>;
}

function DetailedWeather({ states, close }: { states: Record<string, HomeAssistantState>; close: () => void }) {
  const [tab, setTab] = useState<WeatherTab>('today');
  const hourly = forecastPoints(states.weatherHourly);
  const daily = forecastPoints(states.weatherDaily);
  return <main className="dashboard weather-detail"><header className="weather-detail-header"><button type="button" onClick={close}><Icon>arrow_back</Icon>Tilbake</button><h1>Detaljert vær</h1><div role="tablist" aria-label="Værperiode"><button type="button" role="tab" aria-selected={tab === 'today'} className={tab === 'today' ? 'selected' : ''} onClick={() => setTab('today')}>I dag</button><button type="button" role="tab" aria-selected={tab === 'week'} className={tab === 'week' ? 'selected' : ''} onClick={() => setTab('week')}>Neste 7 dager</button></div></header><div className="weather-detail-grid"><section className="card detail-chart"><h2>{tab === 'today' ? 'I dag' : 'Neste 7 dager'}</h2><WeatherChart points={tab === 'today' ? hourly : daily} detailed/></section><section className="card hourly-card"><h2>Time for time</h2><div className="hourly-strip">{hourly.slice(0, 7).map((point) => <div key={point.datetime}><time>{new Date(point.datetime).toLocaleTimeString('nb-NO', {hour:'2-digit', minute:'2-digit'})}</time><WeatherGlyph condition={point.condition}/><strong>{fmt(point.temperature, '°')}</strong><small>{fmt(point.precipitation, ' mm')}</small><small>{fmt(point.windSpeed, ' m/s')}</small></div>)}{!hourly.length && <p>— Timevarsel ikke tilgjengelig</p>}</div></section><section className="card week-card"><h2>Neste 7 dager</h2>{daily.slice(0,7).map((point) => <div key={point.datetime}><span>{new Date(point.datetime).toLocaleDateString('nb-NO',{weekday:'short'})}</span><WeatherGlyph condition={point.condition}/><strong>{fmt(point.temperature, '°')}</strong><small>/ {fmt(point.templow, '°')}</small></div>)}{!daily.length && <p>— Ukesvarsel ikke tilgjengelig</p>}</section></div></main>;
}

export default function App({ api = browserApi }: { api?: DashboardApi }) {
  const [states, setStates] = useState<Record<string, HomeAssistantState>>({});
  const [mode, setMode] = useState<Mode>('regular');
  const [editing, setEditing] = useState(false);
  const [layouts, setLayouts] = useState<Record<Mode, GridLayouts>>(() => ({ regular: loadLayout('regular'), guest: loadLayout('guest'), child: loadLayout('child') }));
  const [detailedWeather, setDetailedWeather] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [repairOpen, setRepairOpen] = useState(false);
  const repairButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasRepairOpen = useRef(false);

  useEffect(() => { let active = true; api.getStates().then(({ states: confirmed }) => { if (active) setStates(confirmed); }, () => { if (active) setErrors({ load: updateError }); }); return () => { active = false; }; }, [api]);
  useEffect(() => { if (!repairOpen) return; closeButton.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setRepairOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [repairOpen]);
  useEffect(() => { if (!repairOpen && wasRepairOpen.current) repairButton.current?.focus(); wasRepairOpen.current = repairOpen; }, [repairOpen]);

  const confirm = async (key: string, operation: () => Promise<{ states: Record<string, HomeAssistantState> }>) => { setPending((value) => ({ ...value, [key]: true })); setErrors((value) => ({ ...value, [key]: '' })); try { const result = await operation(); setStates((value) => ({ ...value, ...result.states })); } catch { setErrors((value) => ({ ...value, [key]: updateError })); } finally { setPending((value) => { const next = { ...value }; delete next[key]; return next; }); } };
  const action = (key: DashboardAction, option?: HeatPumpMode | FanSpeed) => { void confirm(key, () => api.runAction(key, option)); };
  const baseline = temperatureNumber(states.climate) ?? currentTemperatureNumber(states.climate);
  const adjust = (offset: number) => { if (baseline !== undefined) void confirm('temperature', () => api.setTemperature(baseline + offset)); };
  const dashboardProps = useMemo(() => ({ states, pending, errors, action, adjust }), [states, pending, errors]);
  const repair = isRepairNeeded(states.repairHealth);
  const updateLayout = (id: string, next: GridPlacement) => setLayouts((current) => { const modeLayout = { ...current[mode], [id]: next }; window.localStorage.setItem(layoutKey(mode), JSON.stringify(modeLayout)); return { ...current, [mode]: modeLayout }; });
  const resetLayout = () => setLayouts((current) => { window.localStorage.removeItem(layoutKey(mode)); return { ...current, [mode]: defaultLayouts[mode] }; });

  if (detailedWeather) return <DetailedWeather states={states} close={() => setDetailedWeather(false)}/>;
  return <main className="dashboard"><DashboardHeader mode={mode} setMode={setMode} repair={repair} openRepair={() => setRepairOpen(true)} repairRef={repairButton} editing={editing} setEditing={setEditing} resetLayout={resetLayout}/>{errors.load && <p className="load-error" role="alert">{errors.load}</p>}<div className="dashboard-content">{mode === 'regular' ? <RegularDashboard {...dashboardProps} showWeather={() => setDetailedWeather(true)} editing={editing} layout={layouts.regular} updateLayout={updateLayout}/> : mode === 'guest' ? <GuestDashboard {...dashboardProps} editing={editing} layout={layouts.guest} updateLayout={updateLayout}/> : <ChildDashboard {...dashboardProps} editing={editing} layout={layouts.child} updateLayout={updateLayout}/>}</div>{repairOpen && <div className="repair-backdrop"><section className="repair-modal" role="dialog" aria-modal="true" aria-labelledby="repair-title"><header><h2 id="repair-title"><Icon>warning</Icon>Systemreparasjon (8080)</h2><button ref={closeButton} type="button" aria-label="Lukk" onClick={() => setRepairOpen(false)}><Icon>close</Icon></button></header><iframe title="Reparer smarthuset" src="http://192.168.1.127:8080/"/></section></div>}</main>;
}
