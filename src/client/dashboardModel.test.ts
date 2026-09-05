import { describe, expect, it } from 'vitest';
import { calendarEventOccursOnDay, calendarEvents, conditionIcon, conditionLabel, forecastPoints, homeLabel, mykidKindergarten, securityPresentation, temperatureValue, wasteDaysUntil } from './dashboardModel';

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

  it('uses a supported icon when monitoring is deactivated', () => {
    expect(securityPresentation({ entity_id: 'alarm_control_panel.home', state: '3', attributes: {} }))
      .toEqual({ label: 'Deaktivert', icon: 'shield', tone: 'danger' });
  });

  it('translates Home Assistant clear-night weather for the dashboard', () => {
    expect(conditionLabel('clear-night')).toBe('Klar natt');
    expect(conditionIcon('clear-night')).toBe('nights_stay');
  });

  it('reads Outlook calendar data and includes an all-day event on each covered day', () => {
    const [event] = calendarEvents({ entity_id: 'calendar.felles', state: 'on', attributes: { data: [{ summary: 'Planleggingsdag', start: '2026-08-10', end: '2026-08-12', all_day: true }] } });
    expect(event).toMatchObject({ title: 'Planleggingsdag', allDay: true });
    expect(calendarEventOccursOnDay(event, '2026-08-11')).toBe(true);
    expect(calendarEventOccursOnDay(event, '2026-08-12')).toBe(false);
  });

  it('reads Home Assistant calendar API date and dateTime values', () => {
    const events = calendarEvents({ entity_id: 'calendar.felles', state: 'off', attributes: { events: [
      { summary: 'Fotball', start: { dateTime: '2026-08-12T17:00:00+02:00' }, end: { dateTime: '2026-08-12T18:00:00+02:00' } },
      { summary: 'Fridag', start: { date: '2026-08-13' }, end: { date: '2026-08-14' } },
    ] } });

    expect(events).toEqual([
      { title: 'Fotball', start: '2026-08-12T17:00:00+02:00', end: '2026-08-12T18:00:00+02:00', allDay: false },
      { title: 'Fridag', start: '2026-08-13', end: '2026-08-14', allDay: true },
    ]);
  });

  it('preserves full MyKid newsletter and noticeboard bodies for the detail popup', () => {
    const newsletter = 'Første avsnitt med praktisk informasjon. Andre avsnitt med resten av meldingen.';
    const noticeboard = 'Ta med ekstra skift og klær som passer været.';
    const snapshot = mykidKindergarten({ entity_id: 'sensor.mykid_kindergarten', state: 'Oppdatert', attributes: {
      summary: '15 hendelser, 2 oppslag og 6 nyhetsbrev.', health: 'ok', source_updated_at: '2026-09-03T20:41:00Z',
      events: [{ title: 'Turdag', details: 'Vi går etter frokost.', date: '2026-09-04', time: '2026-09-04T09:30:00Z' }],
      noticeboard: [{ title: 'Husk klær etter vær', details: noticeboard, date: '2026-09-03' }],
      weekly_plans: [{ title: 'Ukeplan', details: 'Mandag: tur.' }],
      newsletters: [{ title: 'Velkommen til ny uke', details: newsletter, date: '2026-09-02' }],
      today: [{ title: 'Dagens informasjon', details: 'Vi er ute før lunsj.' }],
    } });

    expect(snapshot).toMatchObject({
      summary: '15 hendelser, 2 oppslag og 6 nyhetsbrev.', health: 'ok',
      events: [{ title: 'Turdag', details: 'Vi går etter frokost.', date: '2026-09-04', time: '2026-09-04T09:30:00Z' }],
      noticeboard: [{ title: 'Husk klær etter vær', details: noticeboard }],
      newsletters: [{ title: 'Velkommen til ny uke', details: newsletter }],
      weeklyPlans: [{ title: 'Ukeplan', details: 'Mandag: tur.' }],
      today: [{ title: 'Dagens informasjon', details: 'Vi er ute før lunsj.' }],
    });
  });
});
