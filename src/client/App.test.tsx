import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import App, { type DashboardApi } from './App';

const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HomeAssistantState => ({ entity_id, state: value, attributes });
const baseStates: Record<string, HomeAssistantState> = {
  guestMode: state('input_boolean.gjest', 'on'), guestVoucher: state('sensor.voucher', 'K7M9-P2Q4'),
  frontDoorLock: state('lock.front', 'locked'), securityMode: state('input_number.security', '2'),
  climate: state('climate.stue', 'heat', { temperature: 22, current_temperature: 24.6, fan_mode: 'quiet' }),
  outdoor: state('sensor.outdoor', '17'), weatherDaily: state('sensor.daily', 'rainy', { forecast: [] }),
  weatherHourly: state('sensor.hourly', 'rainy', { forecast: [] }), weatherSummary: state('sensor.summary', 'Regn i kveld.'),
  repairHealth: state('binary_sensor.health', 'ok'),
};
const createApi = (overrides: Record<string, HomeAssistantState> = {}): DashboardApi => ({
  getStates: vi.fn().mockResolvedValue({ states: { ...baseStates, ...overrides } }), getAiReport: vi.fn().mockResolvedValue({ report: '## Personlig oversikt\n## Vær\n### Kveld · lør. 22.08. · 18:00–24:00\n• Regn i kveld.\n## Kort oppsummert\n• Ta med paraply.\n## Anbefalinger\n• Kle deg varmt.\n## Senere i dag\n• Avtale kl. 17:30.', publishedAt: '2026-08-22T08:00:00.000Z' }), requestAiReportRefresh: vi.fn().mockResolvedValue(undefined), runAction: vi.fn(), runLightCommand: vi.fn().mockResolvedValue({ states: {} }), setTemperature: vi.fn(),
});
const selectMode = async (name: 'Gjest' | 'Barn' | 'Full') => { fireEvent.click(await screen.findByRole('button', { name: 'Innstillinger' })); fireEvent.click(await screen.findByRole('tab', { name })); };
afterEach(() => { vi.useRealTimers(); cleanup(); localStorage.clear(); });

describe('redesigned dashboard', () => {
  it('shows Calendar first, switches to Jacob plan manually, and rotates after 3 seconds', async () => {
    vi.useFakeTimers();
    render(<App api={createApi({ calendar: state('calendar.family', 'on', { events: [] }), jacobWeeklyPlan: state('sensor.jacob_weekly_plan', 'Uke 35', { summary: 'Prøve på tirsdag.', week_start: '2026-08-24', events: [{ date: '2026-08-25', title: 'Matteprøve' }], reminders: [{ weekday: 'fredag', title: 'Ta med gymtøy' }, { title: 'Bestill skolemelk' }] }) })} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Kalender')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vis kalender' })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Vis Jacobs skoleplan' }));
    expect(screen.getByText('Prøve på tirsdag.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Jacobs skoleplan – uke 35' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hendelser' })).toBeInTheDocument();
    expect(screen.getByText('Matteprøve')).toBeInTheDocument();
    expect(screen.getByText('tirsdag')).toBeInTheDocument();
    expect(screen.queryByText('2026-08-25')).not.toBeInTheDocument();
    expect(screen.queryByText('Tidspunkt ikke angitt')).not.toBeInTheDocument();
    expect(screen.getByText('Ta med gymtøy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vis Jacobs skoleplan' })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Vis kalender' }));
    await act(async () => { vi.advanceTimersByTime(3_000); });
    expect(screen.getByRole('button', { name: 'Vis Jacobs skoleplan' })).toHaveAttribute('aria-current', 'true');
    vi.useRealTimers();
  });

  it('keeps the school-plan slide safe when the Home Assistant entity is unavailable', async () => {
    render(<App api={createApi({ jacobWeeklyPlan: state('sensor.jacob_weekly_plan', 'unavailable') })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Vis Jacobs skoleplan' }));
    expect(screen.getByText('Ingen skoleplan er tilgjengelig ennå.')).toBeInTheDocument();
  });

  it('opens every Jacob plan attribute in a detail view and closes it again', async () => {
    render(<App api={createApi({
      jacobWeeklyPlan: state('sensor.jacob_weekly_plan', 'Melding til hjemmet', {
        summary: '5 avtaler, 3 lekser og 4 påminnelser denne uken.', week_start: '2026-08-24', source_updated_at: '2026-08-25T20:16:51.950106+02:00',
        events: [{ weekday: 'fredag', title: 'Turdag' }, { weekday: 'mandag', title: 'Utviklingssamtaler' }, { weekday: 'torsdag', title: 'Svømming – oppstart', details: 'Husk badetøy, håndkle og svømmebriller.' }],
        reminders: [{ title: 'Bestill skolemelk', details: 'Fyll ut bestillingen før fredag.' }],
        homework: [{ weekday: 'fredag', subject: 'Norsk', title: 'Les kapittel 2', details: 'Skriv tre setninger om teksten.' }],
        school_schedule: [{ title: 'Skole', time: '08:20:00–13:40:00' }, { title: 'Skole', time: '08:20:00–14:25:00' }, { title: 'Skole', time: '08:20:00–13:40:00' }, { title: 'Skole', time: '08:20:00–14:25:00' }, { title: 'Skole', time: '08:20:00–13:40:00' }],
        topics: ['Vennskap og klassemiljø'], messages: ['Velkommen til et nytt skoleår!'],
      }),
    })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Vis Jacobs skoleplan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Åpne Jacobs skoleplan i detalj' }));
    const detail = screen.getByRole('dialog', { name: 'Jacobs skoleplan – uke 35' });
    expect(within(detail).getByText('Hendelser')).toBeInTheDocument();
    const schoolDays = within(detail).getByRole('heading', { name: 'Skoledager' });
    const events = within(detail).getByRole('heading', { name: 'Hendelser' });
    const reminders = within(detail).getByRole('heading', { name: 'Påminnelser' });
    expect(within(detail).getByRole('heading', { name: 'Lekser' }).closest('section')).toHaveClass('weekly-plan-detail-wide-section');
    expect(schoolDays.compareDocumentPosition(events) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(schoolDays.compareDocumentPosition(reminders) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const eventTitles = Array.from(events.closest('section')?.querySelectorAll('.weekly-plan-detail-item-heading strong') ?? []).map((item) => item.textContent);
    expect(eventTitles).toEqual(['Utviklingssamtaler', 'Svømming – oppstart', 'Turdag']);
    expect(within(detail).getByText('Husk badetøy, håndkle og svømmebriller.')).toBeInTheDocument();
    expect(within(detail).getByText('Fyll ut bestillingen før fredag.')).toBeInTheDocument();
    expect(within(detail).getByText('Skriv tre setninger om teksten.')).toBeInTheDocument();
    expect(within(detail).getAllByText('08:20–14:25')).toHaveLength(2);
    expect(within(detail).getByText('Vennskap og klassemiljø')).toBeInTheDocument();
    expect(within(detail).getByText('Velkommen til et nytt skoleår!')).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: 'Lukk Jacobs skoleplan' }));
    expect(screen.queryByRole('dialog', { name: 'Jacobs skoleplan – uke 35' })).not.toBeInTheDocument();
  });

  it('shows MyKid as a third carousel slide and opens the full newsletter and noticeboard bodies', async () => {
    const newsletterBody = 'Første avsnitt med praktisk informasjon. Andre avsnitt med resten av meldingen.';
    const olderNewsletterBody = 'Dette er et eldre nyhetsbrev som blir tilgjengelig via Vis mer.';
    const noticeboardBody = 'Ta med ekstra skift og klær som passer været.';
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().slice(0, 10);
    render(<App api={createApi({
      calendar: state('calendar.family', 'on', { events: [] }),
      jacobWeeklyPlan: state('sensor.jacob_weekly_plan', 'Uke 35', { summary: 'Plan' }),
      mykidKindergarten: state('sensor.mykid_kindergarten', 'Oppdatert', {
        summary: '15 hendelser, 2 oppslag og 6 nyhetsbrev.', health: 'ok', source_updated_at: '2026-09-03T20:41:00Z',
        events: [{ title: 'Turdag', date: tomorrow }],
        noticeboard: [{ title: 'Husk klær etter vær', details: noticeboardBody, date: '2026-09-03' }],
        weekly_plans: [{ title: 'Ukeplan', details: 'Mandag: tur.' }],
        newsletters: [{ title: 'Velkommen til ny uke', details: newsletterBody, date: today, published_at: `${today}T12:00:00Z` }, { title: 'Forrige uke', details: olderNewsletterBody, date: '2026-08-26', published_at: '2026-08-26T12:00:00Z' }],
        today: [{ title: 'Dagens informasjon', details: 'Vi er ute før lunsj.', date: today }],
      }),
    })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Vis MyKid' }));
    expect(screen.getByText('MyKid · Bjørnehiet')).toBeInTheDocument();
    expect(screen.getByText('15 hendelser, 2 oppslag og 6 nyhetsbrev.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'I dag' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'I morgen' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Siste nyhetsbrev' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vis mer nyhetsbrev' })).toBeInTheDocument();
    expect(screen.getByText('Husk klær etter vær')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vis mer nyhetsbrev' }));
    expect(screen.getByRole('dialog', { name: 'MyKid · full oversikt' })).toBeInTheDocument();
    const detail = screen.getByRole('dialog', { name: 'MyKid · full oversikt' });
    const todayHeading = within(detail).getByRole('heading', { name: 'I dag' });
    const tomorrowHeading = within(detail).getByRole('heading', { name: 'I morgen' });
    const noticeboardHeading = within(detail).getByRole('heading', { name: 'Oppslagstavle' });
    const newsletterHeading = within(detail).getByRole('heading', { name: 'Siste nyhetsbrev' });
    expect(todayHeading.compareDocumentPosition(tomorrowHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tomorrowHeading.compareDocumentPosition(noticeboardHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(noticeboardHeading.compareDocumentPosition(newsletterHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(detail).getByText(newsletterBody)).toBeInTheDocument();
    expect(within(detail).getByText(noticeboardBody)).toBeInTheDocument();
    expect(within(detail).queryByText(olderNewsletterBody)).not.toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: 'Vis 1 eldre nyhetsbrev' }));
    expect(within(detail).getByText(olderNewsletterBody)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lukk MyKid-oversikten' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('pauses rotation while the document is hidden and resumes when visible', async () => {
    vi.useFakeTimers();
    render(<App api={createApi({ jacobWeeklyPlan: state('sensor.jacob_weekly_plan', 'Uke 35', { summary: 'Plan' }) })} />);
    await act(async () => { await Promise.resolve(); });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => { vi.advanceTimersByTime(3_000); });
    expect(screen.getByRole('button', { name: 'Vis kalender' })).toHaveAttribute('aria-current', 'true');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => { vi.advanceTimersByTime(3_000); });
    expect(screen.getByRole('button', { name: 'Vis Jacobs skoleplan' })).toHaveAttribute('aria-current', 'true');
    vi.useRealTimers();
  });

  it('starts in Full and never exposes guest Wi-Fi there', async () => {
    render(<App api={createApi()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Innstillinger' }));
    expect(await screen.findByRole('tab', { name: 'Full' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Gjeste-WiFi')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toEqual(expect.arrayContaining([]));
  });

  it('reveals modes from the settings popup and closes it after a choice', async () => {
    render(<App api={createApi()} />);
    const settings = await screen.findByRole('button', { name: 'Innstillinger' });
    expect(screen.queryByRole('tab', { name: 'Gjest' })).not.toBeInTheDocument();
    fireEvent.click(settings);
    expect(screen.getByRole('dialog', { name: 'Dashboardmodus' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Gjest' }));
    expect(screen.queryByRole('dialog', { name: 'Dashboardmodus' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Gjest' })).not.toBeInTheDocument();
  });

  it('opens the heat-pump card from the bottom fan control and can close it', async () => {
    render(<App api={createApi()} />);
    const fan = await screen.findByRole('button', { name: 'Styr klimaanlegg' });
    fireEvent.click(fan);
    expect(screen.getByRole('dialog', { name: 'Varmepumpe' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Varmepumpe' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Varmepumpe' })).not.toBeInTheDocument();
    expect(fan).toHaveFocus();
    fireEvent.click(fan);
    fireEvent.click(screen.getByRole('button', { name: 'Lukk varmepumpe' }));
    expect(screen.queryByRole('dialog', { name: 'Varmepumpe' })).not.toBeInTheDocument();
  });

  it('opens the floor-grouped lights dialog and keeps only one room expanded', async () => {
    const api = createApi({
      lightAll: state('light.alle_lys', 'on'), lightLoungeDownlights: state('light.lounge_downlights', 'on', { brightness: 184 }), lightCove: state('light.cove', 'on', { brightness: 112 }), lightWindowLights: state('light.vindulys', 'on'),
      lightLivingCeiling: state('light.takspot_stue', 'off'), lightStairStrip: state('light.trapp', 'on', { brightness: 125 }), lightDining: state('light.spisestuebord', 'on', { brightness: 128 }), lightKitchen: state('light.kjokken', 'on'), lightInnerHall: state('light.innergang', 'on'), lightEntrance: state('light.yttergang', 'on'), lightBathroom: state('light.lysbryter_bad', 'on'), lightBedroom: state('light.soverom', 'off'), lightJacob: state('light.alle_lys_soverom_jacob', 'off'), lightJacobCeiling: state('light.soverom_jacob_taklampe', 'off'), lightJacobBed: state('light.soverom_jacob_ledlist_seng', 'off'), lightUpperHall: state('light.gang_2_etg', 'off'), lightUpstairsToilet: state('light.takspot_toalett_2_etg', 'off'), lightOffice: state('light.kontor', 'off'),
    });
    render(<App api={api}/>);
    const lights = await screen.findByRole('button', { name: 'Styr lys' });
    fireEvent.click(lights);
    expect(screen.getByRole('dialog', { name: 'Lys i huset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stue og lounge/ })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Soverom Jacob/ }));
    expect(screen.getByRole('button', { name: /Stue og lounge/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Soverom Jacob/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('slider', { name: 'LED-list seng lysstyrke' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Spisestue/ }));
    expect(screen.getByRole('slider', { name: 'Spisestuebord lysstyrke' })).toBeInTheDocument();
  });

  it('offers a deliberate layout editing mode with move, resize and reset controls', async () => {
    render(<App api={createApi()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tilpass oppsett' }));
    expect(screen.getByRole('button', { name: 'Flytt Ytterdør' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flytt Overvåkning' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flytt Vær' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Endre størrelse på Vær' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tilbakestill' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fullfør tilpassing av oppsett' }));
    expect(screen.queryByRole('button', { name: 'Flytt Vær' })).not.toBeInTheDocument();
  });

  it('moves a card freely and persists its new grid position only on pointer release', async () => {
    render(<App api={createApi()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tilpass oppsett' }));
    const handle = screen.getByRole('button', { name: 'Flytt Ytterdør' });
    const grid = handle.closest('.editable-dashboard') as HTMLElement;
    const frontDoor = handle.closest('[data-layout-id="frontDoor"]') as HTMLElement;
    const calendar = grid.querySelector('[data-layout-id="calendar"]') as HTMLElement;
    Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(grid, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, x: 0, y: 0, toJSON: () => ({}) }) });

    const pointerEvent = (type: string, clientX: number, clientY: number) => { const event = new MouseEvent(type, { bubbles: true, clientX, clientY }); Object.defineProperty(event, 'pointerId', { value: 1 }); return event; };
    fireEvent(handle, pointerEvent('pointerdown', 100, 50));
    fireEvent(grid, pointerEvent('pointermove', 600, 300));

    expect(frontDoor).toHaveStyle({ gridColumn: '11 / span 4', gridRow: '4 / span 1' });
    expect(calendar).toHaveStyle({ gridColumn: '17 / span 8', gridRow: '5 / span 4' });
    expect(localStorage.getItem('smarthjem-layout-v13-regular')).toBeNull();

    fireEvent(grid, pointerEvent('pointerup', 600, 300));
    const saved = JSON.parse(localStorage.getItem('smarthjem-layout-v13-regular') ?? '{}');
    expect(saved.frontDoor).toMatchObject({ column: 11, row: 4, columns: 4, rows: 1 });
    expect(saved.calendar).toMatchObject({ column: 17, row: 5, columns: 8, rows: 4 });
  });

  it('uses a saved standard layout after a fresh app load', async () => {
    const { unmount } = render(<App api={createApi()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tilpass oppsett' }));
    const handle = screen.getByRole('button', { name: 'Flytt Ytterdør' });
    const grid = handle.closest('.editable-dashboard') as HTMLElement;
    Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(grid, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, x: 0, y: 0, toJSON: () => ({}) }) });
    const pointerEvent = (type: string, clientX: number, clientY: number) => { const event = new MouseEvent(type, { bubbles: true, clientX, clientY }); Object.defineProperty(event, 'pointerId', { value: 3 }); return event; };

    fireEvent(handle, pointerEvent('pointerdown', 100, 50));
    fireEvent(grid, pointerEvent('pointermove', 600, 300));
    fireEvent(grid, pointerEvent('pointerup', 600, 300));
    fireEvent.click(screen.getByRole('button', { name: 'Lagre som standard' }));

    expect(localStorage.getItem('smarthjem-layout-v13-regular')).toBeNull();
    expect(JSON.parse(localStorage.getItem('smarthjem-default-layout-v13-regular') ?? '{}').frontDoor).toMatchObject({ column: 11, row: 4, columns: 4, rows: 1 });

    unmount();
    render(<App api={createApi()} />);
    expect((await screen.findByRole('button', { name: 'Innstillinger' })).closest('.dashboard')).not.toBeNull();
    expect(document.querySelector('[data-layout-id="frontDoor"]')).toHaveStyle({ gridColumn: '11 / span 4', gridRow: '4 / span 1' });
  });

  it('uses the shipped default instead of a layout saved by the prior release', async () => {
    localStorage.setItem('smarthjem-layout-v10-regular', JSON.stringify({ frontDoor: { column: 11, row: 4, columns: 4, rows: 1 } }));
    render(<App api={createApi()} />);
    expect((await screen.findByRole('button', { name: 'Innstillinger' })).closest('.dashboard')).not.toBeNull();
    expect(document.querySelector('[data-layout-id="frontDoor"]')).toHaveStyle({ gridColumn: '1 / span 4', gridRow: '1 / span 1' });
    expect(document.querySelector('[data-layout-id="energy"]')).toHaveStyle({ gridColumn: '9 / span 8', gridRow: '5 / span 4' });
    expect(document.querySelector('[data-layout-id="roomClimate"]')).toHaveStyle({ gridColumn: '1 / span 8', gridRow: '5 / span 4' });
  });

  it('renders four fixed room-climate cards, including Bad without a CO₂ metric and a Tiltak from Home Assistant', async () => {
    render(<App api={createApi({
      roomLiving: state('sensor.stue_temperature', '23.2', { trend: [20, 21, 22, 23.2] }),
      roomLivingHumidity: state('sensor.stue_humidity', '47', { trend: [43, 45, 47] }),
      roomLivingCo2: state('sensor.stue_co2', '848', { trend: [720, 780, 848] }),
      roomBedroom: state('sensor.soverom_ha_temperature', '21.6', { trend: [20, 21, 21.6] }),
      roomBedroomHumidity: state('sensor.soverom_ha_humidity', '50', { trend: [46, 48, 50] }),
      roomBedroomCo2: state('sensor.soverom_ha_co2', '631', { trend: [600, 610, 631] }),
      roomBathroom: state('sensor.soverom_barn_temperature', '22.4', { trend: [21, 22, 22.4] }),
      roomBathroomHumidity: state('sensor.soverom_barn_humidity', '49', { trend: [47, 48, 49] }),
      roomBathroomCo2: state('sensor.soverom_barn_co2', '675', { trend: [640, 660, 675] }),
      roomFirstFloorBathroom: state('sensor.temp_bad', '23', { trend: [22, 22.5, 23] }),
      roomFirstFloorBathroomHumidity: state('sensor.fukt_bad', '67', { trend: [54, 61, 67] }),
      roomClimateAdvice: state('sensor.romklima_tiltak', 'ok', { rooms: { bathroom: { tiltak: 'Øk ventilasjonen' } } }),
    })} />);

    const climate = await screen.findByLabelText('Romklima');
    expect(climate.querySelectorAll('.room-climate-room')).toHaveLength(4);
    expect(within(climate).getByText('Stue')).toBeInTheDocument();
    expect(within(climate).getByText('Soverom HA')).toBeInTheDocument();
    expect(within(climate).getByText('Soverom barn')).toBeInTheDocument();
    const bathroom = within(climate).getByLabelText('Rom: Bad');
    expect(within(bathroom).getByText('1. etasje')).toBeInTheDocument();
    expect(within(bathroom).getByText('23°')).toBeInTheDocument();
    expect(within(bathroom).getByText('67 %')).toBeInTheDocument();
    expect(within(bathroom).queryByText('Luftkvalitet')).not.toBeInTheDocument();
    expect(within(bathroom).getByText('Tiltak')).toBeInTheDocument();
    expect(within(bathroom).getByText('Øk ventilasjonen')).toBeInTheDocument();
    expect(climate.querySelectorAll('.room-trend-fill')).toHaveLength(0);
  });

  it('opens Klara AI when its text changes after the initial load', async () => {
    vi.useFakeTimers();
    const api = createApi();
    vi.mocked(api.getStates)
      .mockResolvedValueOnce({ states: baseStates })
      .mockResolvedValueOnce({ states: { ...baseStates, weatherSummary: state('sensor.summary', 'Sol og varmt i morgen.') } });
    vi.mocked(api.getAiReport!)
      .mockResolvedValueOnce({ report: 'Første rapport', publishedAt: '2026-08-23T06:30:00.000Z' })
      .mockResolvedValueOnce({ report: 'Ny rapport', publishedAt: '2026-08-23T07:00:00.000Z' });
    render(<App api={api} />);
    await act(async () => { await Promise.resolve(); });
    expect(api.getStates).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Full briefing' })).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByRole('dialog', { name: 'Full briefing' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('resizes only the selected card against the grid dimensions captured at pointer down', async () => {
    render(<App api={createApi()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tilpass oppsett' }));
    const handle = screen.getByRole('button', { name: 'Endre størrelse på Ytterdør' });
    const grid = handle.closest('.editable-dashboard') as HTMLElement;
    const frontDoor = handle.closest('[data-layout-id="frontDoor"]') as HTMLElement;
    const calendar = grid.querySelector('[data-layout-id="calendar"]') as HTMLElement;
    const bounds = vi.fn()
      .mockReturnValueOnce({ left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, x: 0, y: 0, toJSON: () => ({}) })
      .mockReturnValue({ left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400, x: 0, y: 0, toJSON: () => ({}) });
    Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(grid, 'getBoundingClientRect', { value: bounds });

    const pointerEvent = (type: string, clientX: number, clientY: number) => { const event = new MouseEvent(type, { bubbles: true, clientX, clientY }); Object.defineProperty(event, 'pointerId', { value: 2 }); return event; };
    fireEvent(handle, pointerEvent('pointerdown', 100, 50));
    fireEvent(grid, pointerEvent('pointermove', 300, 150));

    expect(frontDoor).toHaveStyle({ gridColumn: '1 / span 8', gridRow: '1 / span 2' });
    expect(calendar).toHaveStyle({ gridColumn: '17 / span 8', gridRow: '5 / span 4' });
    expect(bounds).toHaveBeenCalledTimes(1);
  });

  it('renders exactly one guest Wi-Fi card and confirmed voucher in Gjest', async () => {
    render(<App api={createApi()} />); await selectMode('Gjest');
    expect(screen.getAllByText('Gjeste-WiFi')).toHaveLength(1);
    expect(screen.getByLabelText('Tilgangskode')).toHaveTextContent('K7M9-P2Q4');
    expect(await screen.findByAltText('QR-kode for gjestenettverket')).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'));
  });

  it('keeps owner, guest and admin information out of Barn', async () => {
    render(<App api={createApi({ repairHealth: state('binary_sensor.health', 'problem') })} />); await selectMode('Barn');
    ['Gjeste-WiFi', 'GH_Guest', 'Energi i dag', 'Andreas', 'Hege', 'Kalender', 'Reparer smarthuset'].forEach((text) => expect(screen.queryByText(text)).not.toBeInTheDocument());
    expect(screen.queryByText('Hva skal vi gjøre?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Morgen' })).toBeInTheDocument();
  });

  it('shows repair only for an unhealthy configured source and restores focus', async () => {
    const { rerender } = render(<App api={createApi()} />);
    expect(screen.queryByText('Hei! Alt er i orden med smarthuset.')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Scener' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Morgen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reparer smarthuset' })).not.toBeInTheDocument();
    rerender(<App api={createApi({ repairHealth: state('binary_sensor.health', 'problem') })} />);
    const repair = await screen.findByRole('button', { name: 'Reparer smarthuset' });
    fireEvent.click(repair);
    const dialog = screen.getByRole('dialog', { name: 'Systemreparasjon (8080)' });
    expect(within(dialog).getByTitle('Reparer smarthuset')).toHaveAttribute('src', 'http://192.168.1.127:8080/');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(repair).toHaveFocus();
  });

  it.each([['1','Armert'],['2','Notifikasjoner'],['3','Deaktivert'],['other','Ukjent']])('maps security %s', async (value, label) => {
    render(<App api={createApi({ securityMode: state('input_number.security', value) })} />);
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('uses fixed lock action and renders the confirmed result', async () => {
    const api = createApi(); vi.mocked(api.runAction).mockResolvedValue({ states: { frontDoorLock: state('lock.front', 'unlocked') } });
    render(<App api={api} />); fireEvent.click(await screen.findByRole('button', { name: 'Lås opp ytterdør' }));
    await waitFor(() => expect(api.runAction).toHaveBeenCalledWith('unlockDoor', undefined));
    expect(await screen.findByText('Ulåst')).toBeInTheDocument();
  });

  it.each([['Morgen','morning'],['Kveld','evening'],['Natt','night']] as const)('preserves %s scene intent', async (label, action) => {
    const api = createApi(); vi.mocked(api.runAction).mockResolvedValue({ states: {} }); render(<App api={api}/>);
    fireEvent.click(await screen.findByRole('button', { name: label }));
    expect(api.runAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Bekreft' })); await waitFor(() => expect(api.runAction).toHaveBeenCalledWith(action, undefined));
  });

  it('dismisses a scene confirmation when tapping outside it', async () => {
    render(<App api={createApi()}/>);
    const morning = await screen.findByRole('button', { name: 'Morgen' });
    fireEvent.click(morning);
    expect(morning).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(document.body);
    expect(morning).toHaveAttribute('aria-expanded', 'false');
  });

  it('confirms a sent scene command with a toast', async () => {
    const api = createApi(); vi.mocked(api.runAction).mockResolvedValue({ states: {} }); render(<App api={api}/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Morgen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bekreft' }));
    expect(await screen.findByText('Morgen er sendt til Home Assistant')).toBeInTheDocument();
  });

  it('shows the n8n AI report from the bottom control', async () => {
    render(<App api={createApi()} />); fireEvent.click(await screen.findByRole('button', { name: 'Klara AI' }));
    expect(await screen.findByText('Regn i kveld.')).toBeInTheDocument();
    expect(screen.getByText('Klara AI', { selector: '.klara-ai-eyebrow' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Full briefing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Oppsummert' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Oppsummert' }).compareDocumentPosition(screen.getByRole('heading', { name: 'Vær' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vær' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Kveld · lør\. 22\.08\./ })).toBeInTheDocument();
    expect(screen.getByText('Regn i kveld.').tagName).toBe('LI');
    expect(screen.getByRole('heading', { name: 'Senere i dag' }).compareDocumentPosition(screen.getByRole('heading', { name: 'Råd' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Råd' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Personlig oversikt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full rapport' })).toHaveAttribute('aria-pressed', 'true');
    const reportDialog = screen.getByRole('dialog');
    expect(within(reportDialog).getByRole('button', { name: 'Morgen' })).toBeInTheDocument();
    expect(within(reportDialog).getByRole('button', { name: 'Formiddag' })).toBeInTheDocument();
    expect(within(reportDialog).getByRole('button', { name: 'Ettermiddag' })).toBeInTheDocument();
    expect(within(reportDialog).getByRole('button', { name: 'Kveld' })).toBeInTheDocument();
  });

  it('structures the dedicated briefing summary into readable paragraphs', async () => {
    const api = createApi();
    vi.mocked(api.getAiReport!).mockResolvedValue({
      mode: 'evening',
      title: 'Kveldsrapport',
      report: '## Kort oppsummert\nDet blir en tørr og rolig natt i Sandefjord, med delvis skyet vær og 12–14 grader opplevd temperatur. Mandag morgen blir også tørr og delvis skyet, før det blir varmere og sol gjennom dagen. Det er gult farevarsel for skogbrann.\nKalender: Fotballkamp Jacob (SBK - Hedrum) (man. 24.08. kl. 17:30)\nTemperatur 12,2–22,6 °C, vind 1–3,9 m/s, vindkast 1,6–8,1 m/s',
      publishedAt: '2026-08-23T20:00:00.000Z',
    });
    render(<App api={api}/>);

    const summary = await screen.findByText('Det blir en tørr og rolig natt i Sandefjord, med delvis skyet vær og 12–14 grader opplevd temperatur.');
    const paragraphs = [...(summary.closest('.briefing-card-summary')?.querySelectorAll('p') ?? [])];
    expect(paragraphs).toHaveLength(4);
    expect(paragraphs[1]).toHaveTextContent('Mandag morgen blir også tørr og delvis skyet');
    expect(paragraphs[2]).toHaveTextContent('Kalender: Fotballkamp Jacob');
    expect(paragraphs[3]).toHaveTextContent('Temperatur 12,2–22,6 °C');
  });

  it('uses tomorrow as the calendar heading when the report only contains tomorrow events', async () => {
    const api = createApi();
    vi.mocked(api.getAiReport!).mockResolvedValue({
      mode: 'evening',
      title: 'Kveldsrapport',
      report: '## Kort oppsummert\nRolig kveld.\n## Kalender\n### I morgen\n- Fotballkamp kl. 17:30.',
      publishedAt: '2026-08-23T20:00:00.000Z',
    });
    render(<App api={api}/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Klara AI' }));
    expect(await screen.findByRole('heading', { name: 'Kveldsbriefing' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'I morgen' })).toHaveLength(1);
    expect(screen.getByText('Fotballkamp kl. 17:30.')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Kveld' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses Senere with day subheadings when calendar events span today and tomorrow', async () => {
    const api = createApi();
    vi.mocked(api.getAiReport!).mockResolvedValue({
      mode: 'full',
      report: '## Kalender\n### I dag\n- Trening kl. 18:00.\n### I morgen\n- Kamp kl. 17:30.',
      publishedAt: '2026-08-23T12:00:00.000Z',
    });
    render(<App api={api}/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Klara AI' }));
    const reportDialog = await screen.findByRole('dialog');
    expect(within(reportDialog).getByRole('heading', { name: 'Senere' })).toBeInTheDocument();
    expect(within(reportDialog).getByRole('heading', { name: 'I dag' })).toBeInTheDocument();
    expect(within(reportDialog).getByRole('heading', { name: 'I morgen' })).toBeInTheDocument();
  });

  it('keeps the last successful background report when opening the panel fetch fails', async () => {
    const api = createApi();
    vi.mocked(api.getAiReport!)
      .mockResolvedValueOnce({ report: 'Rapport fra bakgrunnssjekken', publishedAt: '2026-08-23T08:00:00.000Z' })
      .mockRejectedValueOnce(new Error('temporary failure'));
    render(<App api={api} />);
    await waitFor(() => expect(api.getAiReport).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Klara AI' }));
    expect(await within(screen.getByRole('dialog')).findByText('Rapport fra bakgrunnssjekken')).toBeInTheDocument();
  });

  it('opens detailed weather and switches its tabs', async () => {
    render(<App api={createApi()} />); fireEvent.click(await screen.findByRole('button', { name: 'Åpne detaljert vær' }));
    expect(screen.getByRole('heading', { name: 'Detaljert vær' })).toBeInTheDocument();
    const week = screen.getByRole('tab', { name: 'Neste 7 dager' }); fireEvent.click(week); expect(week).toHaveAttribute('aria-selected', 'true');
  });

  it('starts the seven-day weather graph tomorrow and labels it by weekday', async () => {
    const now = new Date();
    const forecast = Array.from({ length: 8 }, (_, index) => ({
      datetime: new Date(now.getTime() + index * 24 * 60 * 60 * 1000).toISOString(),
      temperature: 12 + index,
    }));
    render(<App api={createApi({ weatherDaily: state('sensor.daily', 'sunny', { forecast }) })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Åpne detaljert vær' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Neste 7 dager' }));

    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowLabel = tomorrow.toLocaleDateString('nb-NO', { weekday: 'short' });
    const graph = screen.getByRole('img', { name: /Samlet graf/ });
    expect(Array.from(graph.querySelectorAll('.time-label')).map((label) => label.textContent)).toEqual(expect.arrayContaining([tomorrowLabel]));
    expect(Array.from(graph.querySelectorAll('.time-label')).map((label) => label.textContent)).not.toContain('12:00');
    const weekRows = document.querySelectorAll('.week-card > div');
    expect(weekRows).toHaveLength(7);
    expect(weekRows[0]).toHaveTextContent(tomorrowLabel);
  });

  it('reloads the detailed-weather radar every 15 minutes', async () => {
    vi.useFakeTimers();
    render(<App api={createApi()} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'Åpne detaljert vær' }));
    const radar = screen.getByTitle('Nedbørsradar for Sandefjord');
    expect(radar).toHaveAttribute('src', expect.stringContaining('refresh=0'));
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60 * 1000); });
    expect(screen.getByTitle('Nedbørsradar for Sandefjord')).toHaveAttribute('src', expect.stringContaining('refresh=1'));
    vi.useRealTimers();
  });

  it('shows Netatmo wind readings and points the compass arrow where the wind is travelling', async () => {
    render(<App api={createApi({
      netatmoWindAngle: state('sensor.wind_angle', '225'), netatmoWindDirection: state('sensor.wind_direction', 'SV'),
      netatmoWindSpeed: state('sensor.wind_speed', '4.2'), netatmoWindGust: state('sensor.wind_gust', '7.8'),
    })} />);
    expect(await screen.findByLabelText('Vind: 4,2 m/s. Kast: 7,8 m/s. Vindretning SV. Pilen peker mot NØ.')).toBeInTheDocument();
    expect(document.querySelector('.wind-compass-arrow')).toHaveStyle({ transform: 'translate(-50%, -50%) rotate(45deg)' });
  });

  it('shows local weather readings, pollen and coordinate-backed lightning in I dag', async () => {
    render(<App api={createApi({
      netatmoPressure: state('sensor.pressure', '1018'), netatmoWindSpeed: state('sensor.wind', '4.2'), netatmoWindGust: state('sensor.gust', '7.8'), netatmoWindDirection: state('sensor.direction', 'NV'),
      netatmoRain: state('sensor.rain', '0'), netatmoRainToday: state('sensor.rain_today', '1.8'), auroraChance: state('sensor.aurora', '34'), auroraVisibility: state('binary_sensor.aurora', 'off'), moonPhase: state('sensor.moon', 'waxing_crescent'), sun: state('sun.sun', 'above_horizon', { elevation: 18.5, azimuth: 232.4, next_rising: '2026-08-20T03:44:00+00:00', next_setting: '2026-08-19T19:05:00+00:00' }),
      pollenBirch: state('sensor.pollen_birch', '1', { level_name: 'Lav' }), pollenGrass: state('sensor.pollen_grass', '0', { level_name: 'Ingen' }), pollenMugwort: state('sensor.pollen_mugwort', '0', { level_name: 'Ingen' }),
      lightningDistance: state('sensor.lightning_distance', '8.2'), lightningStrikes: state('geo_location.lightning_strike_*', 'on', { strikes: [state('geo_location.lightning_strike_example', '0', { latitude: 59.25399, longitude: 10.56956, publication_date: '2026-08-15T21:32:28.310916+00:00' })] }),
    })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Åpne detaljert vær' }));
    expect(await screen.findByText('Live Blitzortung-posisjoner')).toBeInTheDocument();
    expect(screen.getByTitle('Kart over lyn i nærheten av Sandefjord')).toBeInTheDocument();
    expect(within(document.querySelector('.sun-moon-card') as HTMLElement).getByTitle(/Voksende sigd/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Sol 18,5° over horisonten, asimut 232,4°/ })).toBeInTheDocument();
    expect(screen.getByText('Soloppgang')).toBeInTheDocument();
    expect(screen.getByText('Solnedgang')).toBeInTheDocument();
    expect(screen.getAllByText(/i morgen/)).toHaveLength(2);
    expect(screen.getByText('Nærmeste 8,2 km')).toBeInTheDocument();
    expect(screen.getByText('Bjørk')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Time for time' })).not.toBeInTheDocument();
  });

  it('shows all weather series together in one accessible graph', async () => {
    const forecast = Array.from({ length: 9 }, (_, index) => ({
      datetime: new Date(Date.parse('2026-08-10T21:00:00+02:00') + index * 3 * 60 * 60 * 1000).toISOString(),
      temperature: 12 + index, precipitation: index < 3 ? index / 2 : 0,
      precipitation_probability: Math.max(0, 90 - index * 12), wind_speed: 2 + index / 3,
      wind_gust_speed: 4 + index / 2, cloud_coverage: 75 - index * 7,
    }));
    render(<App api={createApi({ weatherHourly: state('sensor.hourly', 'rainy', { forecast }) })} />);
    expect(await screen.findByRole('img', { name: /Samlet graf/ })).toBeInTheDocument();
    const graph = screen.getByRole('img', { name: /Samlet graf/ });
    expect(graph).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    expect(Array.from(graph.querySelectorAll('.axis-left')).map((label) => label.textContent)).toEqual(['19° · 1.0 mm', '17° · 0.8 mm', '15° · 0.5 mm', '12° · 0.3 mm', '10° · 0.0 mm']);
    expect(Array.from(graph.querySelectorAll('.axis-right')).map((label) => label.textContent)).toEqual(['100%', '75%', '50%', '25%', '0%']);
    expect(Array.from(graph.querySelectorAll('.axis-wind-label')).map((label) => label.textContent)).toEqual(['· 6.5 m/s', '· 4.9 m/s', '· 3.3 m/s', '· 1.6 m/s', '· 0.0 m/s']);
    expect(graph.querySelectorAll('.time-label')).toHaveLength(6);
    const legend = screen.getByLabelText('Tegnforklaring');
    ['Temperatur', 'Nedbør', 'Sannsynlighet', 'Vind', 'Kast', 'Skydekke'].forEach((label) => expect(within(legend).getByText(label)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Temperatur/ })).not.toBeInTheDocument();
  });

  it('uses the dashboard chart spacing and label anchors in detailed weather', async () => {
    const forecast = Array.from({ length: 4 }, (_, index) => ({
      datetime: new Date(Date.parse('2026-08-10T21:00:00+02:00') + index * 60 * 60 * 1000).toISOString(),
      temperature: 12 + index, precipitation: index / 2, precipitation_probability: 50,
      wind_speed: 2 + index, wind_gust_speed: 4 + index, cloud_coverage: 70,
    }));
    render(<App api={createApi({ weatherHourly: state('sensor.hourly', 'rainy', { forecast }) })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Åpne detaljert vær' }));
    const graph = screen.getByRole('img', { name: /Samlet graf/ });
    const leftAxis = graph.querySelector('.axis-left');
    const probabilityAxis = graph.querySelector('.axis-right');

    expect(leftAxis).toHaveAttribute('text-anchor', 'start');
    expect(leftAxis).toHaveAttribute('x', '10');
    expect(probabilityAxis).toHaveAttribute('text-anchor', 'end');
    expect(probabilityAxis).toHaveAttribute('x', '890');
    expect(probabilityAxis).toHaveTextContent(/% · .* m\/s/);
    expect(graph.querySelector('.axis-wind-label')).toBeNull();
  });

  it('shows only active weather alerts and falls back to Ingen varsler', async () => {
    const quietForecast = [{ datetime: new Date().toISOString(), temperature: 12, wind_gust_speed: 8 }];
    const forecast = [{ datetime: new Date().toISOString(), temperature: 12, wind_gust_speed: 11.8 }];
    const { rerender } = render(<App api={createApi({ weatherHourly: state('sensor.hourly', 'rainy', { forecast: quietForecast }) })} />);
    expect(await screen.findByText('Ingen varsler')).toBeInTheDocument();
    expect(screen.getByLabelText('Varsler')).not.toHaveClass('has-alerts');

    rerender(<App api={createApi({
      weatherHourly: state('sensor.hourly', 'rainy', { forecast }),
      meteoAlarm: state('sensor.met_weather_alerts_county_39', 'Skogbrannfare, gult nivå, Deler av Agder og Østlandet sør for Mjøsa, 2026-08-05T08:30:00+00:00, 2026-08-25T21:59:00+00:00', { event: 'forestFire', eventAwarenessName: 'Skogbrannfare', riskMatrixColor: 'Yellow', area: 'Deler av Agder og Østlandet sør for Mjøsa', description: 'Lokal skogbrannfare.', instruction: 'Ikke bruk åpen ild.' }),
      lightningDistance: state('sensor.blitzortung_lightning_distance', '8.2'),
      auroraVisibility: state('binary_sensor.aurora_visibility_visibility_alert', 'on'),
    })} />);
    const alerts = await screen.findByLabelText('Varsler');
    expect(alerts).toHaveTextContent('Farevarsel');
    expect(alerts).toHaveTextContent('Gult nivå');
    expect(alerts.querySelector('.weather-alert-meteoalarm')).toHaveClass('weather-alert-yellow');
    expect(alerts).toHaveClass('weather-alerts-meteoalarm-yellow');
    expect(alerts.querySelector('.weather-alert-meteoalarm .material-symbols-outlined')).toHaveTextContent('local_fire_department');
    expect(alerts).toHaveTextContent('Lyn8,2 km');
    expect(alerts).toHaveTextContent('Vindkast11,8 m/s');
    expect(alerts).toHaveTextContent('Nordlys');
    expect(alerts).not.toHaveTextContent('Ingen varsler');
    expect(alerts).toHaveClass('has-alerts');
    const meteoAlarmButton = screen.getByRole('button', { name: /Farevarsel/ });
    expect(meteoAlarmButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(meteoAlarmButton);
    expect(meteoAlarmButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Lokal skogbrannfare.')).toBeVisible();
    expect(screen.getByText('Ikke bruk åpen ild.')).toBeVisible();
  });

  it('hides the meteoalarm card when there is no warning', async () => {
    render(<App api={createApi({ meteoAlarm: state('sensor.met_weather_alerts_county_39', '0') })} />);
    const alerts = await screen.findByLabelText('Varsler');
    expect(alerts).toHaveTextContent('Ingen varsler');
    expect(alerts.querySelector('.weather-alert-meteoalarm')).toBeNull();
  });

  it('shows camera fallback and accessible controls', async () => {
    render(<App api={createApi()} />); expect((await screen.findAllByText('— Kamera ikke tilgjengelig'))).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Vis Ringeklokke i fullskjerm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vis Gårdsplassen i fullskjerm' })).toBeInTheDocument();
  });

  it('uses the camera stream and reconnects it after an interruption', async () => {
    render(<App api={createApi({ doorbellCamera: state('camera.ringeklokke_fluent', 'idle') })} />);
    const camera = await screen.findByRole('img', { name: 'Direktevideo fra ringeklokke' });
    expect(camera).toHaveAttribute('src', '/api/camera/stream?attempt=0');
    fireEvent.error(camera);
    await vi.waitFor(() => expect(screen.getByRole('img', { name: 'Direktevideo fra ringeklokke' })).toHaveAttribute('src', '/api/camera/stream?attempt=1'), { timeout: 1_500 });
  });

  it('uses its own Gårdsplassen stream', async () => {
    render(<App api={createApi({ courtyardCamera: state('camera.gaardsplass_fluent_lens_0', 'idle') })} />);
    const camera = await screen.findByRole('img', { name: 'Direktevideo fra gårdsplassen' });
    expect(camera).toHaveAttribute('src', '/api/courtyard-camera/stream?attempt=0');
  });

  it('refreshes Home Assistant states so an entity that returns later is rendered', async () => {
    vi.useFakeTimers();
    const api = createApi({ securityMode: state('input_number.security', '1') });
    vi.mocked(api.getStates)
      .mockResolvedValueOnce({ states: { ...baseStates, securityMode: state('input_number.security', '1') } })
      .mockResolvedValueOnce({ states: { ...baseStates, securityMode: state('input_number.security', '3') } });

    render(<App api={api} />);
    await vi.waitFor(() => expect(screen.getByText('Armert')).toBeInTheDocument());
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(screen.getByText('Deaktivert')).toBeInTheDocument());
    expect(api.getStates).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('opens a recent scheduled report on the first check and only shows it once', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T17:01:00.000Z'));
    const api = createApi();
    vi.mocked(api.getAiReport!).mockResolvedValue({ report: 'Ny kveldsrapport', mode: 'evening', publishedAt: '2026-08-24T17:00:50.000Z' });
    const firstRender = render(<App api={api} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('dialog', { name: 'Kveldsbriefing' })).toBeInTheDocument();

    firstRender.unmount();
    render(<App api={api} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('dialog', { name: 'Kveldsbriefing' })).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('falls back to the full briefing title for a legacy arrival report', async () => {
    const api = createApi();
    vi.mocked(api.getAiReport!).mockResolvedValue({ report: 'Gammel hjemkomsttekst', mode: 'coming_home' as never, publishedAt: '2026-08-24T17:00:50.000Z' });
    render(<App api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Klara AI' }));
    expect(await within(screen.getByRole('dialog')).findByRole('heading', { name: 'Full briefing' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hjemkomstbriefing' })).not.toBeInTheDocument();
  });

  it('does not request an arrival briefing when the family returns home', async () => {
    vi.useFakeTimers();
    const api = createApi({ family: state('group.familie', 'away') });
    vi.mocked(api.getStates)
      .mockResolvedValueOnce({ states: { ...baseStates, family: state('group.familie', 'away') } })
      .mockResolvedValueOnce({ states: { ...baseStates, family: state('group.familie', 'home') } });
    render(<App api={api} />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(api.requestAiReportRefresh).not.toHaveBeenCalledWith('coming_home');
    vi.useRealTimers();
  });

  it('checks for a scheduled report immediately when the display regains focus', async () => {
    vi.useFakeTimers();
    const api = createApi();
    vi.mocked(api.getAiReport!)
      .mockResolvedValueOnce({ report: 'Første rapport', publishedAt: '2026-08-23T06:30:00.000Z' })
      .mockResolvedValueOnce({ report: 'Ny rapport', mode: 'morning', publishedAt: '2026-08-24T06:30:00.000Z' });
    render(<App api={api} />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
    expect(screen.getByRole('dialog', { name: 'Morgenbriefing' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('retries transient state failures without showing the global error', async () => {
    vi.useFakeTimers();
    const api = createApi();
    vi.mocked(api.getStates)
      .mockRejectedValueOnce(new Error('backend restarting'))
      .mockRejectedValueOnce(new Error('backend still restarting'))
      .mockResolvedValueOnce({ states: baseStates });

    render(<App api={api} />);
    await act(async () => { await Promise.resolve(); });
    expect(api.getStates).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Får ikke kontakt med lokal backend. Kobler til på nytt …')).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(api.getStates).toHaveBeenCalledTimes(3);
    expect(screen.queryByText('Får ikke kontakt med lokal backend. Kobler til på nytt …')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows an accurate connection warning after repeated initial failures and clears it on recovery', async () => {
    vi.useFakeTimers();
    const api = createApi();
    vi.mocked(api.getStates)
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ states: baseStates });

    render(<App api={api} />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.getByText('Får ikke kontakt med lokal backend. Kobler til på nytt …')).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(screen.queryByText('Får ikke kontakt med lokal backend. Kobler til på nytt …')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
