import { useEffect, useRef, useState } from 'react';
import type { HomeAssistantState } from '../shared/entities';
import { conditionIcon, conditionLabel, currentTemperatureNumber, forecastPoints, stateValue, type ForecastPoint } from './dashboardModel';

const Icon = ({ children, filled = false, className }: { children: string; filled?: boolean; className?: string }) => <span className={`material-symbols-outlined ${className ?? ''}`} style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined} aria-hidden="true">{children}</span>;
const fmt = (value: number | undefined, unit = '') => value === undefined ? '—' : `${value.toLocaleString('nb-NO', { maximumFractionDigits: 1 })}${unit}`;
type ChartPoint = { x: number; y: number };

// Cubic Bézier interpolation keeps every chart readable at a glance without
// changing the underlying measurements or joining gaps in missing data.
export const smoothPath = (points: Array<ChartPoint | undefined>) => {
  const segments: ChartPoint[][] = [];
  let segment: ChartPoint[] = [];
  for (const point of points) {
    if (point) segment.push(point);
    else if (segment.length) { segments.push(segment); segment = []; }
  }
  if (segment.length) segments.push(segment);
  return segments.map((current) => {
    if (current.length === 1) return `M${current[0].x.toFixed(1)} ${current[0].y.toFixed(1)}`;
    let path = `M${current[0].x.toFixed(1)} ${current[0].y.toFixed(1)}`;
    for (let index = 0; index < current.length - 1; index += 1) {
      const previous = current[index - 1] ?? current[index];
      const start = current[index];
      const end = current[index + 1];
      const following = current[index + 2] ?? end;
      const control1 = { x: start.x + (end.x - previous.x) / 6, y: start.y + (end.y - previous.y) / 6 };
      const control2 = { x: end.x - (following.x - start.x) / 6, y: end.y - (following.y - start.y) / 6 };
      path += ` C${control1.x.toFixed(1)} ${control1.y.toFixed(1)} ${control2.x.toFixed(1)} ${control2.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
    }
    return path;
  }).join(' ');
};

export const WeatherGlyph = ({ condition, large = false }: { condition?: string; large?: boolean }) => (
  <Icon filled={conditionIcon(condition) === 'sunny'}>{conditionIcon(condition)}</Icon>
);

const compassDirections: Array<[string, number, string]> = [
  ['N', 0, 'N'], ['NØ', 45, 'NØ'], ['Ø', 90, 'Ø'], ['SØ', 135, 'SØ'],
  ['S', 180, 'S'], ['SV', 225, 'SV'], ['V', 270, 'V'], ['NV', 315, 'NV'],
];
const compassBearing = (direction?: string) => {
  const normalized = direction?.trim().toUpperCase().replaceAll('ØST', 'Ø').replaceAll('VEST', 'V').replaceAll('NORD', 'N').replaceAll('SØR', 'S');
  return compassDirections.find(([short]) => short === normalized)?.[1];
};
const compassDirection = (bearing: number) => compassDirections.reduce((nearest, option) => Math.abs((((bearing - option[1]) + 540) % 360) - 180) < Math.abs((((bearing - nearest[1]) + 540) % 360) - 180) ? option : nearest)[2];
const numberState = (state?: HomeAssistantState) => {
  const value = Number(stateValue(state));
  return Number.isFinite(value) ? value : undefined;
};

function WindReading({ states }: { states: Record<string, HomeAssistantState> }) {
  const speed = numberState(states.netatmoWindSpeed);
  const gust = numberState(states.netatmoWindGust);
  const speedUnit = typeof states.netatmoWindSpeed?.attributes.unit_of_measurement === 'string' ? states.netatmoWindSpeed.attributes.unit_of_measurement : 'm/s';
  const gustUnit = typeof states.netatmoWindGust?.attributes.unit_of_measurement === 'string' ? states.netatmoWindGust.attributes.unit_of_measurement : speedUnit;
  const reportedDirection = stateValue(states.netatmoWindDirection);
  const bearingFrom = numberState(states.netatmoWindAngle) ?? numberState(states.netatmoWindDirection) ?? compassBearing(reportedDirection);
  const bearingTo = bearingFrom === undefined ? undefined : (bearingFrom + 180) % 360;
  const from = reportedDirection && !Number.isFinite(Number(reportedDirection)) ? reportedDirection : bearingFrom === undefined ? '—' : compassDirection(bearingFrom);
  const to = bearingTo === undefined ? undefined : compassDirection(bearingTo);
  const label = `Vind: ${fmt(speed, ` ${speedUnit}`)}. Kast: ${fmt(gust, ` ${gustUnit}`)}. Vindretning ${from}${to ? `. Pilen peker mot ${to}.` : ''}`;
  return <div className="weather-wind-reading" aria-label={label}>
    <div className="wind-reading-values"><span><small>Vind</small><strong>{fmt(speed, ` ${speedUnit}`)}</strong></span><span><small>Kast</small><strong>{fmt(gust, ` ${gustUnit}`)}</strong></span></div>
    <div className={`wind-compass${bearingTo === undefined ? ' is-unavailable' : ''}`} aria-hidden="true"><b className="compass-n">N</b><b className="compass-e">Ø</b><b className="compass-s">S</b><b className="compass-w">V</b>{bearingTo !== undefined && <span className="material-symbols-outlined wind-compass-arrow" style={{ transform: `translate(-50%, -50%) rotate(${bearingTo}deg)` }}>navigation</span>}</div>
  </div>;
}

export function WeatherChart({ points, detailed = false, labelByDay = false }: { points: ForecastPoint[]; detailed?: boolean; labelByDay?: boolean }) {
  const width = 900;
  // Keep the dashboard preview deliberately short so its axis labels can be
  // assessed at the card's compact size. The detailed weather view retains a
  // full day of hourly forecast data.
  const data = points.slice(0, detailed ? 25 : 6);
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
  // The detailed card uses the same visible gaps as the smaller overview
  // chart. Its SVG is much wider, so the internal gutters scale down with its
  // smaller label type instead of leaving an oversized empty border.
  const plot = detailed
    ? { left: 92, right: 103, top: 31, bottom: 2 }
    : { left: 175, right: 175, top: 31, bottom: 25 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const pathFor = (values: Array<number | undefined>, rangeMin: number, rangeMax: number) => smoothPath(values.map((value, index) => {
    if (value === undefined) return undefined;
    const x = plot.left + (values.length < 2 ? 0 : index * plotWidth / (values.length - 1));
    const y = plot.top + plotHeight - ((value - rangeMin) / Math.max(rangeMax - rangeMin, 1)) * plotHeight;
    return { x, y };
  }));
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
      {ticks.map((ratio) => { const y = plot.top + ratio * plotHeight; const temperature = max - ratio * (max - min); const rain = precipitationMax * (1 - ratio); const percent = Math.round(100 - ratio * 100); const wind = windMax * (1 - ratio); return <g key={ratio}><line x1={plot.left} x2={width - plot.right} y1={y} y2={y} className="gridline" /><text className="axis-label axis-left" textAnchor="start" x={10} y={y + 4}><tspan>{temperature.toFixed(0)}°</tspan><tspan className="axis-rain-value"> · {rain.toFixed(1)} mm</tspan></text>{detailed ? <text className="axis-label axis-right" textAnchor="end" x={width - 10} y={y + 4}><tspan>{percent}%</tspan><tspan className="axis-wind-value"> · {wind.toFixed(1)} m/s</tspan></text> : <><text className="axis-label axis-right" textAnchor="start" x={width - plot.right + 10} y={y + 4}>{percent}%</text><text className="axis-label axis-wind-label" textAnchor="end" x={width - 10} y={y + 4}>· {wind.toFixed(1)} m/s</text></>}</g>; })}
      {cloudPath && <><path className="cloud-area" fill={`url(#cloud-fill-${detailed})`} d={`${cloudPath} L ${width - plot.right} ${plot.top + plotHeight} L ${plot.left} ${plot.top + plotHeight} Z`}/><path className="cloud-line" d={cloudPath}/></>}
      {data.map((point, index) => point.precipitation !== undefined && <rect key={point.datetime} className="rainbar" x={plot.left + index * plotWidth / data.length + 2} y={plot.top + plotHeight - Math.min(point.precipitation / precipitationMax * plotHeight, plotHeight)} width={Math.max(4, plotWidth / data.length - 5)} height={Math.min(point.precipitation / precipitationMax * plotHeight, plotHeight)} />)}
      {tempPath && <><path className="temperature-area" d={`${tempPath} L ${width - plot.right} ${plot.top + plotHeight} L ${plot.left} ${plot.top + plotHeight} Z`} /><path className="temperature-line" d={tempPath} /></>}
      {probabilityPath && <path className="probability-line" d={probabilityPath}/>} 
      {windPath && <path className="wind-line" d={windPath} />}
      {gustPath && <path className="gust-line" d={gustPath}/>} 
      {timeIndexes.map((index) => { const point = data[index]; const x = plot.left + (data.length < 2 ? 0 : index * plotWidth / (data.length - 1)); const date = new Date(point.datetime); return <text className="time-label" key={point.datetime} x={x} y={height + 19}>{labelByDay ? date.toLocaleDateString('nb-NO', { weekday: 'short' }) : date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</text>; })}
    </svg> : <div className="chart-empty">— <span>Værgraf ikke tilgjengelig</span></div>}
    <table className="sr-only"><caption>Værdata</caption><thead><tr><th>Tid</th><th>Temperatur</th><th>Nedbør</th><th>Sannsynlighet</th><th>Vind</th><th>Vindkast</th><th>Skydekke</th></tr></thead><tbody>{data.map((point) => <tr key={point.datetime}><td>{point.datetime}</td><td>{fmt(point.temperature, ' °C')}</td><td>{fmt(point.precipitation, ' mm')}</td><td>{fmt(point.precipitationProbability, ' %')}</td><td>{fmt(point.windSpeed, ' m/s')}</td><td>{fmt(point.windGustSpeed, ' m/s')}</td><td>{fmt(point.cloudCoverage, ' %')}</td></tr>)}</tbody></table>
  </div>;
}

function ForecastStrip({ points }: { points: ForecastPoint[] }) {
  const days = points.slice(0, 5);
  return <div className="forecast-strip">{days.length ? days.map((point) => <div className="forecast-day" key={point.datetime}><span>{new Date(point.datetime).toLocaleDateString('nb-NO', { weekday: 'short' })}</span><WeatherGlyph condition={point.condition}/><strong>{fmt(point.temperature, '°')}</strong><small>{fmt(point.templow, '°')}</small></div>) : <div className="unavailable">— Prognose ikke tilgjengelig</div>}</div>;
}

export function WeatherOverview({ states, regular, onDetails, className = '' }: { states: Record<string, HomeAssistantState>; regular?: boolean; onDetails?: () => void; className?: string }) {
  const daily = forecastPoints(states.weatherDaily);
  const hourly = forecastPoints(states.weatherHourly);
  const current = currentTemperatureNumber(states.weatherDaily) ?? currentTemperatureNumber(states.outdoor);
  const condition = stateValue(states.weatherDaily) ?? daily[0]?.condition;
  return <section className={`card weather-card ${regular ? 'weather-regular' : ''}${className ? ` ${className}` : ''}`} aria-labelledby={regular ? undefined : 'weather-title'} role={regular ? 'button' : undefined} tabIndex={regular ? 0 : undefined} aria-label={regular ? 'Åpne detaljert vær' : undefined} onClick={regular ? onDetails : undefined} onKeyDown={regular ? (event) => { if ((event.key === 'Enter' || event.key === ' ') && onDetails) { event.preventDefault(); onDetails(); } } : undefined}>
    <div className="weather-top">
      <div className="weather-now"><WeatherGlyph condition={condition} large/><div><h2 id="weather-title">{fmt(current, '°C')}</h2><span>{conditionLabel(condition)}</span></div></div>
      {regular && <WindReading states={states}/>}
      {!regular && <ForecastStrip points={daily}/>} 
    </div>
    {regular && <WeatherChart points={hourly}/>} 
  </section>;
}
