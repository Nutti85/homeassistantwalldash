import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import QRCode from 'qrcode';
import type { DashboardAction, FanSpeed, HeatPumpMode, HomeAssistantState } from '../shared/entities';
import * as browserApi from './api';
import './roomCards.css';
import {
  calendarDayKey, calendarEventOccursOnDay, calendarEvents, conditionIcon, conditionLabel, currentTemperatureNumber, formatCalendarTime, forecastPoints, isRepairNeeded, wasteDaysUntil,
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
type LayoutChild = { id: string; label: string; content: ReactElement };
const GRID_COLUMNS = 24;
const GRID_ROWS = 8;
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

function DashboardHeader({ mode, setMode, repair, openRepair, repairRef, editing, setEditing, resetLayout, saveDefaultLayout, action, pending, errors }: { mode: Mode; setMode: (mode: Mode) => void; repair: boolean; openRepair: () => void; repairRef: React.RefObject<HTMLButtonElement>; editing: boolean; setEditing: (editing: boolean) => void; resetLayout: () => void; saveDefaultLayout: () => void; action: (key: DashboardAction) => void; pending: Record<string, boolean>; errors: Record<string, string> }) {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setTime(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  return <header className="dashboard-header">
    <div className="header-identity">
      <div className="context">{repair && mode === 'regular' && <button ref={repairRef} type="button" className="repair-inline" onClick={openRepair}><Icon>build</Icon>Reparer smarthuset</button>}{mode !== 'child' && <SceneButtons action={action} pending={pending} errors={errors} header />}</div>
    </div>
    <ModeSelector mode={mode} setMode={setMode} />
    <div className="layout-actions"><button type="button" className={editing ? 'selected' : ''} aria-label={editing ? 'Fullfør tilpassing av oppsett' : 'Tilpass oppsett'} title={editing ? 'Fullfør' : 'Tilpass oppsett'} aria-pressed={editing} onClick={() => setEditing(!editing)}><Icon>dashboard_customize</Icon></button>{editing && <><button type="button" className="reset-layout" onClick={saveDefaultLayout}>Lagre som standard</button><button type="button" className="reset-layout" onClick={resetLayout}>Tilbakestill</button><span className="layout-hint" role="status">Dra kort med håndtaket · endre størrelse nederst til høyre</span></>}</div>
    <time dateTime={time.toISOString()}>{time.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</time>
  </header>;
}

const scalePlacement = ({ column, row, columns, rows }: GridPlacement): GridPlacement => ({ column: column * 2 - 1, row: row * 2 - 1, columns: columns * 2, rows: rows * 2 });
const scaleLayout = (layout: GridLayouts): GridLayouts => Object.fromEntries(Object.entries(layout).map(([id, placement]) => [id, scalePlacement(placement)]));
const defaultLayouts: Record<Mode, GridLayouts> = {
  regular: { frontDoor: { column: 1, row: 1, columns: 4, rows: 1 }, security: { column: 5, row: 1, columns: 4, rows: 1 }, weather: { column: 9, row: 1, columns: 8, rows: 4 }, doorbell: { column: 1, row: 2, columns: 4, rows: 3 }, courtyard: { column: 5, row: 2, columns: 4, rows: 3 }, calendar: { column: 17, row: 1, columns: 8, rows: 4 }, carAndreas: { column: 17, row: 5, columns: 4, rows: 2 }, carHege: { column: 21, row: 5, columns: 4, rows: 2 }, energy: { column: 9, row: 5, columns: 8, rows: 4 }, roomClimate: { column: 1, row: 5, columns: 8, rows: 4 } },
  guest: scaleLayout({ guest: { column: 1, row: 1, columns: 4, rows: 1 }, weather: { column: 5, row: 1, columns: 8, rows: 1 }, heatpump: { column: 1, row: 2, columns: 8, rows: 3 }, wifi: { column: 9, row: 2, columns: 4, rows: 3 } }),
  child: scaleLayout({ guest: { column: 1, row: 1, columns: 5, rows: 1 }, weather: { column: 6, row: 1, columns: 7, rows: 1 }, scenes: { column: 1, row: 2, columns: 12, rows: 2 }, heatpump: { column: 1, row: 4, columns: 12, rows: 1 } }),
};
// A new shipped arrangement must use a new storage version. Otherwise an
// earlier device-specific arrangement always wins over the built-in default.
const layoutKey = (mode: Mode) => `smarthjem-layout-v11-${mode}`;
const defaultLayoutKey = (mode: Mode) => `smarthjem-default-layout-v11-${mode}`;
const clampPlacement = (placement: GridPlacement): GridPlacement => {
  const columns = Math.max(1, Math.min(GRID_COLUMNS, placement.columns)); const rows = Math.max(1, Math.min(GRID_ROWS, placement.rows));
  return { columns, rows, column: Math.max(1, Math.min(GRID_COLUMNS + 1 - columns, placement.column)), row: Math.max(1, Math.min(GRID_ROWS + 1 - rows, placement.row)) };
};
const loadLayout = (mode: Mode): GridLayouts => {
  try { const savedDefault = JSON.parse(window.localStorage.getItem(defaultLayoutKey(mode)) ?? '{}') as GridLayouts; const saved = JSON.parse(window.localStorage.getItem(layoutKey(mode)) ?? '{}') as GridLayouts; return Object.fromEntries(Object.entries(defaultLayouts[mode]).map(([id, fallback]) => { const defaultPlacement = savedDefault[id] ? clampPlacement(savedDefault[id]) : fallback; return [id, saved[id] ? clampPlacement(saved[id]) : defaultPlacement]; })); } catch { return defaultLayouts[mode]; }
};

function EditableDashboard({ mode, editing, layout, updateLayout: commitLayout, children }: { mode: Mode; editing: boolean; layout: GridLayouts; updateLayout: (next: GridLayouts) => void; children: LayoutChild[] }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<GridLayouts>(layout);
  const draftRef = useRef<GridLayouts>(layout);
  const drag = useRef<{ id: string; type: 'move' | 'resize'; pointerId: number; startX: number; startY: number; columnUnit: number; rowUnit: number; origin: GridLayouts } | null>(null);

  useEffect(() => {
    if (drag.current) return;
    draftRef.current = layout;
    setDraft(layout);
  }, [layout]);

  const showDraft = (next: GridLayouts) => {
    draftRef.current = next;
    setDraft(next);
  };

  const start = (event: ReactPointerEvent<HTMLButtonElement>, id: string, type: 'move' | 'resize') => {
    const grid = gridRef.current;
    if (!editing || !layout[id] || !grid) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = grid.getBoundingClientRect();
    const computed = window.getComputedStyle(grid);
    const horizontalGap = Number.parseFloat(computed.columnGap) || 0;
    const verticalGap = Number.parseFloat(computed.rowGap) || 0;
    const horizontalPadding = (Number.parseFloat(computed.paddingLeft) || 0) + (Number.parseFloat(computed.paddingRight) || 0);
    const verticalPadding = (Number.parseFloat(computed.paddingTop) || 0) + (Number.parseFloat(computed.paddingBottom) || 0);
    const origin = Object.fromEntries(Object.entries(layout).map(([key, placement]) => [key, { ...placement }]));
    drag.current = {
      id, type, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin,
      columnUnit: Math.max(1, (bounds.width - horizontalPadding + horizontalGap) / GRID_COLUMNS),
      rowUnit: Math.max(1, (bounds.height - verticalPadding + verticalGap) / GRID_ROWS),
    };
    showDraft(origin);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || event.pointerId !== active.pointerId) return;
    const columnDelta = Math.round((event.clientX - active.startX) / active.columnUnit);
    const rowDelta = Math.round((event.clientY - active.startY) / active.rowUnit);

    if (active.type === 'resize') {
      const original = active.origin[active.id];
      showDraft({ ...draftRef.current, [active.id]: clampPlacement({ ...original, columns: original.columns + columnDelta, rows: original.rows + rowDelta }) });
      return;
    }

    const original = active.origin[active.id];
    showDraft({ ...draftRef.current, [active.id]: clampPlacement({ ...original, column: original.column + columnDelta, row: original.row + rowDelta }) });
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || event.pointerId !== active.pointerId) return;
    drag.current = null;
    if (event.type === 'pointercancel') {
      showDraft(layout);
      return;
    }
    commitLayout(draftRef.current);
  };

  return <div ref={gridRef} className={`${mode}-layout editable-dashboard ${editing ? 'is-editing' : ''}`} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>{children.map(({ id, label, content }) => { const placement = draft[id] ?? layout[id]; const style = { gridArea: 'auto', gridColumn: `${placement.column} / span ${placement.columns}`, gridRow: `${placement.row} / span ${placement.rows}` } as CSSProperties; return <div className="layout-item" data-layout-id={id} key={id} style={style}>{content}{editing && <><button type="button" className="drag-handle" aria-label={`Flytt ${label}`} title={`Flytt ${label}`} onPointerDown={(event) => start(event, id, 'move')}><Icon>drag_indicator</Icon><span>{label}</span></button><button type="button" className="resize-handle" aria-label={`Endre størrelse på ${label}`} title={`Endre størrelse på ${label}`} onPointerDown={(event) => start(event, id, 'resize')}><Icon>open_in_full</Icon></button></>}</div>; })}</div>;
}

function WeatherChart({ points, detailed = false }: { points: ForecastPoint[]; detailed?: boolean }) {
  const width = 900;
  const data = points.slice(0, detailed ? 25 : 22);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState(() => ({ width, height: detailed ? 248 : 178 }));
  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    if (!wrap || !svg || !window.ResizeObserver) return;
    const updateViewport = () => {
      const { width: nextWidth, height: nextHeight } = svg.getBoundingClientRect();
      const measured = { width: Math.round(nextWidth), height: Math.round(nextHeight) };
      if (measured.width && measured.height) setViewport((current) => current.width === measured.width && current.height === measured.height ? current : measured);
    };
    const observer = new ResizeObserver(updateViewport);
    observer.observe(wrap);
    updateViewport();
    return () => observer.disconnect();
  }, [data.length, detailed]);
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
  const height = Math.max(120, width * viewport.height / viewport.width - 28);
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
  return <div ref={wrapRef} className="weather-chart-wrap">
    <div className="chart-legend" aria-label="Tegnforklaring"><span className="temp">Temperatur</span><span className="rain">Nedbør</span><span className="probability">Sannsynlighet</span><span className="wind">Vind</span><span className="gust">Kast</span><span className="cloud">Skydekke</span></div>
    {data.length ? <svg ref={svgRef} className="weather-chart" role="img" aria-label="Samlet graf for temperatur, nedbør, nedbørssannsynlighet, vind, vindkast og skydekke" viewBox={`0 0 ${width} ${height + 28}`} preserveAspectRatio="xMidYMid meet">
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
  return <section className={`card weather-card ${regular ? 'weather-regular' : ''}`} aria-labelledby={regular ? undefined : 'weather-title'} role={regular ? 'button' : undefined} tabIndex={regular ? 0 : undefined} aria-label={regular ? 'Åpne detaljert vær' : undefined} onClick={regular ? onDetails : undefined} onKeyDown={regular ? (event) => { if ((event.key === 'Enter' || event.key === ' ') && onDetails) { event.preventDefault(); onDetails(); } } : undefined}>
    <div className="weather-top">
      <div className="weather-now"><WeatherGlyph condition={condition} large/><div><h2 id="weather-title">{fmt(current, '°C')}</h2><span>{conditionLabel(condition)}</span></div></div>
      {!regular && <ForecastStrip points={daily}/>} 
    </div>
    {regular && <WeatherChart points={hourly}/>} 
  </section>;
}

function GuestSwitch({ on, pending, action, child = false }: { on: boolean; pending: boolean; action: () => void; child?: boolean }) {
  return <section className="card guest-switch-card" aria-labelledby="guest-mode-title"><div><h2 id="guest-mode-title">Gjestemodus</h2><p>{child ? 'Huset oppfører seg som om noen er hjemme' : 'Huset oppfører seg som om noen er hjemme'}</p></div><button type="button" className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={on ? 'Slå av Gjestemodus' : 'Slå på Gjestemodus'} disabled={pending} onClick={action}><span/></button></section>;
}

const sceneMeta = { morning: ['sunny', 'Morgen'], evening: ['wb_twilight', 'Kveld'], night: ['bedtime', 'Natt'] } as const;
const sceneConfirmation = { morning: 'Morgen er sendt til Home Assistant', evening: 'Kveld er sendt til Home Assistant', night: 'Natt er sendt til Home Assistant' } as const;
function SceneButtons({ action, pending, errors, header = false }: { action: (key: DashboardAction) => void; pending: Record<string, boolean>; errors: Record<string, string>; header?: boolean }) {
  return <div className={`scene-buttons${header ? ' header-scenes' : ''}`} aria-label="Scener">{Object.entries(sceneMeta).map(([key, [icon, label]]) => <button type="button" key={key} className={`scene ${key}`} disabled={pending[key]} onClick={() => action(key as DashboardAction)}><Icon filled>{icon}</Icon><span>{label}</span>{errors[key] && <small role="alert">{errors[key]}</small>}</button>)}</div>;
}

const quickControls = [
  ['lightbulb', 'Styr lys'],
  ['vacuum', 'Styr robotstøvsuger'],
  ['mode_fan', 'Styr klimaanlegg'],
  ['grass', 'Styr robotgressklipper'],
  ['settings', 'Innstillinger'],
] as const;

function QuickControls({ openHeatPump, openVacuum, openKlaraAi, heatPumpButtonRef, vacuumButtonRef, klaraButtonRef }: { openHeatPump: () => void; openVacuum: () => void; openKlaraAi: () => void; heatPumpButtonRef: React.RefObject<HTMLButtonElement>; vacuumButtonRef: React.RefObject<HTMLButtonElement>; klaraButtonRef: React.RefObject<HTMLButtonElement> }) {
  return <nav className="quick-controls" aria-label="Hurtigkontroller">
    {quickControls.map(([icon, label]) => <button ref={icon === 'mode_fan' ? heatPumpButtonRef : icon === 'vacuum' ? vacuumButtonRef : undefined} key={icon} type="button" aria-label={label} title={label} onClick={icon === 'mode_fan' ? openHeatPump : icon === 'vacuum' ? openVacuum : undefined}><Icon>{icon}</Icon></button>)}
    <button ref={klaraButtonRef} type="button" className="klara-ai-button" aria-label="Klara AI" title="Klara AI" onClick={openKlaraAi}><Icon>auto_awesome</Icon></button>
  </nav>;
}

function KlaraAiModal({ states, close, closeButtonRef }: { states: Record<string, HomeAssistantState>; close: () => void; closeButtonRef: React.RefObject<HTMLButtonElement> }) {
  const daily = forecastPoints(states.weatherDaily);
  const current = currentTemperatureNumber(states.weatherDaily) ?? currentTemperatureNumber(states.outdoor);
  const condition = stateValue(states.weatherDaily) ?? daily[0]?.condition;
  const summary = stateValue(states.weatherSummary) ?? 'Værmelding ikke tilgjengelig';
  return <div className="klara-ai-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="klara-ai-modal" role="dialog" aria-modal="true" aria-labelledby="klara-ai-title">
      <button ref={closeButtonRef} className="klara-ai-close" type="button" aria-label="Lukk Klara AI" onClick={close}><Icon>close</Icon></button>
      <header className="klara-ai-header"><div><span className="klara-ai-eyebrow">Personlig oversikt</span><h2 id="klara-ai-title">Klara AI</h2></div><Icon filled>auto_awesome</Icon></header>
      <div className="klara-ai-section-label"><Icon>partly_cloudy_day</Icon><span>Vær</span></div>
      <article className="klara-ai-weather"><div className="klara-ai-weather-icon"><WeatherGlyph condition={condition} large/></div><div className="klara-ai-weather-reading"><strong>{fmt(current, '°C')}</strong><span>{conditionLabel(condition)}</span></div><p>{summary}</p></article>
    </section>
  </div>;
}

function HeatPump({ states, pending, errors, action, adjust, simple = false }: { states: Record<string, HomeAssistantState>; pending: Record<string, boolean>; errors: Record<string, string>; action: (key: DashboardAction, option?: HeatPumpMode | FanSpeed) => void; adjust: (offset: number) => void; simple?: boolean }) {
  const climate = states.climate;
  const current = currentTemperatureNumber(climate);
  const target = temperatureNumber(climate);
  const mode = ['cool', 'heat', 'heat_cool', 'fan_only'].includes(climate?.state) ? climate.state as HeatPumpMode : undefined;
  const fan = typeof climate?.attributes.fan_mode === 'string' ? climate.attributes.fan_mode : undefined;
  const modes: Array<[HeatPumpMode, string, string]> = simple ? [['heat', 'sunny', 'Varme'], ['cool', 'ac_unit', 'Kjøle'], ['fan_only', 'mode_fan', 'Vifte']] : [['heat', 'sunny', 'Varme'], ['cool', 'ac_unit', 'Kjøle'], ['fan_only', 'mode_fan', 'Vifte'], ['heat_cool', 'adjust', 'Balanser']];
  return <section className={`card heatpump-card ${simple ? 'simple' : ''}`} aria-labelledby="heat-title"><div className="heat-title"><Icon>mode_fan</Icon><div><h2 id="heat-title">Varmepumpe</h2><p>Inne {fmt(current, '°C')}</p></div></div><div className="heat-controls"><div className="temperature-stepper"><button type="button" aria-label="Senk temperatur" disabled={pending.temperature || target === undefined} onClick={() => adjust(-1)}><Icon>remove</Icon></button><output aria-label="Temperatur">{fmt(target, '°C')}</output><button type="button" aria-label="Øk temperatur" disabled={pending.temperature || target === undefined} onClick={() => adjust(1)}><Icon>add</Icon></button></div><div className="hvac-modes" role="group" aria-label="Velg varmepumpens driftsmodus">{modes.map(([value, icon, label]) => <button type="button" key={value} className={mode === value ? 'selected' : ''} aria-pressed={mode === value} disabled={pending.heatPump} onClick={() => action('heatPump', value)}><Icon>{icon}</Icon><span>{label}</span></button>)}</div></div><div className="fan-group"><div role="group" aria-label="Velg viftehastighet">{([['quiet', 'Stille'], ['medium', 'Medium'], ['strong', 'Sterk']] as const).map(([value, label]) => <button key={value} type="button" className={fan === value ? 'selected' : ''} aria-pressed={fan === value} disabled={pending.fanSpeed} onClick={() => action('fanSpeed', value)}>{label}</button>)}</div></div>{errors.heatPump && <p className="card-error" role="alert">{errors.heatPump}</p>}{errors.fanSpeed && <p className="card-error" role="alert">{errors.fanSpeed}</p>}{errors.temperature && <p className="card-error" role="alert">{errors.temperature}</p>}</section>;
}

function DoorCard({ state, pending, action, error }: { state?: HomeAssistantState; pending: boolean; action: (key: DashboardAction) => void; error?: string }) {
  const locked = state?.state === 'locked';
  const label = locked ? 'Lås opp ytterdør' : 'Lås ytterdør';
  return <section className="card door-card" aria-labelledby="door-title"><div><h2 id="door-title">Ytterdør</h2><p>{stateValue(state) ? locked ? 'Låst' : 'Ulåst' : '— Ikke tilgjengelig'}</p></div><button type="button" className={`round-icon ${locked ? 'safe' : 'danger'}`} aria-label={label} title={label} disabled={pending} onClick={() => action(locked ? 'unlockDoor' : 'lockDoor')}><Icon filled>{locked ? 'lock' : 'lock_open'}</Icon></button>{error && <p role="alert">{error}</p>}</section>;
}

function SecurityCard({ state, pending, action, error }: { state?: HomeAssistantState; pending: boolean; action: () => void; error?: string }) {
  const status = securityPresentation(state);
  return <button type="button" className={`card security-card ${status.tone}`} disabled={pending} onClick={action}><span><strong>Overvåkning</strong><small>{status.label}</small></span><span className="round-icon"><Icon>{status.icon}</Icon></span>{error && <small role="alert">{error}</small>}</button>;
}

function CameraCard({ title, available, streamPath }: { title: string; available: boolean; streamPath: string }) {
  const [streamAttempt, setStreamAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const retryTimer = useRef<number>();
  useEffect(() => {
    setStreamAttempt(0);
    return () => { if (retryTimer.current) window.clearTimeout(retryTimer.current); };
  }, [available]);
  useEffect(() => { const syncFullscreen = () => setFullscreen(document.fullscreenElement === frameRef.current); document.addEventListener('fullscreenchange', syncFullscreen); return () => document.removeEventListener('fullscreenchange', syncFullscreen); }, []);
  const cameraAvailable = available;
  const imageSource = `${streamPath}?attempt=${streamAttempt}`;
  const liveLabel = `Direktevideo fra ${title.toLocaleLowerCase('nb-NO')}`;
  const reconnect = () => {
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
    retryTimer.current = window.setTimeout(() => setStreamAttempt((current) => current + 1), 750);
  };
  const toggleFullscreen = async () => { if (document.fullscreenElement === frameRef.current) await document.exitFullscreen?.(); else await frameRef.current?.requestFullscreen?.(); };
  return <section className="card doorbell-card" aria-label={title}><h2>{title}</h2><div ref={frameRef} className="camera-frame">{cameraAvailable ? <img src={imageSource} alt={liveLabel} onError={reconnect}/> : <div className="camera-unavailable"><Icon>videocam_off</Icon><span>— Kamera ikke tilgjengelig</span></div>}{cameraAvailable && <span className="live-badge">LIVE</span>}<div className="camera-controls"><button type="button" aria-label={fullscreen ? `Avslutt fullskjerm for ${title}` : `Vis ${title} i fullskjerm`} onClick={() => void toggleFullscreen()}><Icon>{fullscreen ? 'fullscreen_exit' : 'fullscreen'}</Icon></button></div></div></section>;
}

function HeatPumpModal({ states, pending, errors, action, adjust, close, closeButtonRef }: DashboardProps & { close: () => void; closeButtonRef: React.RefObject<HTMLButtonElement> }) {
  return <div className="heatpump-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="heatpump-modal" role="dialog" aria-modal="true" aria-label="Varmepumpe">
      <button className="heatpump-modal-close" ref={closeButtonRef} type="button" aria-label="Lukk varmepumpe" onClick={close}><Icon>close</Icon></button>
      <HeatPump states={states} pending={pending} errors={errors} action={action} adjust={adjust}/>
    </section>
  </div>;
}

const vacuumOptions = (state: HomeAssistantState | undefined) => Array.isArray(state?.attributes.options) ? state.attributes.options.filter((value): value is string => typeof value === 'string') : [];
function VacuumModal({ states, pending, errors, action, close, closeButtonRef }: { states: Record<string, HomeAssistantState>; pending: Record<string, boolean>; errors: Record<string, string>; action: (key: string, option?: string) => void; close: () => void; closeButtonRef: React.RefObject<HTMLButtonElement> }) {
  const cleaning = states.vacuumCleaning?.state === 'on'; const status = stateValue(states.vacuumStatus) ?? (cleaning ? 'Rengjøring pågår' : 'Klar'); const progress = Number(stateValue(states.vacuumProgress));
  const rooms: Array<[string, string, string]> = [['full', 'home', 'Hele huset'], ['gang', 'door_front', 'Gang'], ['kjokken', 'countertops', 'Kjøkken'], ['lounge', 'chair', 'Lounge'], ['stue', 'weekend', 'Stue'], ['morgen', 'wb_sunny', 'Morgen'], ['natt', 'bedtime', 'Natt']];
  const selectControl = (key: 'cleaningMode' | 'mopMode' | 'mopIntensity', label: string, state: HomeAssistantState | undefined) => <label>{label}<select value={stateValue(state) ?? ''} disabled={pending[key]} onChange={(event) => action(key, event.target.value)}><option value="" disabled>Velg</option>{vacuumOptions(state).map((value) => <option value={value} key={value}>{value}</option>)}</select></label>;
  return <div className="vacuum-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="vacuum-modal-shell"><button className="vacuum-modal-close" ref={closeButtonRef} type="button" aria-label="Lukk robotstøvsuger" onClick={close}><Icon>close</Icon></button><section className="vacuum-modal card" role="dialog" aria-modal="true" aria-labelledby="vacuum-title"><header><div><h2 id="vacuum-title"><Icon>vacuum</Icon>Sucky V2</h2><p>{status} {stateValue(states.vacuumRoom) ? `· ${stateValue(states.vacuumRoom)}` : ''}</p></div></header><div className="vacuum-overview"><img src="/api/vacuum-map" alt="Kart over første etasje"/><div><strong>{reading(states.vacuumBattery, ' %')}</strong><span>Batteri</span><div className="vacuum-progress"><i style={{ width: `${Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0}%` }}/></div><p>{reading(states.vacuumProgress, ' %')} ferdig · {reading(states.vacuumArea, ' m²')} · {reading(states.vacuumTime, ' min')}</p></div></div><section><h3>Hurtigkontroller</h3><div className="vacuum-actions"><button type="button" disabled={pending[cleaning ? 'pause' : 'start']} onClick={() => action(cleaning ? 'pause' : 'start')}><Icon>{cleaning ? 'pause' : 'play_arrow'}</Icon>{cleaning ? 'Sett på pause' : 'Start'}</button><button type="button" disabled={pending.dock} onClick={() => action('dock')}><Icon>home</Icon>Send til dokk</button><button type="button" disabled={pending.locate} onClick={() => action('locate')}><Icon>location_searching</Icon>Finn roboten</button></div></section><button className="vacuum-kitchen" type="button" disabled={pending.kitchenRefill} onClick={() => action('kitchenRefill')}><Icon>water_drop</Icon>Send til kjøkken og fyll vann</button><section><h3>Rutiner</h3><div className="vacuum-routines">{rooms.map(([key, icon, label]) => <button type="button" key={key} disabled={pending[key]} onClick={() => action(key)}><Icon>{icon}</Icon>{label}</button>)}</div></section><section className="vacuum-settings">{selectControl('cleaningMode', 'Rengjøringsmodus', states.vacuumCleaningMode)}{selectControl('mopMode', 'Moppemodus', states.vacuumMopMode)}{selectControl('mopIntensity', 'Moppeintensitet', states.vacuumMopIntensity)}<label>Volum<input type="range" min="0" max="100" value={Number(stateValue(states.vacuumVolume)) || 0} disabled={pending.volume} onChange={(event) => action('volume', event.target.value)}/></label></section>{errors.vacuum && <p className="card-error" role="alert">{errors.vacuum}</p>}</section></div></div>;
}

function Toast({ message }: { message: string | null }) { return message ? <div className="action-toast" role="status"><Icon filled>check_circle</Icon><span>{message}</span></div> : null; }

const reading = (state: HomeAssistantState | undefined, unit = '') => stateValue(state) ? `${stateValue(state)}${unit}` : '—';
const roomDefinitions = [
  ['roomLiving', 'roomLivingHumidity', 'roomLivingCo2', 'Stue', 'weekend'],
  ['roomBedroom', 'roomBedroomHumidity', 'roomBedroomCo2', 'Soverom HA', 'bed'],
  ['roomBathroom', 'roomBathroomHumidity', 'roomBathroomCo2', 'Soverom barn', 'child_care'],
] as const;
function RoomCard({ name, icon, temperature, humidity, co2 }: { name: string; icon: string; temperature?: HomeAssistantState; humidity?: HomeAssistantState; co2?: HomeAssistantState }) {
  return <section className="card room-card" aria-label={`Rom: ${name}`}>
    <header><h3>{name}</h3><Icon>{icon}</Icon></header>
    <strong className="room-temperature">{reading(temperature, '°')}</strong>
    <div className="room-readings">
      <span className="room-reading humidity"><b>{reading(humidity)}</b><small>%</small></span>
      <span className="room-reading co2"><b>{reading(co2)}</b><small>ppm</small></span>
    </div>
    <footer aria-hidden="true"><Icon>air</Icon><Icon filled>lightbulb</Icon></footer>
  </section>;
}

function RoomClimateCard({ states }: { states: Record<string, HomeAssistantState> }) {
  const visibleRooms = roomDefinitions.slice(0, 3);
  const rotatingRooms = roomDefinitions.slice(3);
  const [activeRoom, setActiveRoom] = useState(0);
  useEffect(() => {
    if (rotatingRooms.length < 2) return;
    const timer = window.setInterval(() => setActiveRoom((current) => (current + 1) % rotatingRooms.length), 4_000);
    return () => window.clearInterval(timer);
  }, [rotatingRooms.length]);
  const rotating = rotatingRooms[activeRoom];
  return <section className="card room-climate-card" aria-labelledby="room-climate-title">
    <header><h2 id="room-climate-title">Romklima</h2>{rotating ? <span className="room-carousel" key={rotating[0]}>{rotating[3]} <b>{reading(states[rotating[0]], '°')}</b> · CO₂ {reading(states[rotating[2]])}</span> : <span className="room-count">{visibleRooms.length} rom</span>}</header>
    <div className="room-climate-rows">{visibleRooms.map(([id, humidityId, co2Id, name]) => <div className="room-climate-row" key={id}><strong>{name}</strong><RoomClimateMetric label="Temperatur" value={reading(states[id], '°')} trend={states[id]?.attributes.trend}/><RoomClimateMetric label="Fuktighet" value={reading(states[humidityId], ' %')} trend={states[humidityId]?.attributes.trend}/><RoomClimateMetric label="CO₂" value={reading(states[co2Id], ' ppm')} trend={states[co2Id]?.attributes.trend} air/></div>)}</div>
  </section>;
}

function RoomClimateMetric({ label, value, trend, air = false }: { label: string; value: string; trend: unknown; air?: boolean }) {
  const values = Array.isArray(trend) ? trend.filter((point): point is number => typeof point === 'number' && Number.isFinite(point)) : [];
  const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(max - min, .001);
  const points = values.length > 1 ? values.map((point, index) => `${index * 100 / (values.length - 1)},${18 - (point - min) / range * 14}`).join(' ') : '';
  return <span className={air ? 'air' : ''}><small>{label}</small><b>{value}</b>{points ? <svg className="room-trend" viewBox="0 0 100 20" preserveAspectRatio="none" aria-label={`${label}: trend siste 30 minutter`}><polyline points={points}/></svg> : <i className="room-trend-empty" aria-label={`${label}: trenddata ikke tilgjengelig`}>—</i>}</span>;
}

const numericState = (state: HomeAssistantState | undefined) => {
  const value = Number(state?.state);
  return Number.isFinite(value) ? value : undefined;
};

const priceSeries = (state: HomeAssistantState | undefined, key: 'today' | 'tomorrow') => {
  const source = state?.attributes[key];
  if (!Array.isArray(source)) return [] as number[];
  const values = source.flatMap((item) => {
    if (typeof item === 'number' && Number.isFinite(item)) return [item];
    if (typeof item === 'string' && Number.isFinite(Number(item))) return [Number(item)];
    if (typeof item === 'object' && item !== null) {
      const value = (item as Record<string, unknown>).value ?? (item as Record<string, unknown>).price;
      return typeof value === 'number' && Number.isFinite(value) ? [value] : [];
    }
    return [];
  });
  // Nordpool exposes 15-minute values. The card chart uses one point per hour
  // so it remains readable at the same compact size as the weather card.
  if (values.length > 24 && values.length % 24 === 0) {
    const pointsPerHour = values.length / 24;
    return Array.from({ length: 24 }, (_, hour) => {
      const hourValues = values.slice(hour * pointsPerHour, (hour + 1) * pointsPerHour);
      return hourValues.reduce((total, value) => total + value, 0) / hourValues.length;
    });
  }
  return values;
};

const consumptionSeries = (state: HomeAssistantState | undefined) => {
  const source = state?.attributes.hourlyConsumption;
  if (!Array.isArray(source)) return [] as number[];
  return source.flatMap((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? [value] : []);
};

function EnergyPriceChart({ price, consumption }: { price?: HomeAssistantState; consumption?: HomeAssistantState }) {
  const today = priceSeries(price, 'today');
  const tomorrow = priceSeries(price, 'tomorrow');
  const all = [...today, ...tomorrow];
  const hourlyConsumption = consumptionSeries(consumption);
  if (!all.length && !hourlyConsumption.length) return <div className="energy-chart-empty">Energigraf ikke tilgjengelig</div>;
  const width = 620; const height = 134; const left = 64; const right = 68; const top = 8; const bottom = 28;
  const max = Math.max(1, ...all) * 1.12;
  const consumptionMax = Math.max(.1, ...hourlyConsumption) * 1.12;
  const x = (index: number) => left + (index / 23) * (width - left - right);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const consumptionY = (value: number) => top + (1 - value / consumptionMax) * (height - top - bottom);
  const path = (values: number[]) => values.length ? values.map((value, index) => `${index ? 'L' : 'M'}${x(index)} ${y(value)}`).join(' ') : '';
  const currentHour = new Date().getHours();
  const barWidth = (width - left - right) / 24 * .7;
  return <div className="energy-chart-wrap">
    <svg className="energy-chart" role="img" aria-label="Strømpris de neste 48 timene" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      {[0, .5, 1].map((ratio) => <line key={ratio} className="energy-gridline" x1={left} x2={width - right} y1={top + ratio * (height - top - bottom)} y2={top + ratio * (height - top - bottom)}/>)}
      {hourlyConsumption.map((value, index) => <rect key={`consumption-${index}`} className="energy-consumption-bar" x={x(index) - barWidth / 2} y={consumptionY(value)} width={barWidth} height={height - bottom - consumptionY(value)} rx="1.5"/>)}
      <path className="energy-price-today" d={path(today)}/>
      {tomorrow.length > 0 && <path className="energy-price-tomorrow" d={path(tomorrow)}/>}
      {today.length > currentHour && <line className="energy-now-line" x1={x(currentHour)} x2={x(currentHour)} y1={top} y2={height - bottom}/>}
      {[0, 6, 12, 18, 23].map((hour) => <text key={hour} className="energy-time-label" x={x(hour)} y={height + 1}>{String(hour).padStart(2, '0')}</text>)}
      {[0, .5, 1].map((ratio) => <text key={`price-${ratio}`} className="energy-price-label" x={left - 7} y={top + ratio * (height - top - bottom) + 5}>{`${(max * (1 - ratio)).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} kr/kWh`}</text>)}
      {hourlyConsumption.length > 0 && [0, .5, 1].map((ratio) => <text key={`consumption-${ratio}`} className="energy-value-label" x={width - right + 7} y={top + ratio * (height - top - bottom) + 5}>{`${(consumptionMax * (1 - ratio)).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} kWh`}</text>)}
    </svg>
    <div className="energy-legend"><span className="energy-legend-consumption"><Icon>bar_chart</Icon>Forbruk</span><span className="energy-legend-today">Dagens pris</span><span className="energy-legend-tomorrow">Neste døgn</span></div>
  </div>;
}

function EnergyCard({ states }: { states: Record<string, HomeAssistantState> }) {
  const powerWatts = numericState(states.energyPower);
  const power = powerWatts === undefined ? undefined : powerWatts / 1000;
  const today = numericState(states.energyToday);
  const yesterday = numericState(states.energyYesterday);
  const price = numericState(states.energyPrice);
  return <section className="card energy-card" aria-labelledby="energy-title">
    <header className="energy-top"><Icon>bolt</Icon><div><h2 id="energy-title">{fmt(power, ' kW')}</h2><span>Effekt nå</span></div><div className="energy-price-now"><strong>{fmt(price, ' kr/kWh')}</strong><span>Pris nå</span></div></header>
    <div className="energy-totals"><div><strong>{fmt(today, ' kWh')}</strong><span>I dag</span></div><div><strong>{fmt(yesterday, ' kWh')}</strong><span>I går</span></div></div>
    <EnergyPriceChart price={states.energyPrice} consumption={states.energyToday}/>
  </section>;
}
function Metrics({ states }: { states: Record<string, HomeAssistantState> }) {
  const events = Array.isArray(states.calendar?.attributes.events) ? states.calendar.attributes.events.slice(0, 2) as Array<Record<string, unknown>> : [];
  return <div className="metric-row">
    <section className="card metric energy"><h3>Energi i dag</h3><strong>{reading(states.energyToday, ` ${typeof states.energyToday?.attributes.unit_of_measurement === 'string' ? states.energyToday.attributes.unit_of_measurement : 'kWh'}`)}</strong><div className="energy-bars" aria-hidden="true">{[38,72,46,82,32,68].map((h, i) => <i key={i} style={{height:`${h}%`}}/>)}</div></section>
    {roomDefinitions.map(([id, humidityId, co2Id, name, icon]) => <RoomCard key={id} name={name} icon={icon} temperature={states[id]} humidity={states[humidityId]} co2={states[co2Id]}/>)}
    <section className="card metric waste"><h3>Søppeltømming</h3><div><Icon>delete</Icon><strong>{reading(states.waste)}</strong></div><p>{typeof states.waste?.attributes.types === 'string' ? states.waste.attributes.types : 'Ikke tilgjengelig'}</p></section>
    <section className="card metric car"><h3><Icon>directions_car</Icon>Andreas</h3><p>Rekkevidde <strong>{reading(states.carAndreasRange, ' km')}</strong></p><p>Til jobb <strong>{reading(states.andreasTravelTime, ' min')}</strong></p></section>
    <section className="card metric car"><h3><Icon>directions_car</Icon>Hege</h3><p>Rekkevidde <strong>{reading(states.carHegeRange, ' km')}</strong></p><p>Til jobb <strong>{reading(states.hegeTravelTime, ' min')}</strong></p></section>
    <section className="card metric calendar"><h3>Kalender</h3>{events.length ? events.map((event, index) => <p key={index}><strong>{typeof event.when === 'string' ? event.when : '—'}</strong> · {typeof event.summary === 'string' ? event.summary : 'Ikke tilgjengelig'}</p>) : <p>— Ingen kalenderdata</p>}</section>
  </div>;
}

function MetricsUpdated({ states }: { states: Record<string, HomeAssistantState> }) {
  const events = calendarEvents(states.calendar);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const days = [{ label: 'I dag', key: calendarDayKey(today.toISOString()) }, { label: 'I morgen', key: calendarDayKey(tomorrow.toISOString()) }];
  const wasteDays = wasteDaysUntil(states.waste);
  const wasteTypes = typeof states.waste?.attributes.types === 'string' ? states.waste.attributes.types : typeof states.waste?.attributes.collection_type === 'string' ? states.waste.attributes.collection_type : stateValue(states.waste)?.replace(/^\s*\d+\s*,\s*/, '') || 'Ikke tilgjengelig';
  return <div className="metric-row">
    <section className="card metric energy"><h3>Energi i dag</h3><strong>{reading(states.energyToday, ` ${typeof states.energyToday?.attributes.unit_of_measurement === 'string' ? states.energyToday.attributes.unit_of_measurement : 'kWh'}`)}</strong><div className="energy-bars" aria-hidden="true">{[38,72,46,82,32,68].map((h, i) => <i key={i} style={{height:`${h}%`}}/>)}</div></section>
    {roomDefinitions.map(([id, humidityId, co2Id, name, icon]) => <RoomCard key={id} name={name} icon={icon} temperature={states[id]} humidity={states[humidityId]} co2={states[co2Id]}/>)}
    <section className="card metric waste"><h3>Søppeltømming</h3><div><Icon>delete</Icon><strong>{wasteDays === undefined ? '—' : `${wasteDays} ${wasteDays === 1 ? 'dag' : 'dager'}`}</strong></div><p>{wasteTypes}</p></section>
    <section className="card metric car"><h3><Icon>directions_car</Icon>Andreas</h3><p>Rekkevidde <strong>{reading(states.carAndreasRange, ' km')}</strong></p><p>Batteri <strong>{reading(states.carAndreasBattery, ' %')}</strong></p><p>Til jobb <strong>{reading(states.andreasTravelTime, ' min')}</strong></p></section>
    <section className="card metric car"><h3><Icon>directions_car</Icon>Hege</h3><p>Rekkevidde <strong>{reading(states.carHegeRange, ' km')}</strong></p><p>Batteri <strong>{reading(states.carHegeBattery, ' %')}</strong></p><p>Til jobb <strong>{reading(states.hegeTravelTime, ' min')}</strong></p></section>
    <section className="card metric calendar"><h3>Kalender</h3>{days.map((day) => { const dayEvents = events.filter((event) => calendarEventOccursOnDay(event, day.key)); return <div className="calendar-day" key={day.key}><strong>{day.label}</strong>{dayEvents.length ? dayEvents.map((event) => <p key={`${event.start}-${event.title}`}><b>{event.title}</b><span>{event.allDay ? 'Hele dagen' : `${formatCalendarTime(event.start)}–${formatCalendarTime(event.end)}`}</span></p>) : <p>Ingen avtaler</p>}</div>; })}</section>
  </div>;
}

function metricCards(states: Record<string, HomeAssistantState>): LayoutChild[] {
  const events = calendarEvents(states.calendar);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const days = [{ label: 'I dag', key: calendarDayKey(today.toISOString()) }, { label: 'I morgen', key: calendarDayKey(tomorrow.toISOString()) }];
  const wasteDays = wasteDaysUntil(states.waste);
  const wasteTypes = typeof states.waste?.attributes.types === 'string' ? states.waste.attributes.types : typeof states.waste?.attributes.collection_type === 'string' ? states.waste.attributes.collection_type : stateValue(states.waste)?.replace(/^\s*\d+\s*,\s*/, '') || 'Ikke tilgjengelig';
  return [
    { id: 'energy', label: 'Energi', content: <EnergyCard states={states}/> },
    { id: 'roomClimate', label: 'Romklima', content: <RoomClimateCard states={states}/> },
    { id: 'carAndreas', label: 'Andreas bil', content: <section className="card metric car"><h3><Icon>directions_car</Icon>Andreas</h3><p>Rekkevidde <strong>{reading(states.carAndreasRange, ' km')}</strong></p><p>Batteri <strong>{reading(states.carAndreasBattery, ' %')}</strong></p><p>Til jobb <strong>{reading(states.andreasTravelTime, ' min')}</strong></p></section> },
    { id: 'carHege', label: 'Hege bil', content: <section className="card metric car"><h3><Icon>directions_car</Icon>Hege</h3><p>Rekkevidde <strong>{reading(states.carHegeRange, ' km')}</strong></p><p>Batteri <strong>{reading(states.carHegeBattery, ' %')}</strong></p><p>Til jobb <strong>{reading(states.hegeTravelTime, ' min')}</strong></p></section> },
    { id: 'calendar', label: 'Kalender', content: <section className="card metric calendar"><h3>Kalender</h3>{days.map((day) => { const dayEvents = events.filter((event) => calendarEventOccursOnDay(event, day.key)); return <div className="calendar-day" key={day.key}><strong>{day.label}</strong>{dayEvents.length ? dayEvents.map((event) => <p key={`${event.start}-${event.title}`}><b>{event.title}</b><span>{event.allDay ? 'Hele dagen' : `${formatCalendarTime(event.start)}–${formatCalendarTime(event.end)}`}</span></p>) : <p>Ingen avtaler</p>}</div>; })}<div className="calendar-waste-section"><h3>Søppeltømming</h3><div className="calendar-waste"><Icon>delete</Icon><strong>{wasteDays === undefined ? '—' : `${wasteDays} ${wasteDays === 1 ? 'dag' : 'dager'}`}</strong><span>-</span><span>{wasteTypes}</span></div></div></section> },
  ];
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

function RegularDashboard({ states, pending, errors, action, adjust, showWeather, editing, layout, updateLayout }: DashboardProps & { showWeather: () => void; editing: boolean; layout: GridLayouts; updateLayout: (next: GridLayouts) => void }) {
  return <EditableDashboard mode="regular" editing={editing} layout={layout} updateLayout={updateLayout} children={[
    { id: 'frontDoor', label: 'Ytterdør', content: <DoorCard state={states.frontDoorLock} pending={pending.lockDoor || pending.unlockDoor} action={action} error={errors.lockDoor || errors.unlockDoor}/> },
    { id: 'security', label: 'Overvåkning', content: <SecurityCard state={states.securityMode} pending={pending.securityMode} action={() => action('securityMode')} error={errors.securityMode}/> },
    { id: 'weather', label: 'Vær', content: <WeatherOverview states={states} regular onDetails={showWeather}/> },
    { id: 'doorbell', label: 'Ringeklokke', content: <CameraCard title="Ringeklokke" available={Boolean(stateValue(states.doorbellCamera))} streamPath="/api/camera/stream"/> },
    { id: 'courtyard', label: 'Gårdsplassen', content: <CameraCard title="Gårdsplassen" available={Boolean(stateValue(states.courtyardCamera))} streamPath="/api/courtyard-camera/stream"/> },
    ...metricCards(states),
  ]}/>;
}

interface DashboardProps { states: Record<string, HomeAssistantState>; pending: Record<string, boolean>; errors: Record<string, string>; action: (key: DashboardAction, option?: HeatPumpMode | FanSpeed) => void; adjust: (offset: number) => void }
function GuestDashboard({ states, pending, errors, action, adjust, editing, layout, updateLayout }: DashboardProps & { editing: boolean; layout: GridLayouts; updateLayout: (next: GridLayouts) => void }) {
  const voucher = stateValue(states.guestVoucher);
  return <EditableDashboard mode="guest" editing={editing} layout={layout} updateLayout={updateLayout} children={[{ id: 'guest', label: 'Gjestemodus', content: <GuestSwitch on={states.guestMode?.state === 'on'} pending={pending.guestMode} action={() => action('guestMode')}/> }, { id: 'weather', label: 'Vær', content: <WeatherOverview states={states}/> }, { id: 'wifi', label: 'Gjeste-WiFi', content: <GuestWifi voucher={voucher} pending={pending.guestVoucher} renew={() => action('guestVoucher')}/> }]}/>;
}

function ChildDashboard({ states, pending, errors, action, adjust, editing, layout, updateLayout }: DashboardProps & { editing: boolean; layout: GridLayouts; updateLayout: (next: GridLayouts) => void }) {
  return <EditableDashboard mode="child" editing={editing} layout={layout} updateLayout={updateLayout} children={[{ id: 'guest', label: 'Gjestemodus', content: <GuestSwitch child on={states.guestMode?.state === 'on'} pending={pending.guestMode} action={() => action('guestMode')}/> }, { id: 'weather', label: 'Vær', content: <WeatherOverview states={states}/> }, { id: 'scenes', label: 'Scener', content: <section className="card scenes-card large"><h2>Scener</h2><SceneButtons action={action} pending={pending} errors={errors}/></section> }]}/>;
}

function DetailedWeather({ states, close }: { states: Record<string, HomeAssistantState>; close: () => void }) {
  const [tab, setTab] = useState<WeatherTab>('today');
  const hourly = forecastPoints(states.weatherHourly);
  const daily = forecastPoints(states.weatherDaily);
  return <main className="dashboard weather-detail"><header className="weather-detail-header"><button type="button" onClick={close}><Icon>arrow_back</Icon>Tilbake</button><h1>Detaljert vær</h1><div role="tablist" aria-label="Værperiode"><button type="button" role="tab" aria-selected={tab === 'today'} className={tab === 'today' ? 'selected' : ''} onClick={() => setTab('today')}>I dag</button><button type="button" role="tab" aria-selected={tab === 'week'} className={tab === 'week' ? 'selected' : ''} onClick={() => setTab('week')}>Neste 7 dager</button></div></header><div className="weather-detail-grid"><section className="card detail-chart"><h2>{tab === 'today' ? 'I dag' : 'Neste 7 dager'}</h2><WeatherChart points={tab === 'today' ? hourly : daily} detailed/></section><section className="card hourly-card"><h2>Time for time</h2><div className="hourly-strip">{hourly.slice(0, 7).map((point) => <div key={point.datetime}><time>{new Date(point.datetime).toLocaleTimeString('nb-NO', {hour:'2-digit', minute:'2-digit'})}</time><WeatherGlyph condition={point.condition}/><strong>{fmt(point.temperature, '°')}</strong><small>{fmt(point.precipitation, ' mm')}</small><small>{fmt(point.windSpeed, ' m/s')}</small></div>)}{!hourly.length && <p>— Timevarsel ikke tilgjengelig</p>}</div></section><section className="card week-card"><h2>Neste 7 dager</h2>{daily.slice(0,7).map((point) => <div key={point.datetime}><span>{new Date(point.datetime).toLocaleDateString('nb-NO',{weekday:'short'})}</span><WeatherGlyph condition={point.condition}/><strong>{fmt(point.temperature, '°')}</strong><small>/ {fmt(point.templow, '°')}</small></div>)}{!daily.length && <p>— Ukesvarsel ikke tilgjengelig</p>}</section></div></main>;
}

const stateRefreshIntervalMs = 30_000;

export default function App({ api = browserApi }: { api?: DashboardApi }) {
  const [states, setStates] = useState<Record<string, HomeAssistantState>>({});
  const [mode, setMode] = useState<Mode>('regular');
  const [editing, setEditing] = useState(false);
  const [layouts, setLayouts] = useState<Record<Mode, GridLayouts>>(() => ({ regular: loadLayout('regular'), guest: loadLayout('guest'), child: loadLayout('child') }));
  const [detailedWeather, setDetailedWeather] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [repairOpen, setRepairOpen] = useState(false);
  const [heatPumpOpen, setHeatPumpOpen] = useState(false);
  const [vacuumOpen, setVacuumOpen] = useState(false);
  const [klaraAiOpen, setKlaraAiOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const repairButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const heatPumpButton = useRef<HTMLButtonElement>(null);
  const heatPumpCloseButton = useRef<HTMLButtonElement>(null);
  const vacuumButton = useRef<HTMLButtonElement>(null);
  const vacuumCloseButton = useRef<HTMLButtonElement>(null);
  const klaraButton = useRef<HTMLButtonElement>(null);
  const klaraCloseButton = useRef<HTMLButtonElement>(null);
  const wasRepairOpen = useRef(false);
  const wasHeatPumpOpen = useRef(false);
  const wasVacuumOpen = useRef(false);
  const wasKlaraAiOpen = useRef(false);
  const previousAiText = useRef<string | undefined>();

  useEffect(() => {
    let active = true;
    let requestInFlight = false;

    const refreshStates = async () => {
      if (!active || requestInFlight) return;
      requestInFlight = true;
      try {
        const { states: confirmed } = await api.getStates();
        if (!active) return;
        const aiText = stateValue(confirmed.weatherSummary);
        if (previousAiText.current !== undefined && aiText && aiText !== previousAiText.current) setKlaraAiOpen(true);
        previousAiText.current = aiText;
        setStates(confirmed);
        setErrors((current) => {
          if (!current.load) return current;
          const next = { ...current };
          delete next.load;
          return next;
        });
      } catch {
        if (active) setErrors((current) => ({ ...current, load: updateError }));
      } finally {
        requestInFlight = false;
      }
    };

    void refreshStates();
    const timer = window.setInterval(() => { void refreshStates(); }, stateRefreshIntervalMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [api]);
  useEffect(() => { if (!repairOpen) return; closeButton.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setRepairOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [repairOpen]);
  useEffect(() => { if (!repairOpen && wasRepairOpen.current) repairButton.current?.focus(); wasRepairOpen.current = repairOpen; }, [repairOpen]);
  useEffect(() => { if (!heatPumpOpen) return; heatPumpCloseButton.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setHeatPumpOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [heatPumpOpen]);
  useEffect(() => { if (!heatPumpOpen && wasHeatPumpOpen.current) heatPumpButton.current?.focus(); wasHeatPumpOpen.current = heatPumpOpen; }, [heatPumpOpen]);
  useEffect(() => { if (!vacuumOpen) return; vacuumCloseButton.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setVacuumOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [vacuumOpen]);
  useEffect(() => { if (!vacuumOpen && wasVacuumOpen.current) vacuumButton.current?.focus(); wasVacuumOpen.current = vacuumOpen; }, [vacuumOpen]);
  useEffect(() => { if (!klaraAiOpen) return; klaraCloseButton.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setKlaraAiOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [klaraAiOpen]);
  useEffect(() => { if (!klaraAiOpen && wasKlaraAiOpen.current) klaraButton.current?.focus(); wasKlaraAiOpen.current = klaraAiOpen; }, [klaraAiOpen]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 4_000); return () => window.clearTimeout(timer); }, [toast]);

  const confirm = async (key: string, operation: () => Promise<{ states: Record<string, HomeAssistantState> }>) => { setPending((value) => ({ ...value, [key]: true })); setErrors((value) => ({ ...value, [key]: '' })); try { const result = await operation(); setStates((value) => ({ ...value, ...result.states })); if (key in sceneConfirmation) setToast(sceneConfirmation[key as keyof typeof sceneConfirmation]); } catch { setErrors((value) => ({ ...value, [key]: updateError })); } finally { setPending((value) => { const next = { ...value }; delete next[key]; return next; }); } };
  const action = (key: DashboardAction, option?: HeatPumpMode | FanSpeed) => { void confirm(key, () => api.runAction(key, option)); };
  const vacuumAction = (_key: string, option?: string) => { void confirm('vacuum', () => browserApi.runVacuumAction(_key, option)); };
  const baseline = temperatureNumber(states.climate) ?? currentTemperatureNumber(states.climate);
  const adjust = (offset: number) => { if (baseline !== undefined) void confirm('temperature', () => api.setTemperature(baseline + offset)); };
  const dashboardProps = useMemo(() => ({ states, pending, errors, action, adjust }), [states, pending, errors]);
  const repair = isRepairNeeded(states.repairHealth);
  const updateLayout = (next: GridLayouts) => setLayouts((current) => { const modeLayout = Object.fromEntries(Object.entries(next).map(([id, placement]) => [id, { ...placement }])); window.localStorage.setItem(layoutKey(mode), JSON.stringify(modeLayout)); return { ...current, [mode]: modeLayout }; });
  const saveDefaultLayout = () => {
    window.localStorage.setItem(defaultLayoutKey(mode), JSON.stringify(layouts[mode]));
    window.localStorage.removeItem(layoutKey(mode));
  };
  const resetLayout = () => setLayouts((current) => { window.localStorage.removeItem(layoutKey(mode)); return { ...current, [mode]: loadLayout(mode) }; });

  if (detailedWeather) return <DetailedWeather states={states} close={() => setDetailedWeather(false)}/>;
  return <main className="dashboard"><Toast message={toast}/><DashboardHeader mode={mode} setMode={setMode} repair={repair} openRepair={() => setRepairOpen(true)} repairRef={repairButton} editing={editing} setEditing={setEditing} resetLayout={resetLayout} saveDefaultLayout={saveDefaultLayout} action={action} pending={pending} errors={errors}/>{errors.load && <p className="load-error" role="alert">{errors.load}</p>}<div className="dashboard-content">{mode === 'regular' ? <RegularDashboard {...dashboardProps} showWeather={() => setDetailedWeather(true)} editing={editing} layout={layouts.regular} updateLayout={updateLayout}/> : mode === 'guest' ? <GuestDashboard {...dashboardProps} editing={editing} layout={layouts.guest} updateLayout={updateLayout}/> : <ChildDashboard {...dashboardProps} editing={editing} layout={layouts.child} updateLayout={updateLayout}/>}</div><QuickControls openHeatPump={() => setHeatPumpOpen(true)} openVacuum={() => setVacuumOpen(true)} openKlaraAi={() => setKlaraAiOpen(true)} heatPumpButtonRef={heatPumpButton} vacuumButtonRef={vacuumButton} klaraButtonRef={klaraButton}/>{heatPumpOpen && <HeatPumpModal {...dashboardProps} close={() => setHeatPumpOpen(false)} closeButtonRef={heatPumpCloseButton}/>} {vacuumOpen && <VacuumModal states={states} pending={pending} errors={errors} action={vacuumAction} close={() => setVacuumOpen(false)} closeButtonRef={vacuumCloseButton}/>} {klaraAiOpen && <KlaraAiModal states={states} close={() => setKlaraAiOpen(false)} closeButtonRef={klaraCloseButton}/>} {repairOpen && <div className="repair-backdrop"><section className="repair-modal" role="dialog" aria-modal="true" aria-labelledby="repair-title"><header><h2 id="repair-title"><Icon>warning</Icon>Systemreparasjon (8080)</h2><button ref={closeButton} type="button" aria-label="Lukk" onClick={() => setRepairOpen(false)}><Icon>close</Icon></button></header><iframe title="Reparer smarthuset" src="http://192.168.1.127:8080/"/></section></div>}</main>;
}
