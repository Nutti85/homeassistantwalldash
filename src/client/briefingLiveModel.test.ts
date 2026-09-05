import { describe, expect, it } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import { buildLiveBriefingViewModel } from './briefingModel';

const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}, extra: Partial<HomeAssistantState> = {}): HomeAssistantState => ({ entity_id, state: value, attributes, ...extra });

describe('live briefing view model', () => {
  it('uses the current Oslo period even when the historical report is missing', () => {
    const model = buildLiveBriefingViewModel('afternoon', {
      weatherHourly: state('sensor.hourly', 'partlycloudy', { forecast: [{ datetime: '2026-09-05T14:00:00Z', condition: 'partlycloudy', temperature: 18 }] }),
    }, new Date('2026-09-05T14:00:00Z'));

    expect(model.period.label).toContain('Ettermiddag');
    expect(model.metrics.find((item) => item.id === 'weather')?.value).toBe('Delvis skyet');
  });

  it('uses everyday language when a live source is unavailable', () => {
    const model = buildLiveBriefingViewModel('afternoon', {
      weatherHourly: state('sensor.hourly', 'unavailable'),
      meteoAlarm: state('sensor.alerts', 'unavailable'),
    }, new Date('2026-09-05T14:00:00Z'));

    const text = [...model.metrics, ...model.practical].map((item) => `${item.value} ${item.context}`).join(' ');
    expect(text).toContain('Får ikke hentet værmeldingen nå.');
    expect(text).toContain('Får ikke sjekket varsler nå.');
    expect(text).not.toMatch(/kilde mangler|prognose mangler/i);
    expect(text).not.toContain('Ingen varsler');
  });

  it('does not infer a clean warning state from weather alone', () => {
    const model = buildLiveBriefingViewModel('afternoon', {
      weatherHourly: state('sensor.hourly', 'partlycloudy', { forecast: [{ datetime: '2026-09-05T14:00:00Z', condition: 'partlycloudy', temperature: 18 }] }),
      meteoAlarm: state('sensor.alerts', 'unavailable'),
    }, new Date('2026-09-05T14:00:00Z'));

    expect(model.practical.find((item) => item.id === 'warnings')?.value).toBe('Får ikke sjekket varsler nå.');
  });

  it('describes a partial forecast with its actual last available time', () => {
    const model = buildLiveBriefingViewModel('afternoon', {
      weatherHourly: state('sensor.hourly', 'partlycloudy', { forecast: [{ datetime: '2026-09-05T14:00:00Z', condition: 'partlycloudy', temperature: 18 }] }),
    }, new Date('2026-09-05T14:00:00Z'));

    const weather = model.metrics.find((item) => item.id === 'temperature');
    expect(weather?.context).toContain('Har værmelding frem til kl. 16.');
    expect(weather?.context).not.toContain('Delvis prognose');
  });

  it('keeps a physical calendar trip and is honest when travel time is unavailable', () => {
    const model = buildLiveBriefingViewModel('full', {
      calendar: state('calendar.family', 'on', { events: [{ uid: 'visit', summary: 'Besøk', location: 'Biblioteket', start: { dateTime: '2026-09-05T17:00:00+02:00' }, end: { dateTime: '2026-09-05T18:00:00+02:00' }, status: 'confirmed' }] }),
    }, new Date('2026-09-05T14:00:00Z'));

    expect(model.practical.find((item) => item.id === 'travel')).toMatchObject({ context: expect.stringContaining('Får ikke beregnet reisetiden nå.') });
    expect(model.practical.find((item) => item.id === 'calendar')).toMatchObject({ value: 'Besøk' });
  });

  it('includes later physical trips in the rolling 24-hour view', () => {
    const model = buildLiveBriefingViewModel('full', {
      calendar: state('calendar.family', 'on', { events: [{ uid: 'late', summary: 'Middag', location: 'Sentrum', start: { dateTime: '2026-09-05T22:00:00+02:00' }, end: { dateTime: '2026-09-05T23:00:00+02:00' } }] }),
    }, new Date('2026-09-05T14:00:00Z'));

    expect(model.practical.find((item) => item.id === 'travel')).toMatchObject({ value: 'Middag' });
  });

  it('describes supported charger evidence without inventing an ETA', () => {
    const now = new Date('2026-09-05T18:00:00Z');
    const model = buildLiveBriefingViewModel('evening', {
      chargerMode: state('sensor.charger_mode', 'connected_charging', {}, { last_updated: now.toISOString() }),
      chargerPower: state('sensor.charger_power', '3790', { unit_of_measurement: 'W' }, { last_updated: now.toISOString() }),
      chargerPlug: state('binary_sensor.plug', 'on', {}, { last_updated: now.toISOString() }),
      chargerCharging: state('binary_sensor.charging', 'on', {}, { last_updated: now.toISOString() }),
      chargerConnectivity: state('binary_sensor.connectivity', 'on', {}, { last_updated: now.toISOString() }),
      carAndreasBattery: state('sensor.battery', '62', {}, { last_updated: now.toISOString() }),
      carAndreasChargingPower: state('sensor.car_power', '3.9', { unit_of_measurement: 'kW' }, { last_updated: now.toISOString() }),
    }, now);

    const charging = model.practical.find((item) => item.id === 'charging');
    expect(charging).toMatchObject({ value: 'Det ser ut som Andreas sin bil lader hjemme.' });
    expect(charging?.context).not.toMatch(/ferdig|kl\./i);
  });

  it('reminds about a verified next-morning commute during the evening', () => {
    const model = buildLiveBriefingViewModel('evening', {
      carAndreasDeparture: state('sensor.departure', '07:35'),
      workdayTomorrow: state('calendar.workday', 'on', { date: '2026-09-06' }),
    }, new Date('2026-09-05T18:00:00Z'));

    expect(model.practical.find((item) => item.id === 'charging')).toMatchObject({ value: 'Koble til bilen i kveld.' });
  });
});
