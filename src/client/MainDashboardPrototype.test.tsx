import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import type { DepartureBriefingPayload } from '../shared/departureBriefing';
import { MainDashboardPrototype } from './MainDashboardPrototype';
import { departureBriefingFixturePayload } from './departureBriefingFixtures';
import { familyReceiptStorageKey } from './familyInbox';
import { homeworkCompletionStorageKey } from './homeworkAgenda';

const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HomeAssistantState => ({ entity_id, state: value, attributes });

const renderPrototype = (
  states: Record<string, HomeAssistantState> = {},
  action = vi.fn(),
  openMode = vi.fn(),
  departureBriefings?: DepartureBriefingPayload,
) => render(<MainDashboardPrototype
  states={states}
  showWeather={() => {}}
  openLights={() => {}}
  openHeatPump={() => {}}
  openVacuum={() => {}}
  openVehicles={() => {}}
  openMode={openMode}
  openKlaraAi={() => {}}
  openDeparture={() => {}}
  hasDepartureBriefing={Boolean(departureBriefings?.briefings.length)}
  departureBriefings={departureBriefings}
  action={action}
/>);

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  localStorage.clear();
});

describe('MainDashboardPrototype Nicolai agenda', () => {
  it('opens rich MET alert details from the now-heading icon and restores focus on Escape', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T10:00:00+02:00'));
    const originalUrl = window.location.href;
    window.history.replaceState({}, '', `${window.location.pathname}?variant=C&scenario=warning`);
    try {
      renderPrototype({
        meteoAlarm: state('sensor.met', 'on', {
          event: 'forestFire', eventAwarenessName: 'Skogbrannfare', riskMatrixColor: 'Orange', area: 'Agder',
          awarenessSeriousness: 'Vær oppmerksom', awarenessResponse: 'Følg råd', description: 'Tørt i terrenget.',
          consequences: 'Brann kan spre seg raskt.', instruction: 'Unngå åpen ild.', onset: '2026-09-16T10:00:00+02:00',
          expires: '2026-09-16T20:00:00+02:00', incidentName: 'Tørke', altitude: 'Over 200 moh',
        }),
      });

      const alert = screen.getByRole('button', { name: /Skogbrannfare/ });
      expect(screen.getByLabelText('Aktive varsler')).toContainElement(alert);
      alert.focus();
      fireEvent.keyDown(alert, { key: 'Enter' });
      const modal = screen.getByRole('dialog', { name: 'Skogbrannfare' });
      expect(modal).toHaveTextContent('Oransje nivå');
      expect(modal).toHaveTextContent('Agder');
      expect(modal).toHaveTextContent('Vær oppmerksom');
      expect(modal).toHaveTextContent('Tørt i terrenget.');
      expect(modal).toHaveTextContent('Konsekvenser');
      expect(modal).toHaveTextContent('Unngå åpen ild.');
      expect(modal).toHaveTextContent('Tørke');
      expect(modal).toHaveTextContent('Over 200 moh');
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: 'Skogbrannfare' })).not.toBeInTheDocument();
      expect(alert).toHaveFocus();
    } finally {
      window.history.replaceState({}, '', originalUrl);
    }
  });

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
    expect(weather.querySelector('.weather-chart')).not.toBeInTheDocument();
    expect(weather.querySelector('.weather-top')).toBeInTheDocument();
    expect(weather.querySelector('.ppf-weather-tiles')).not.toBeInTheDocument();
    fireEvent.click(weather);
    expect(showWeather).toHaveBeenCalledTimes(1);
  });

  it('permanently shows the configured V1 cameras above weather in the now lane', () => {
    renderPrototype({
      doorbellCamera: state('camera.ringeklokke_fluent', 'idle'),
      courtyardCamera: state('camera.gaardsplass_fluent_lens_0', 'idle'),
    });

    const nowLane = screen.getByRole('heading', { name: 'Akkurat nå' }).closest('section')!;
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

  it('removes the clock and date so the now lane can use the space for alerts', () => {
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
    expect(document.querySelector('.ppf-global-time')).not.toBeInTheDocument();
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

    expect(within(document.querySelector('.ppf-agenda') as HTMLElement).getByRole('heading', { name: 'Hendelser' })).toBeInTheDocument();
    expect(screen.queryByText('Det familien må vite')).not.toBeInTheDocument();
  });

  it('shows Friday homework from Monday and removes it when Ferdig is pressed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T10:00:00+02:00'));

    renderPrototype({
      jacobWeeklyPlan: state('sensor.jacob_weekly_plan', 'Uke 37', {
        homework: [{ date: '2026-09-11', subject: 'Norsk', title: 'Les kapittel 2', details: 'Skriv tre setninger.' }],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: /Les kapittel 2/ }));
    const dialog = screen.getByRole('dialog', { name: 'Les kapittel 2' });
    expect(within(dialog).getByRole('button', { name: 'Ferdig' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Ferdig' }));

    expect(screen.queryByRole('button', { name: /Les kapittel 2/ })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(homeworkCompletionStorageKey)!)).toHaveLength(1);
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

    const agenda = within(document.querySelector('.ppf-agenda') as HTMLElement);
    expect(agenda.getByText('Turdag')).toBeInTheDocument();
    expect(agenda.getByText('Foreldremøte')).toBeInTheDocument();
    expect(within(document.querySelector('.ppf-agenda') as HTMLElement).queryAllByText(/Linus, Balder, Arne, Yashvi/)).toHaveLength(0);
    expect(within(document.querySelector('.ppf-agenda') as HTMLElement).queryAllByText('I dag har vi vært på tur')).toHaveLength(0);
    expect(agenda.queryByText('Bunny and tree project')).not.toBeInTheDocument();
    expect(agenda.queryByText('Bursdags samling')).not.toBeInTheDocument();
    expect(agenda.queryByText('Middag: fiskekaker')).not.toBeInTheDocument();
    expect(agenda.queryByText('Bursdag Ada')).not.toBeInTheDocument();
  });

  it('places a generated departure briefing on its matching calendar event', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T10:00:00+02:00'));
    const departureBriefings = departureBriefingFixturePayload('short');
    const openDeparture = vi.fn();

    render(<MainDashboardPrototype
      states={{
        calendar: state('calendar.family', 'on', {
          events: [{ summary: 'Turntrening', start: departureBriefings.briefings[0].eventStartAt, end: departureBriefings.briefings[0].eventEndAt }],
        }),
      }}
      showWeather={() => {}}
      openLights={() => {}}
      openHeatPump={() => {}}
      openVacuum={() => {}}
      openVehicles={() => {}}
      openMode={() => {}}
      openKlaraAi={() => {}}
      openDeparture={openDeparture}
      hasDepartureBriefing
      departureBriefings={departureBriefings}
      action={() => {}}
    />);

    const agenda = document.querySelector('.ppf-agenda') as HTMLElement;
    const event = within(agenda).getByRole('button', { name: /Turntrening/ });

    expect(document.querySelector('.ppf-departure-preview')).not.toBeInTheDocument();
    expect(event.querySelector('[title="Avreisebriefing tilgjengelig"]')).toBeInTheDocument();

    fireEvent.click(event);
    expect(openDeparture).toHaveBeenCalledTimes(1);
  });

  it('does not mark a non-matching tur event as having a departure briefing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T10:00:00+02:00'));
    const departureBriefings = departureBriefingFixturePayload('short');

    renderPrototype({
      calendar: state('calendar.family', 'on', {
        events: [{ summary: 'Turdag', start: departureBriefings.briefings[0].eventStartAt, end: departureBriefings.briefings[0].eventEndAt }],
      }),
    }, vi.fn(), vi.fn(), departureBriefings);

    const agenda = document.querySelector('.ppf-agenda') as HTMLElement;
    const event = within(agenda).getByRole('button', { name: /Turdag/ });

    expect(document.querySelector('.ppf-departure-preview')).not.toBeInTheDocument();
    expect(event.querySelector('[title="Avreisebriefing tilgjengelig"]')).not.toBeInTheDocument();
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

  it('keeps the past lane focused on messages and timeline while keeping full person views reachable from the empty inbox', () => {
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

    const past = screen.getByRole('region', { name: 'SIDEN SIST' });
  expect(within(past).getAllByRole('heading').map((heading) => heading.textContent?.replace('history', ''))).toEqual(['SIDEN SIST', 'Beskjeder', 'Tidslinje']);
    expect(within(past).getByText('Ingen uleste beskjeder')).toBeInTheDocument();
    expect(screen.queryByText('Det som har skjedd')).not.toBeInTheDocument();
    const opener = screen.getByRole('button', { name: 'Se alle beskjeder' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Beskjeder' })).toBeInTheDocument();
    expect(within(screen.getByRole('tablist', { name: 'Familie' })).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Beskjeder', 'JacobZokrates', 'NicolaiMyKid']);
    fireEvent.click(screen.getByRole('tab', { name: 'Nicolai MyKid' }));
    expect(screen.getByText('MyKid · full oversikt')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Siste nyhetsbrev' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Jacob Zokrates' }));
    expect(screen.getByText('Jacobs skoleplan – uke 36')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meldinger til hjemmet' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
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

  it('keeps stale weekend greetings excluded from the full Nicolai today overview', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Se alle beskjeder' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Nicolai MyKid' }));
    const section = screen.getByRole('tabpanel', { name: 'Nicolai MyKid' });
    expect(within(section).queryAllByText('God helg til dere alle! ❤️')).toHaveLength(0);
    expect(within(section).getByText('I dag har vi laget salatbuffé')).toBeInTheDocument();
    expect(within(section).getByText('I dag har vi laget salatbuffé og lekt med togbane.')).toBeInTheDocument();
  });
});

  it('shows forward weather and today modules in the latest dev future lane', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T10:00:00+02:00'));
    const forecast = Array.from({ length: 6 }, (_, index) => ({
      datetime: new Date(Date.parse('2026-09-20T10:00:00+02:00') + index * 2 * 60 * 60 * 1000).toISOString(),
      condition: index % 2 ? 'partlycloudy' : 'sunny',
      temperature: 12 + index,
      precipitation: index === 2 ? 1.2 : 0,
      precipitation_probability: 35 + index * 5,
      wind_speed: 2 + index / 2,
      wind_gust_speed: 5 + index,
      cloud_coverage: 20 + index * 10,
    }));

    renderPrototype({
      weatherHourly: state('sensor.hourly', 'sunny', { forecast }),
      mykidKindergarten: state('sensor.mykid_kindergarten', 'Oppdatert', { today: [{ title: 'Handle mat', details: 'Kiwi', date: '2026-09-20' }] }),
    });

    const future = screen.getByRole('heading', { name: 'Dette skjer' }).closest('section') as HTMLElement;
    const now = screen.getByRole('heading', { name: 'Akkurat nå' }).closest('section') as HTMLElement;
    const currentWeather = now.querySelector('.ppf-weather-v1') as HTMLElement;
    expect(currentWeather.querySelector('.weather-top')).toBeInTheDocument();
    expect(within(currentWeather).queryByRole('img', { name: 'Samlet graf for temperatur, nedbør, nedbørssannsynlighet, vind, vindkast og skydekke' })).not.toBeInTheDocument();
    expect(within(now).getByRole('heading', { name: 'Forbered dette' })).toBeInTheDocument();
    expect(within(future).queryByRole('heading', { name: 'Forbered dette' })).not.toBeInTheDocument();
    expect(within(future).getByRole('heading', { name: 'Vær fremover' })).toBeInTheDocument();
    const forwardWeather = within(future).getByRole('heading', { name: 'Vær fremover' }).closest('section') as HTMLElement;
    expect(within(forwardWeather).queryByText('Prognose')).not.toBeInTheDocument();
    expect(within(forwardWeather).getByRole('img', { name: 'Samlet graf for temperatur, nedbør, nedbørssannsynlighet, vind, vindkast og skydekke' })).toBeInTheDocument();
    expect(forwardWeather.querySelector('.chart-legend')).toHaveTextContent('TemperaturNedbørSannsynlighetVindKastSkydekke');
    const chart = within(forwardWeather).getByRole('img', { name: 'Samlet graf for temperatur, nedbør, nedbørssannsynlighet, vind, vindkast og skydekke' });
    expect(chart).toHaveClass('compact');
    expect(chart.querySelectorAll('.axis-left')).toHaveLength(5);
    expect(chart.querySelectorAll('.axis-right')).toHaveLength(5);
    expect(chart.querySelectorAll('.time-label')).toHaveLength(6);
    expect(chart.querySelectorAll('.axis-left')[4]).toHaveTextContent('0.0 mm');
    expect(chart.querySelector('.axis-right')).toHaveTextContent('100%');
    const chartTable = within(forwardWeather).getByRole('table', { name: 'Værdata' });
    const secondForecastRow = within(chartTable).getAllByRole('row')[2];
    const forecastCells = within(secondForecastRow).getAllByRole('cell');
    expect(forecastCells[3]).toHaveTextContent('40 %');
    expect(forecastCells[5]).toHaveTextContent('6 m/s');
    expect(forecastCells[6]).toHaveTextContent('30 %');
    const today = future.querySelector('.ppf-today') as HTMLElement;
    expect(within(today).getByRole('heading', { name: 'I dag' })).toBeInTheDocument();
    expect(within(today).getByText('Handle mat')).toBeInTheDocument();
  });

describe('MainDashboardPrototype bottom controls', () => {
  it('hides prototype scenario controls unless explicitly requested in the URL', () => {
    const originalUrl = window.location.href;
    window.history.replaceState({}, '', window.location.pathname);
    try {
      renderPrototype();
      expect(screen.queryByRole('complementary', { name: 'Prototypescenario' })).not.toBeInTheDocument();
    } finally {
      window.history.replaceState({}, '', originalUrl);
    }
  });

  it('keeps scenario controls temporary without adding a dashboard variant to the URL', () => {
    const originalUrl = window.location.href;
    window.history.replaceState({}, '', `${window.location.pathname}?scenario=calm`);
    try {
      renderPrototype();
      fireEvent.change(screen.getByRole('combobox', { name: 'Vis dynamisk tilstand' }), { target: { value: 'warning' } });

      expect(window.location.search).toBe('?scenario=warning');
    } finally {
      window.history.replaceState({}, '', originalUrl);
    }
  });

  it('keeps scenes separate and groups all daily controls together', () => {
    const openMode = vi.fn();
    renderPrototype({
      frontDoorLock: state('lock.front_door', 'locked'),
      securityMode: state('input_number.security_mode', '1'),
    }, vi.fn(), openMode);

    const nav = screen.getByRole('navigation', { name: 'Hjemkontroller' });
    const scenes = within(nav).getByRole('group', { name: 'Scener' });
    const home = within(nav).getByRole('group', { name: 'Hjemmekontroller' });

    expect(within(scenes).getAllByRole('button')).toHaveLength(3);
    ['Morgen', 'Kveld', 'Natt'].forEach((name) => expect(within(scenes).getByRole('button', { name })).toBeInTheDocument());
    ['Lys', 'Klima', 'Støvsuger', 'Biler', 'Modus', 'Klara', 'Låst', 'Overvåket']
      .forEach((name) => expect(within(home).getByRole('button', { name })).toBeInTheDocument());

    fireEvent.click(within(home).getByRole('button', { name: 'Modus' }));
    expect(openMode).toHaveBeenCalledTimes(1);
  });

  it('preserves lock and security actions inside the home group', () => {
    const action = vi.fn();
    renderPrototype({
      frontDoorLock: state('lock.front_door', 'locked'),
      securityMode: state('input_number.security_mode', '1'),
    }, action);

    const home = screen.getByRole('group', { name: 'Hjemmekontroller' });
    fireEvent.click(within(home).getByRole('button', { name: 'Låst' }));
    fireEvent.click(within(home).getByRole('button', { name: 'Overvåket' }));

    expect(action).toHaveBeenCalledWith('unlockDoor');
    expect(action).toHaveBeenCalledWith('securityMode');
  });
});

it('shares explicit read state between the dashboard and modal, persists it on reload, and restores unread messages', () => {
  const states = { jacobWeeklyPlan: state('sensor.jacob_weekly_plan', 'Oppdatert', { messages: ['Ta med gymtøy'], source_updated_at: '2026-09-10T10:00:00Z' }) };
  const view = renderPrototype(states);
  const past = screen.getByRole('region', { name: 'SIDEN SIST' });
  fireEvent.click(within(past).getByRole('button', { name: 'Åpne beskjed: Ta med gymtøy · Jacob' }));
  expect(within(past).getByText('Ta med gymtøy')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Marker som lest: Ta med gymtøy' }));
  expect(within(past).queryByText('Ta med gymtøy')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Lukk' }));
  expect(screen.getByRole('button', { name: 'Se alle beskjeder' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Se alle beskjeder' }));
  expect(JSON.parse(localStorage.getItem(familyReceiptStorageKey)!)).toHaveLength(1);
  fireEvent.click(screen.getByRole('tab', { name: 'Alle' }));
  expect(screen.getByRole('button', { name: 'Åpne beskjed: Ta med gymtøy · Jacob · Lest' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Jacob Zokrates' }));
  expect(within(screen.getByRole('tabpanel', { name: 'Jacob Zokrates' })).getByText('Ta med gymtøy')).toBeInTheDocument();
  view.unmount();
  renderPrototype(states);
  const reloadedPast = screen.getByRole('region', { name: 'SIDEN SIST' });
  expect(within(reloadedPast).queryByText('Ta med gymtøy')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Se alle beskjeder' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Alle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Åpne beskjed: Ta med gymtøy · Jacob · Lest' }));
  fireEvent.click(screen.getByRole('button', { name: 'Marker som ulest: Ta med gymtøy' }));
  expect(within(reloadedPast).getByText('Ta med gymtøy')).toBeInTheDocument();
});
