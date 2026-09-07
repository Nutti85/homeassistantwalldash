import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import { MainDashboardPrototype } from './MainDashboardPrototype';

const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HomeAssistantState => ({ entity_id, state: value, attributes });

afterEach(() => {
  vi.useRealTimers();
});

describe('MainDashboardPrototype Nicolai agenda', () => {
  it('shows only practical MyKid items in the family event calendar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T10:00:00+02:00'));

    render(<MainDashboardPrototype
      states={{
        mykidKindergarten: state('sensor.mykid_kindergarten', 'Oppdatert', {
          today: [
            { title: 'Turdag', date: '2026-09-08', details: 'Ta med sekk og klær etter været.' },
            { title: 'Bunny and tree project', date: '2026-09-08' },
            { title: 'Bursdags samling', date: '2026-09-08' },
            { title: 'Middag: fiskekaker', date: '2026-09-08' },
          ],
          events: [
            { title: 'Foreldremøte', date: '2026-09-08' },
            { title: 'Bunny and tree project', date: '2026-09-08' },
          ],
          birthdays: [{ title: 'Bursdag Ada', date: '2026-09-10' }],
        }),
      }}
      showWeather={() => {}}
      openLights={() => {}}
      openHeatPump={() => {}}
      openVacuum={() => {}}
      openVehicles={() => {}}
      openMode={() => {}}
      openKlaraAi={() => {}}
      openDeparture={() => {}}
      hasDepartureBriefing={false}
      action={() => {}}
    />);

    fireEvent.click(screen.getByRole('tab', { name: 'I morgen' }));

    expect(screen.getByText('Turdag')).toBeInTheDocument();
    expect(screen.getByText('Foreldremøte')).toBeInTheDocument();
    expect(screen.queryByText('Bunny and tree project')).not.toBeInTheDocument();
    expect(screen.queryByText('Bursdags samling')).not.toBeInTheDocument();
    expect(screen.queryByText('Middag: fiskekaker')).not.toBeInTheDocument();
    expect(screen.queryByText('Bursdag Ada')).not.toBeInTheDocument();
  });
});
