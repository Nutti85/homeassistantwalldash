import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  getStates: vi.fn().mockResolvedValue({ states: { ...baseStates, ...overrides } }), runAction: vi.fn(), setTemperature: vi.fn(),
});
const selectMode = async (name: 'Gjest' | 'Barn' | 'Full') => fireEvent.click(await screen.findByRole('tab', { name }));
afterEach(() => { cleanup(); localStorage.clear(); });

describe('redesigned dashboard', () => {
  it('starts in Full and never exposes guest Wi-Fi there', async () => {
    render(<App api={createApi()} />);
    expect(await screen.findByRole('tab', { name: 'Full' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Gjeste-WiFi')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toEqual(expect.arrayContaining([]));
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

    expect(frontDoor).toHaveStyle({ gridColumn: '11 / span 4', gridRow: '6 / span 2' });
    expect(calendar).toHaveStyle({ gridColumn: '21 / span 4', gridRow: '7 / span 2' });
    expect(localStorage.getItem('smarthjem-layout-v3-regular')).toBeNull();

    fireEvent(grid, pointerEvent('pointerup', 600, 300));
    const saved = JSON.parse(localStorage.getItem('smarthjem-layout-v3-regular') ?? '{}');
    expect(saved.frontDoor).toMatchObject({ column: 11, row: 6, columns: 4, rows: 2 });
    expect(saved.calendar).toMatchObject({ column: 21, row: 7, columns: 4, rows: 2 });
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

    expect(frontDoor).toHaveStyle({ gridColumn: '1 / span 8', gridRow: '1 / span 4' });
    expect(calendar).toHaveStyle({ gridColumn: '21 / span 4', gridRow: '7 / span 2' });
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

  it.each([['1','Mode: Armert'],['2','Mode: Notifikasjoner'],['3','Mode: Deaktivert'],['other','Mode: Ukjent']])('maps security %s', async (value, label) => {
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

  it('shows populated and unavailable AI summary states', async () => {
    const { rerender } = render(<App api={createApi()} />); expect(await screen.findByText('Regn i kveld.')).toBeInTheDocument();
    rerender(<App api={createApi({ weatherSummary: state('', 'unavailable') })} />);
    expect(await screen.findByText('— Værmelding ikke tilgjengelig')).toBeInTheDocument();
  });

  it('opens detailed weather and switches its tabs', async () => {
    render(<App api={createApi()} />); fireEvent.click(await screen.findByRole('button', { name: 'Åpne detaljert vær' }));
    expect(screen.getByRole('heading', { name: 'Detaljert vær' })).toBeInTheDocument();
    const week = screen.getByRole('tab', { name: 'Neste 7 dager' }); fireEvent.click(week); expect(week).toHaveAttribute('aria-selected', 'true');
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
    expect(Array.from(graph.querySelectorAll('.axis-left')).map((label) => label.textContent)).toEqual(['22° · 1.0 mm', '19° · 0.8 mm', '16° · 0.5 mm', '13° · 0.3 mm', '10° · 0.0 mm']);
    expect(Array.from(graph.querySelectorAll('.axis-right')).map((label) => label.textContent)).toEqual(['100% · 8.0 m/s', '75% · 6.0 m/s', '50% · 4.0 m/s', '25% · 2.0 m/s', '0% · 0.0 m/s']);
    const legend = screen.getByLabelText('Tegnforklaring');
    ['Temperatur', 'Nedbør', 'Sannsynlighet', 'Vind', 'Kast', 'Skydekke'].forEach((label) => expect(within(legend).getByText(label)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Temperatur/ })).not.toBeInTheDocument();
  });

  it('shows camera fallback and accessible controls', async () => {
    render(<App api={createApi()} />); expect((await screen.findAllByText('— Kamera ikke tilgjengelig'))).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Vis Ringeklokke i fullskjerm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vis Gårdsplassen i fullskjerm' })).toBeInTheDocument();
  });

  it('uses the live stream and falls back to a still image when it fails', async () => {
    render(<App api={createApi({ doorbellCamera: state('camera.ringeklokke_fluent', 'idle') })} />);
    const camera = await screen.findByRole('img', { name: 'Direktevideo fra ringeklokke' });
    expect(camera).toHaveAttribute('src', '/api/camera/stream');
    fireEvent.error(camera);
    expect(await screen.findByRole('img', { name: 'Siste bilde fra ringeklokke' })).toHaveAttribute('src', '/api/camera?frame=fallback');
  });

  it('uses the Gårdsplassen camera stream and its own fallback image', async () => {
    render(<App api={createApi({ courtyardCamera: state('camera.gaardsplass_fluent_lens_0', 'idle') })} />);
    const camera = await screen.findByRole('img', { name: 'Direktevideo fra gårdsplassen' });
    expect(camera).toHaveAttribute('src', '/api/courtyard-camera/stream');
    fireEvent.error(camera);
    expect(await screen.findByRole('img', { name: 'Siste bilde fra gårdsplassen' })).toHaveAttribute('src', '/api/courtyard-camera?frame=fallback');
  });

  it('refreshes Home Assistant states so an entity that returns later is rendered', async () => {
    vi.useFakeTimers();
    const api = createApi({ securityMode: state('input_number.security', '1') });
    vi.mocked(api.getStates)
      .mockResolvedValueOnce({ states: { ...baseStates, securityMode: state('input_number.security', '1') } })
      .mockResolvedValueOnce({ states: { ...baseStates, securityMode: state('input_number.security', '3') } });

    render(<App api={api} />);
    await vi.waitFor(() => expect(screen.getByText('Mode: Armert')).toBeInTheDocument());
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(screen.getByText('Mode: Deaktivert')).toBeInTheDocument());
    expect(api.getStates).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
