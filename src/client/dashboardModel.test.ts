import { describe, expect, it } from 'vitest';
import { calendarEventOccursOnDay, calendarEvents, forecastPoints, homeLabel, temperatureValue, wasteDaysUntil } from './dashboardModel';

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

  it('reads garbage days and collection type from a combined sensor state', () => {
    expect(wasteDaysUntil({ entity_id: 'sensor.garbage', state: '7, Matavfall', attributes: {} })).toBe(7);
  });

  it('reads Outlook calendar data and includes an all-day event on each covered day', () => {
    const [event] = calendarEvents({ entity_id: 'calendar.felles', state: 'on', attributes: { data: [{ summary: 'Planleggingsdag', start: '2026-08-10', end: '2026-08-12', all_day: true }] } });
    expect(event).toMatchObject({ title: 'Planleggingsdag', allDay: true });
    expect(calendarEventOccursOnDay(event, '2026-08-11')).toBe(true);
    expect(calendarEventOccursOnDay(event, '2026-08-12')).toBe(false);
  });
});
