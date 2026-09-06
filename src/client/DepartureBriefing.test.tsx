import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DepartureBriefingModal, DepartureBriefingStatus } from './DepartureBriefing';
import {
  departureFixtureNow,
  departureBriefingFixtures,
  departureBriefingDemoPayload,
  departureBriefingFixturePayload,
} from './departureBriefingFixtures';

afterEach(cleanup);

describe('DepartureBriefingModal', () => {
  it('puts the departure decision first for a short trip without charging', () => {
    render(<DepartureBriefingModal payload={departureBriefingFixturePayload('short')} onClose={vi.fn()} now={departureFixtureNow} />);

    const dialog = screen.getByRole('dialog', { name: 'Avreisebriefing' });
    expect(within(dialog).getByText('Dra kl. 08:20')).toBeInTheDocument();
    expect(within(dialog).getByText('Lillehammer turnhall')).toBeInTheDocument();
    expect(within(dialog).getByText('Kjøring')).toBeInTheDocument();
    expect(within(dialog).getByText('28 min')).toBeInTheDocument();
    expect(within(dialog).getByText('Ingen lading nødvendig')).toBeInTheDocument();
    expect(within(dialog).getByText('Hjemme ca. 18:08')).toBeInTheDocument();
    expect(within(dialog).getByText('Jakke og lag')).toBeInTheDocument();
  });

  it('marks charging as an estimate and renders the interval for one stop', () => {
    render(<DepartureBriefingModal payload={departureBriefingFixturePayload('one-stop')} onClose={vi.fn()} now={departureFixtureNow} />);

    const dialog = screen.getByRole('dialog', { name: 'Avreisebriefing' });
    expect(within(dialog).getByText('Anslag')).toBeInTheDocument();
    expect(within(dialog).getByText('25–35 min')).toBeInTheDocument();
    expect(within(dialog).getByText('1 ladestopp')).toBeInTheDocument();
    expect(within(dialog).getByText('Mercedes EQB').closest('.departure-vehicle-card')).toHaveClass('departure-vehicle-recommended');
    expect(within(dialog).getByText('Peugeot e-2008')).toBeInTheDocument();
  });

  it('shows the ABRP warning when the route needs two or more stops', () => {
    render(<DepartureBriefingModal payload={departureBriefingFixturePayload('long-trip')} onClose={vi.fn()} now={departureFixtureNow} />);

    expect(screen.getByText(/Langtur – kontroller ruten i ABRP/)).toBeInTheDocument();
    expect(screen.getByText('2 ladestopp')).toBeInTheDocument();
  });

  it('sorts simultaneous trips by departure and shows both vehicle recommendations', () => {
    render(<DepartureBriefingModal payload={departureBriefingFixturePayload('simultaneous')} onClose={vi.fn()} now={departureFixtureNow} />);

    const dialog = screen.getByRole('dialog', { name: 'Avreisebriefing' });
    const firstTrip = within(dialog).getByText('Lillehammer turnhall');
    const secondTrip = within(dialog).getByText('Oslo svømmehall');
    expect(firstTrip.compareDocumentPosition(secondTrip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dialog).getAllByText('Foreslått')).toHaveLength(2);
  });

  it('keeps a same-car conflict above the affected trips', () => {
    render(<DepartureBriefingModal payload={departureBriefingFixturePayload('same-car-conflict')} onClose={vi.fn()} now={departureFixtureNow} />);

    const dialog = screen.getByRole('dialog', { name: 'Avreisebriefing' });
    const conflict = within(dialog).getByText('To reiser ser ut til å bruke EQB samtidig. Sjekk bilfordelingen.');
    const firstTrip = within(dialog).getByText('Lillehammer turnhall');
    expect(conflict.compareDocumentPosition(firstTrip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is honest about old battery data without hiding the rest of the briefing', () => {
    render(<DepartureBriefingModal payload={departureBriefingFixturePayload('stale-battery')} onClose={vi.fn()} now={departureFixtureNow} />);

    const dialog = screen.getByRole('dialog', { name: 'Avreisebriefing' });
    expect(within(dialog).getByText('Batteridata er 47 min gammel')).toBeInTheDocument();
    expect(within(dialog).getByText(/Lading kan ikke beregnes sikkert/)).toBeInTheDocument();
    expect(within(dialog).getByText('Dra kl. 09:10')).toBeInTheDocument();
  });

  it('keeps the home weather and says when destination weather is unavailable', () => {
    render(<DepartureBriefingModal payload={departureBriefingFixturePayload('missing-destination-weather')} onClose={vi.fn()} now={departureFixtureNow} />);

    const dialog = screen.getByRole('dialog', { name: 'Avreisebriefing' });
    expect(within(dialog).getByText('Hjemme ved avreise')).toBeInTheDocument();
    expect(within(dialog).getByText(/12 °C · opphold/)).toBeInTheDocument();
    expect(within(dialog).getByText('Får ikke hentet været på stedet')).toBeInTheDocument();
    expect(within(dialog).getByText('Bekledning: Ikke tilgjengelig')).toBeInTheDocument();
  });

  it('uses Dra nå and exposes the calculated delay', () => {
    render(<DepartureBriefingModal payload={departureBriefingFixturePayload('now-delayed')} onClose={vi.fn()} now={departureFixtureNow} />);

    const dialog = screen.getByRole('dialog', { name: 'Avreisebriefing' });
    expect(within(dialog).getByText('Dra nå')).toBeInTheDocument();
    expect(within(dialog).getByText('Forsinket 12 min')).toBeInTheDocument();
  });

  it('supports dialog semantics, initial focus, Escape, and a manual active-trip status button', () => {
    const onClose = vi.fn();
    render(<DepartureBriefingModal payload={departureBriefingFixturePayload('short')} onClose={onClose} now={departureFixtureNow} />);

    const dialog = screen.getByRole('dialog', { name: 'Avreisebriefing' });
    const close = within(dialog).getByRole('button', { name: 'Lukk avreisebriefingen' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanup();
    render(<DepartureBriefingStatus briefings={departureBriefingFixturePayload('now-delayed').briefings} onOpen={vi.fn()} now={new Date('2026-09-08T06:30:00+02:00')} />);
    expect(screen.getByRole('button', { name: 'Åpne aktiv avreisebriefing' })).toBeInTheDocument();
    expect(screen.getByText('Aktiv reise')).toBeInTheDocument();

    cleanup();
    render(<DepartureBriefingStatus briefings={departureBriefingFixturePayload('short').briefings} onOpen={vi.fn()} now={new Date('2026-09-08T08:00:00+02:00')} />);
    expect(screen.getByRole('button', { name: 'Åpne avreisebriefing' })).toBeInTheDocument();
    expect(screen.getByText('Avreise snart')).toBeInTheDocument();
  });
});

describe('departureBriefingFixtures', () => {
  it('exposes every requested generic visual state', () => {
    expect(Object.keys(departureBriefingFixtures)).toEqual(expect.arrayContaining([
      'short', 'one-stop', 'long-trip', 'simultaneous', 'same-car-conflict',
      'stale-battery', 'missing-destination-weather', 'now-delayed',
    ]));
  });

  it('moves demo timings around the current clock for local visual QA', () => {
    const demo = departureBriefingDemoPayload('short', departureFixtureNow);
    const trip = demo.briefings[0];
    expect(Date.parse(trip.briefingAt!)).toBeLessThan(departureFixtureNow.getTime());
    expect(Date.parse(trip.departureAt!)).toBeGreaterThan(departureFixtureNow.getTime());
    expect(Date.parse(trip.eventStartAt)).toBeGreaterThan(departureFixtureNow.getTime());
  });
});
