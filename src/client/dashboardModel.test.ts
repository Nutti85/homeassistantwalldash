import { describe, expect, it } from 'vitest';
import { forecastPoints, homeLabel, temperatureValue } from './dashboardModel';

describe('dashboard state presentation', () => {
  it('uses Home Assistant returned state for the home label', () => {
    expect(homeLabel({ state: 'Borte' })).toBe('Borte');
  });

  it('uses the returned climate temperature, not a requested value', () => {
    expect(temperatureValue({ entity_id: 'climate.room', state: 'cool', attributes: { temperature: 21 } })).toBe('21 °C');
  });

  it('shows the measured room temperature without pretending it is a setpoint', () => {
    expect(temperatureValue({ entity_id: 'climate.room', state: 'fan_only', attributes: { current_temperature: 22 } }))
      .toBe('22 °C nå · settpunkt mangler');
  });

  it('handles unavailable state safely in Norwegian', () => {
    expect(temperatureValue({ entity_id: 'climate.room', state: 'unavailable', attributes: {} })).toBe('Ikke tilgjengelig');
  });

  it('maps all four weather tracks from Home Assistant forecast fields', () => {
    const [point] = forecastPoints({ entity_id: 'sensor.hourly', state: 'on', attributes: { forecast: [{
      datetime: '2026-08-10T21:00:00+02:00', temperature: 18, precipitation: 0.4,
      precipitation_probability: 65, wind_speed: 3.8, wind_gust_speed: 9, cloud_coverage: 42,
    }] } });
    expect(point).toMatchObject({ precipitationProbability: 65, windGustSpeed: 9, cloudCoverage: 42 });
  });
});
