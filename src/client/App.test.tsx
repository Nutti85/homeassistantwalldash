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
const selectMode = async (name: 'Gjest' | 'Barn' | 'Full') => { fireEvent.click(await screen.findByRole('button', { name: 'Modus' })); fireEvent.click(await screen.findByRole('tab', { name })); };
afterEach(() => { cleanup(); localStorage.clear(); });

describe('redesigned dashboard', () => {
  it('starts in Full and never exposes guest Wi-Fi there', async () => {
    render(<App api={createApi()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Modus' }));
    expect(await screen.findByRole('tab', { name: 'Full' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Gjeste-WiFi')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toEqual(expect.arrayContaining([]));
  });

  it('reveals modes from the Modus button and closes the picker after a choice', async () => {
    render(<App api={createApi()} />);
    const toggle = await screen.findByRole('button', { name: 'Modus' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('tab', { name: 'Gjest' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Gjest' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
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
    expect(calendar).toHaveStyle({ gridColumn: '17 / span 8', gridRow: '1 / span 4' });
    expect(localStorage.getItem('smarthjem-layout-v11-regular')).toBeNull();

    fireEvent(grid, pointerEvent('pointerup', 600, 300));
    const saved = JSON.parse(localStorage.getItem('smarthjem-layout-v11-regular') ?? '{}');
    expect(saved.frontDoor).toMatchObject({ column: 11, row: 4, columns: 4, rows: 1 });
    expect(saved.calendar).toMatchObject({ column: 17, row: 1, columns: 8, rows: 4 });
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

    expect(localStorage.getItem('smarthjem-layout-v11-regular')).toBeNull();
    expect(JSON.parse(localStorage.getItem('smarthjem-default-layout-v11-regular') ?? '{}').frontDoor).toMatchObject({ column: 11, row: 4, columns: 4, rows: 1 });

    unmount();
    render(<App api={createApi()} />);
    expect((await screen.findByRole('button', { name: 'Modus' })).closest('.dashboard')).not.toBeNull();
    expect(document.querySelector('[data-layout-id="frontDoor"]')).toHaveStyle({ gridColumn: '11 / span 4', gridRow: '4 / span 1' });
  });

  it('uses the shipped default instead of a layout saved by the prior release', async () => {
    localStorage.setItem('smarthjem-layout-v10-regular', JSON.stringify({ frontDoor: { column: 11, row: 4, columns: 4, rows: 1 } }));
    render(<App api={createApi()} />);
    expect((await screen.findByRole('button', { name: 'Modus' })).closest('.dashboard')).not.toBeNull();
    expect(document.querySelector('[data-layout-id="frontDoor"]')).toHaveStyle({ gridColumn: '1 / span 4', gridRow: '1 / span 1' });
    expect(document.querySelector('[data-layout-id="energy"]')).toHaveStyle({ gridColumn: '9 / span 8', gridRow: '5 / span 4' });
    expect(document.querySelector('[data-layout-id="roomClimate"]')).toHaveStyle({ gridColumn: '1 / span 8', gridRow: '5 / span 4' });
  });

  it('opens Klara AI when its text changes after the initial load', async () => {
    vi.useFakeTimers();
    const api = createApi();
    vi.mocked(api.getStates)
      .mockResolvedValueOnce({ states: baseStates })
      .mockResolvedValueOnce({ states: { ...baseStates, weatherSummary: state('sensor.summary', 'Sol og varmt i morgen.') } });
    render(<App api={api} />);
    await act(async () => { await Promise.resolve(); });
    expect(api.getStates).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Dagens oversikt' })).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByRole('dialog', { name: 'Dagens oversikt' })).toBeInTheDocument();
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
    expect(calendar).toHaveStyle({ gridColumn: '17 / span 8', gridRow: '1 / span 4' });
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
    fireEvent.click(await screen.findByRole('button', { name: label })); await waitFor(() => expect(api.runAction).toHaveBeenCalledWith(action, undefined));
  });

  it('confirms a sent scene command with a toast', async () => {
    const api = createApi(); vi.mocked(api.runAction).mockResolvedValue({ states: {} }); render(<App api={api}/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Morgen' }));
    expect(await screen.findByText('Morgen er sendt til Home Assistant')).toBeInTheDocument();
  });

  it('shows the n8n AI report from the bottom control', async () => {
    render(<App api={createApi()} />); fireEvent.click(await screen.findByRole('button', { name: 'Klara AI' }));
    expect(await screen.findByText('Regn i kveld.')).toBeInTheDocument();
    expect(screen.getByText('Klara AI', { selector: '.klara-ai-eyebrow' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dagens oversikt' })).toBeInTheDocument();
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
  });

  it('opens detailed weather and switches its tabs', async () => {
    render(<App api={createApi()} />); fireEvent.click(await screen.findByRole('button', { name: 'Åpne detaljert vær' }));
    expect(screen.getByRole('heading', { name: 'Detaljert vær' })).toBeInTheDocument();
    const week = screen.getByRole('tab', { name: 'Neste 7 dager' }); fireEvent.click(week); expect(week).toHaveAttribute('aria-selected', 'true');
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
    expect(screen.getByText('Voksende sigd')).toBeInTheDocument();
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
});
