import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import { MainDashboardPrototype } from './MainDashboardPrototype';

const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HomeAssistantState => ({ entity_id, state: value, attributes });

const renderPrototype = (states: Record<string, HomeAssistantState> = {}, action = vi.fn()) => render(<MainDashboardPrototype
  states={states}
  showWeather={() => {}}
  openLights={() => {}}
  openHeatPump={() => {}}
  openVacuum={() => {}}
  openVehicles={() => {}}
  openMode={() => {}}
  openKlaraAi={() => {}}
  openDeparture={() => {}}
  hasDepartureBriefing={false}
  action={action}
/>);

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('MainDashboardPrototype Nicolai agenda', () => {
  it('uses the V1 weather overview in the V2 now lane while retaining the V2 weather implementation', () => {
    const showWeather = vi.fn();
    render(<MainDashboardPrototype
      states={{
        weatherDaily: state('sensor.daily', 'rainy', { temperature: 17, forecast: [] }),
        weatherHourly: state('sensor.hourly', 'rainy', { forecast: [{ datetime: '2026-09-09T10:00:00Z', temperature: 17, precipitation: 0, wind_speed: 2 }] }),
        netatmoWindSpeed: state('sensor.wind', '2'),
        netatmoWindGust: state('sensor.gust', '4'),
        netatmoWindDirection: state('sensor.direction', 'N'),
      }}
      showWeather={showWeather}
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

    const weather = screen.getByRole('button', { name: 'Åpne detaljert vær' });
    expect(weather).toHaveClass('weather-regular');
    expect(weather.querySelector('.weather-chart')).toBeInTheDocument();
    expect(weather.querySelector('.ppf-weather-tiles')).not.toBeInTheDocument();
    fireEvent.click(weather);
    expect(showWeather).toHaveBeenCalledTimes(1);
  });

  it('permanently shows the configured V1 cameras above weather in the now lane', () => {
    renderPrototype({
      doorbellCamera: state('camera.ringeklokke_fluent', 'idle'),
      courtyardCamera: state('camera.gaardsplass_fluent_lens_0', 'idle'),
    });

    const nowLane = screen.getByRole('heading', { name: 'Akkurat nå' }).parentElement!;
    const cameraPair = nowLane.querySelector('.ppf-camera-pair');

    expect(cameraPair).toBeInTheDocument();
    expect(within(cameraPair as HTMLElement).getByRole('region', { name: 'Ringeklokke' })).toBeInTheDocument();
    expect(within(cameraPair as HTMLElement).getByRole('region', { name: 'Gårdsplassen' })).toBeInTheDocument();
    expect(cameraPair?.nextElementSibling).toHaveClass('weather-card');
  });

  it('keeps the V1 scene controls in the bottom navigation', () => {
    const action = vi.fn();
    renderPrototype({}, action);

    const scenes = screen.getByRole('group', { name: 'Scener' });
    expect(within(scenes).getByRole('button', { name: 'Morgen' })).toBeInTheDocument();
    expect(within(scenes).getByRole('button', { name: 'Kveld' })).toBeInTheDocument();
    expect(within(scenes).getByRole('button', { name: 'Natt' })).toBeInTheDocument();

    fireEvent.click(within(scenes).getByRole('button', { name: 'Morgen' }));
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(within(scenes).getByRole('button', { name: 'Bekreft Morgen' }));
    expect(action).toHaveBeenCalledWith('morning');
  });

  it('centers the clock and date on the page without the top bar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T10:00:00+02:00'));

    render(<MainDashboardPrototype
      states={{}}
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

    expect(screen.queryByText('Hjemmeoversikt')).not.toBeInTheDocument();
    expect(document.querySelector('.ppf-c-head')).not.toBeInTheDocument();
    expect(document.querySelector('.ppf-global-time')).toHaveTextContent('10:00');
    expect(document.querySelector('.ppf-global-time')).toHaveTextContent('mandag 7. september');
    expect(screen.getByRole('heading', { name: 'Akkurat nå' })).toBeInTheDocument();
  });

  it('labels the family agenda Hendelser', () => {
    render(<MainDashboardPrototype
      states={{}}
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

    expect(screen.getByRole('heading', { name: 'Hendelser' })).toBeInTheDocument();
    expect(screen.queryByText('Det familien må vite')).not.toBeInTheDocument();
  });

  it('uses the upstream MyKid agenda classification', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T10:00:00+02:00'));

    render(<MainDashboardPrototype
      states={{
        mykidKindergarten: state('sensor.mykid_kindergarten', 'Oppdatert', {
          today: [
            { title: 'Linus, Balder, Arne, Yashvi, Lena, Kaja, Adam, Nicolai, Maly og Tomine var på tur til Krokenløkka. Vi hadde', date: '2026-09-08', details: 'Linus, Balder, Arne, Yashvi, Lena, Kaja, Adam, Nicolai, Maly og Tomine var på tur til Krokenløkka. Vi hadde med sag for å finne en stor gren å henge i taket.' },
            { title: 'Bunny and tree project', date: '2026-09-08' },
            { title: 'Bursdags samling', date: '2026-09-08' },
            { title: 'Middag: fiskekaker', date: '2026-09-08' },
          ],
          events: [
            { title: 'Turdag', date: '2026-09-08', details: 'Ta med sekk og klær etter været.', include_in_agenda: true },
            { title: 'Foreldremøte', date: '2026-09-08', include_in_agenda: true },
            { title: 'I dag har vi vært på tur', date: '2026-09-08', include_in_agenda: false },
            { title: 'Bunny and tree project', date: '2026-09-08', include_in_agenda: false },
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
    expect(within(document.querySelector('.ppf-agenda') as HTMLElement).queryAllByText(/Linus, Balder, Arne, Yashvi/)).toHaveLength(0);
    expect(within(document.querySelector('.ppf-agenda') as HTMLElement).queryAllByText('I dag har vi vært på tur')).toHaveLength(0);
    expect(screen.queryByText('Bunny and tree project')).not.toBeInTheDocument();
    expect(screen.queryByText('Bursdags samling')).not.toBeInTheDocument();
    expect(screen.queryByText('Middag: fiskekaker')).not.toBeInTheDocument();
    expect(screen.queryByText('Bursdag Ada')).not.toBeInTheDocument();
  });

  it('shows tomorrow events when the rest of today is empty', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T18:00:00+02:00'));

    renderPrototype({
      calendar: state('calendar.family', 'on', {
        events: [{ summary: 'Fotballtrening', start: '2026-09-08T17:00:00+02:00', end: '2026-09-08T18:00:00+02:00' }],
      }),
    });

    expect(screen.getByText('Fotballtrening')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'I morgen' })).toBeInTheDocument();
    expect(screen.queryByText('Ingenting planlagt i denne perioden.')).not.toBeInTheDocument();
  });

  it('shows at most five events by default and keeps the remaining events behind the more button', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T10:00:00+02:00'));

    renderPrototype({
      calendar: state('calendar.family', 'on', {
        events: Array.from({ length: 6 }, (_, index) => ({
          summary: `Hendelse ${index + 1}`,
          start: `2026-09-07T${String(index + 11).padStart(2, '0')}:00:00+02:00`,
          end: `2026-09-07T${String(index + 12).padStart(2, '0')}:00:00+02:00`,
        })),
      }),
    });

    for (let index = 1; index <= 5; index += 1) expect(screen.getByText(`Hendelse ${index}`)).toBeInTheDocument();
    expect(screen.queryByText('Hendelse 6')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+1 flere' }));
    expect(screen.getByRole('dialog', { name: 'Dette skjer resten av dagen' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Hendelse 6');
  });

  it('shows Jacob before Nicolai with clickable headers and empty-state copy', () => {
    render(<MainDashboardPrototype
      states={{
        mykidKindergarten: state('sensor.mykid_kindergarten', 'Oppdatert', {
          summary: 'MyKid er oppdatert.',
          events: [], noticeboard: [], weekly_plans: [], newsletters: [], birthdays: [], today: [],
        }),
        jacobWeeklyPlan: state('sensor.jacob_weekly_plan', 'Uke 36', {
          summary: 'Jacob har en rolig uke.', week_start: '2026-08-31', events: [], reminders: [], homework: [], school_schedule: [], topics: [], messages: [],
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

    const sections = Array.from(document.querySelectorAll('.ppf-message-section')).map((section) => section.getAttribute('aria-label'));
    expect(sections).toEqual(['Jacob beskjeder', 'Nicolai beskjeder']);
    expect(screen.getAllByText('Ingen beskjeder')).toHaveLength(2);
    expect(screen.queryByText('Ingen hendelser som trenger oppmerksomhet.')).not.toBeInTheDocument();

    const nicolaiHeader = screen.getByRole('button', { name: 'Åpne full oversikt for Nicolai' });
    const jacobHeader = screen.getByRole('button', { name: 'Åpne full oversikt for Jacob' });
    expect(nicolaiHeader).toBeInTheDocument();
    expect(jacobHeader).toBeInTheDocument();

    fireEvent.click(nicolaiHeader);
    expect(screen.getByRole('dialog', { name: 'MyKid · full oversikt' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Siste nyhetsbrev' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lukk' }));

    fireEvent.click(jacobHeader);
    expect(screen.getByRole('dialog', { name: 'Jacobs skoleplan – uke 36' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meldinger til hjemmet' })).toBeInTheDocument();
  });

  it('keeps the original V2 weather tile implementation available behind the test switch', () => {
    const originalUrl = window.location.href;
    window.history.replaceState({}, '', `${window.location.pathname}?weather-card=v2`);
    try {
      render(<MainDashboardPrototype
        states={{}}
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

      const tiles = document.querySelectorAll('.ppf-weather-tiles > span');
      expect(tiles).toHaveLength(5);
      expect(Array.from(tiles).slice(0, 4).every((tile) => tile.firstElementChild?.classList.contains('material-symbols-outlined'))).toBe(true);
      expect(tiles[4]?.querySelector('.ppf-clothing-icons .material-symbols-outlined')).toBeTruthy();
    } finally {
      window.history.replaceState({}, '', originalUrl);
    }
  });

  it('removes a stale weekend greeting and keeps the source label in the section header', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T10:00:00+02:00'));

    render(<MainDashboardPrototype
      states={{
        mykidKindergarten: state('sensor.mykid_kindergarten', 'Oppdatert', {
          today: [
            { title: 'God helg til dere alle! ❤️', details: 'God helg til dere alle! ❤️', date: '2026-09-07' },
            { title: 'I dag har vi laget salatbuffé', details: 'I dag har vi laget salatbuffé og lekt med togbane.', date: '2026-09-07' },
          ],
          events: [], noticeboard: [], weekly_plans: [], newsletters: [], birthdays: [],
        }),
        jacobWeeklyPlan: state('sensor.jacob_weekly_plan', 'Oppdatert', { events: [], reminders: [], homework: [], school_schedule: [], topics: [], messages: [] }),
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

    const section = screen.getByRole('region', { name: 'Nicolai beskjeder' });
    expect(within(section).queryAllByText('God helg til dere alle! ❤️')).toHaveLength(0);
    expect(within(section).getByText('I dag har vi laget salatbuffé')).toBeInTheDocument();
    expect(within(section).queryByText('I dag har vi laget salatbuffé og lekt med togbane.')).not.toBeInTheDocument();
    expect(within(section).getAllByText('Nicolai')).toHaveLength(1);
  });
});
