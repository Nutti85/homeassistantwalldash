import { useEffect, useState, type CSSProperties } from 'react';
import type { HomeAssistantState } from '../shared/entities';
import { conditionIcon } from './dashboardModel';
import { buildV2WeatherCardModel, type SeasonalSignal, type WeatherTrend } from './weatherCardModel';
import type { AirQualityCategory, AirQualityReading } from '../server/airQuality';

interface V2WeatherCardProps {
  states: Record<string, HomeAssistantState>;
  onDetails: () => void;
}

type AirQualityDisplay = { label: string; icon: string; color: string };
const airQualityDisplay: Record<AirQualityCategory, AirQualityDisplay> = {
  good: { label: 'God', icon: 'sentiment_satisfied', color: '#85d9a2' },
  moderate: { label: 'Moderat', icon: 'sentiment_neutral', color: '#dfd27a' },
  sensitive: { label: 'Usunn for følsomme', icon: 'masks', color: '#e8a361' },
  unhealthy: { label: 'Usunn', icon: 'mood_bad', color: '#df7d76' },
  'very-unhealthy': { label: 'Svært usunn', icon: 'sick', color: '#a284be' },
  hazardous: { label: 'Farlig', icon: 'warning', color: '#9a586b' },
};
const aqiBands = [
  { start: 0, end: 50 },
  { start: 50, end: 100 },
  { start: 100, end: 150 },
  { start: 150, end: 200 },
  { start: 200, end: 300 },
  { start: 300, end: 500 },
];

const categoryForValue = (value: number): AirQualityCategory => (
  value <= 50 ? 'good'
    : value <= 100 ? 'moderate'
      : value <= 150 ? 'sensitive'
        : value <= 200 ? 'unhealthy'
          : value <= 300 ? 'very-unhealthy'
            : 'hazardous'
);

const parseAirQualityReading = (value: unknown): AirQualityReading | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.value === null) return null;
  if (typeof row.value !== 'number' || !Number.isInteger(row.value) || row.value < 0 || row.value > 500) return null;
  if (row.category !== categoryForValue(row.value)) return null;
  if (typeof row.observedAt !== 'string' || !Number.isFinite(Date.parse(row.observedAt))) return null;
  if (row.source !== 'open-meteo') return null;
  return row as unknown as AirQualityReading;
};

const formatNumber = (value: number | undefined): string => (
  value === undefined ? '—' : value.toLocaleString('nb-NO', { maximumFractionDigits: 1 })
);
const formatTemperature = (value: number | undefined): string => (
  value === undefined ? '—' : formatNumber(value).replace('-', '−') + '°C'
);
const formatValue = (value: number | undefined, unit: string): string => (
  value === undefined ? '—' : formatNumber(value) + ' ' + unit
);
const trendLabel = (value: WeatherTrend): string => ({
  up: 'Stigende',
  down: 'Synkende',
  stable: 'Stabil',
  unknown: 'ikke tilgjengelig',
}[value]);

const Icon = ({ children, className = '', style }: { children: string; className?: string; style?: CSSProperties }) => (
  <span className={'material-symbols-outlined' + (className ? ' ' + className : '')} style={style} aria-hidden="true">{children}</span>
);

function TrendArrow({ trend, className = '' }: { trend: WeatherTrend; className?: string }) {
  if (trend === 'unknown') return <span className={'ppf-weather-j-trend-unavailable ' + className} aria-hidden="true">—</span>;
  return <svg className={'ppf-weather-j-trend-arrow is-' + trend + (className ? ' ' + className : '')} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 20V4M5.5 10.5 12 4l6.5 6.5"/>
  </svg>;
}

const compassPoints: Array<[string, number]> = [
  ['N', 0], ['NØ', 45], ['Ø', 90], ['SØ', 135],
  ['S', 180], ['SV', 225], ['V', 270], ['NV', 315],
];
const compassPoint = (bearing: number): string => compassPoints.reduce((nearest, candidate) => {
  const distance = Math.abs((((bearing - candidate[1]) + 540) % 360) - 180);
  const nearestDistance = Math.abs((((bearing - nearest[1]) + 540) % 360) - 180);
  return distance < nearestDistance ? candidate : nearest;
})[0];

const seasonalDescription = (signal: SeasonalSignal): string => {
  if (signal.kind === 'pollen') return 'Pollenvarsel ' + signal.species + ', ' + signal.label + ', nivå ' + formatNumber(signal.level) + '.';
  if (signal.kind === 'alert') return 'Farevarsel ' + signal.label + '. ' + signal.detail + '.';
  if (signal.kind === 'frost') return 'Frost i natt, laveste temperatur ' + formatTemperature(signal.minimum) + '.';
  if (signal.kind === 'daylight') return signal.label + ' klokken ' + signal.time + '.';
  return 'Sesongsignal ikke tilgjengelig.';
};

const aqiPosition = (value: number): string => {
  const index = aqiBands.findIndex((band) => value <= band.end);
  const bandIndex = index < 0 ? aqiBands.length - 1 : index;
  const band = aqiBands[bandIndex];
  const fraction = (value - band.start) / (band.end - band.start);
  const position = Math.max(0.5, Math.min(99.5, ((bandIndex + fraction) / aqiBands.length) * 100));
  return position.toFixed(1) + '%';
};

function AirQualitySignal({ reading }: { reading: AirQualityReading | null }) {
  const category = reading ? airQualityDisplay[reading.category] : undefined;
  const value = reading?.value;
  return <div className="ppf-weather-j-open-signal ppf-weather-j-air-signal">
    <div className="ppf-weather-j-signal-head">
      <Icon className="ppf-weather-j-signal-icon" style={category ? { color: category.color } : undefined}>{category?.icon ?? 'air'}</Icon>
      <small>US AQI</small>
    </div>
    <div className="ppf-weather-j-signal-main">
      <strong>{value === undefined ? '—' : value}</strong>
      <span className={category ? 'is-available' : 'is-unavailable'} style={category ? { color: category.color } : undefined}>{category?.label ?? 'Ikke tilgjengelig'}</span>
    </div>
    <div
      className="ppf-weather-j-aqi-scale"
      role="img"
      aria-label={reading ? 'US AQI-skala. Verdi ' + reading.value + ', kategori ' + category?.label + '.' : 'US AQI-skala ikke tilgjengelig.'}
    >
      <span className="ppf-weather-j-aqi-bands" aria-hidden="true">
        {aqiBands.map((_, index) => <i className="ppf-weather-j-aqi-segment" key={index}/>)}
      </span>
      {reading && <i className="ppf-weather-j-aqi-marker" aria-hidden="true" style={{ left: aqiPosition(reading.value) }}/>}
    </div>
  </div>;
}

function SeasonalSignalView({ signal }: { signal: SeasonalSignal }) {
  const heading = signal.kind === 'pollen' ? 'Pollenvarsel'
    : signal.kind === 'alert' ? 'Værvarsel'
      : signal.kind === 'frost' ? 'Frost i natt'
        : signal.kind === 'daylight' ? 'Dagslys'
          : 'Sesongsignal';
  const icon = signal.kind === 'pollen' ? 'eco'
    : signal.kind === 'alert' ? 'warning'
      : signal.kind === 'frost' ? 'severe_cold'
        : signal.kind === 'daylight' ? 'wb_twilight'
          : 'help';
  const main = signal.kind === 'pollen' ? signal.label
    : signal.kind === 'alert' ? signal.label
      : signal.kind === 'frost' ? formatTemperature(signal.minimum)
        : signal.kind === 'daylight' ? signal.time
          : 'Ikke tilgjengelig';
  const detail = signal.kind === 'pollen' ? signal.species
    : signal.kind === 'alert' ? signal.detail
      : signal.kind === 'frost' ? 'Laveste temperatur i natt'
        : signal.kind === 'daylight' ? signal.label
          : 'Ingen varsler eller prognoser';

  return <div className={'ppf-weather-j-open-signal ppf-weather-j-seasonal ppf-weather-j-seasonal-' + signal.kind}>
    <div className="ppf-weather-j-signal-head"><Icon className="ppf-weather-j-signal-icon">{icon}</Icon><small>{heading}</small></div>
    <div className="ppf-weather-j-signal-main"><strong>{main}</strong></div>
    <span className="ppf-weather-j-signal-detail">{detail}</span>
  </div>;
}

export function V2WeatherCard({ states, onDetails }: V2WeatherCardProps) {
  const [airQuality, setAirQuality] = useState<AirQualityReading | null>(null);
  const model = buildV2WeatherCardModel(states, new Date());

  useEffect(() => {
    let mounted = true;
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      const nextController = new AbortController();
      controller = nextController;

      void (async () => {
        try {
          const response = await fetch('/api/air-quality', { signal: nextController.signal });
          if (!response.ok) throw new Error('AQI endpoint unavailable');
          const reading = parseAirQualityReading(await response.json());
          if (mounted && !nextController.signal.aborted) setAirQuality(reading);
        } catch {
          if (mounted && !nextController.signal.aborted) setAirQuality(null);
        }
      })();
    };

    refresh();
    const timer = window.setInterval(refresh, 30 * 60_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, []);

  const aqiText = airQuality
    ? 'US AQI ' + airQuality.value + ', ' + airQualityDisplay[airQuality.category].label
    : 'US AQI ikke tilgjengelig';
  const fromDirection = model.windBearing === undefined ? 'ikke tilgjengelig' : compassPoint(model.windBearing);
  const toDirection = model.windBearing === undefined ? undefined : compassPoint((model.windBearing + 180) % 360);
  const accessibleLabel = [
    'Åpne detaljert vær.',
    'Temperatur ' + formatTemperature(model.temperature) + '.',
    'Temperaturtrend: ' + trendLabel(model.temperatureTrend) + '.',
    'Følt som ' + formatTemperature(model.feelsLike) + '.',
    'Vindretning ' + fromDirection + '.' + (toDirection ? ' Pilen peker mot ' + toDirection + '.' : ''),
    'Vind ' + formatValue(model.windSpeed, 'm/s') + '. Kast ' + formatValue(model.windGust, 'm/s') + '.',
    aqiText + '.',
    seasonalDescription(model.seasonalSignal),
    'Trykk ' + formatValue(model.pressure, 'hPa') + (model.pressureClass ? ', ' + model.pressureClass : '') + '.',
    'Trykktrend: ' + trendLabel(model.pressureTrend) + '.',
    'Utendørs fuktighet ' + formatValue(model.humidity, '%') + '.',
    'Regn siste time ' + formatValue(model.rainLastHour, 'mm') + '. I dag ' + formatValue(model.rainToday, 'mm') + '.',
  ].join(' ');

  return <section
    className="ppf-weather-j"
    role="button"
    tabIndex={0}
    aria-label={accessibleLabel}
    onClick={onDetails}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        onDetails();
      }
    }}
  >
    <div className="ppf-weather-j-top">
      <div className="ppf-weather-j-current">
        <Icon className="ppf-weather-j-condition-icon">{conditionIcon(model.condition)}</Icon>
        <div className="ppf-weather-j-temperature-copy">
          <div className="ppf-weather-j-temperature-row">
            <strong>{formatTemperature(model.temperature)}</strong>
            <span className={'ppf-weather-j-trend-wrap trend-' + model.temperatureTrend}><TrendArrow trend={model.temperatureTrend}/></span>
          </div>
          <span className="ppf-weather-j-feels">Følt som {formatTemperature(model.feelsLike)}</span>
        </div>
      </div>
      <div className="ppf-weather-j-wind">
        <div className={'ppf-weather-j-compass' + (model.windBearing === undefined ? ' is-unavailable' : '')} aria-hidden="true">
          <b className="compass-n">N</b><b className="compass-e">Ø</b><b className="compass-s">S</b><b className="compass-w">V</b>
          {toDirection && <span className="ppf-weather-j-wind-arrow-position" style={{ transform: 'translate(-50%, -50%) rotate(' + ((model.windBearing! + 180) % 360) + 'deg)' }}><Icon className="ppf-weather-j-wind-arrow">navigation</Icon></span>}
        </div>
        <div className="ppf-weather-j-wind-copy">
          <span><small>Vind</small><strong>{formatValue(model.windSpeed, 'm/s')}</strong></span>
          <span><small>Kast</small><strong>{formatValue(model.windGust, 'm/s')}</strong></span>
        </div>
      </div>
    </div>

    <div className="ppf-weather-j-signals">
      <AirQualitySignal reading={airQuality}/>
      <SeasonalSignalView signal={model.seasonalSignal}/>
    </div>

    <div className="ppf-weather-j-measurements">
      <div className="ppf-weather-j-metric ppf-weather-j-pressure">
        <small className="ppf-weather-j-metric-label">Trykk</small>
        <strong className="ppf-weather-j-metric-value">{model.pressure === undefined ? '—' : <>{formatNumber(model.pressure)} <small>hPa</small></>}</strong>
        <span className="ppf-weather-j-pressure-detail">
          {model.pressureClass && <b>{model.pressureClass}</b>}
          {model.pressure !== undefined && <TrendArrow trend={model.pressureTrend} className="ppf-weather-j-pressure-arrow"/>}
        </span>
      </div>
      <div className="ppf-weather-j-metric ppf-weather-j-humidity">
        <small className="ppf-weather-j-metric-label">Utefukt</small>
        <strong className="ppf-weather-j-metric-value">{formatValue(model.humidity, '%')}</strong>
        <span className="ppf-weather-j-humidity-track" aria-hidden="true">
          {model.humidity !== undefined && <i style={{ width: model.humidity + '%' }}/>}
        </span>
      </div>
      <div className="ppf-weather-j-metric ppf-weather-j-rain">
        <small className="ppf-weather-j-metric-label">Regn siste time</small>
        <strong className="ppf-weather-j-metric-value">{model.rainLastHour === undefined ? '—' : <>{formatNumber(model.rainLastHour)} <small>mm</small></>}</strong>
        <span className="ppf-weather-j-metric-note">I dag: {formatValue(model.rainToday, 'mm')}</span>
      </div>
    </div>
  </section>;
}
