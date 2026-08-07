import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import App, { type DashboardApi } from './App';

const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HomeAssistantState => ({
  entity_id,
  state: value,
  attributes,
});

const createApi = (states: Record<string, HomeAssistantState>): DashboardApi => ({
  getStates: vi.fn().mockResolvedValue({ states }),
  runAction: vi.fn(),
  setTemperature: vi.fn(),
});

const guestCard = () => within(screen.getByRole('group', { name: 'Gjestemodus' }));

afterEach(cleanup);

describe('App', () => {
  it('shows the guest network instructions and confirmed voucher code', async () => {
    const api = createApi({
      guestMode: state('input_boolean.gjest', 'on'),
      guestVoucher: state('sensor.voucher', 'K7M9-P2Q4'),
    });
    render(<App api={api} />);

    expect(await guestCard().findByText(/Koble til WiFi/)).toHaveTextContent('GH_Guest');
    expect(guestCard().getByLabelText('Tilgangskode')).toHaveTextContent('K7M9-P2Q4');
    expect(guestCard().getByText('Gyldig for gjeldende gjest.')).toBeInTheDocument();
  });

  it('creates a new voucher and renders the confirmed code', async () => {
    const api = createApi({ guestVoucher: state('sensor.voucher', 'K7M9-P2Q4') });
    (api.runAction as ReturnType<typeof vi.fn>).mockResolvedValue({ states: { guestVoucher: state('sensor.voucher', 'T8L3-R6V1') } });
    render(<App api={api} />);

    fireEvent.click(await guestCard().findByRole('button', { name: 'Ny kode' }));
    await waitFor(() => expect(api.runAction).toHaveBeenCalledWith('guestVoucher', undefined));
    await waitFor(() => expect(guestCard().getByLabelText('Tilgangskode')).toHaveTextContent('T8L3-R6V1'));
  });

  it('turns guest mode on from the aligned switch', async () => {
    const api = createApi({ guestMode: state('input_boolean.gjest', 'off') });
    (api.runAction as ReturnType<typeof vi.fn>).mockResolvedValue({ states: { guestMode: state('input_boolean.gjest', 'on') } });
    render(<App api={api} />);

    const guestSwitch = await guestCard().findByRole('switch');
    fireEvent.click(guestSwitch);
    await waitFor(() => expect(guestSwitch).toHaveAttribute('aria-checked', 'true'));
  });

  it('calls home with the selected option', async () => {
    const api = createApi({ home: state('input_select.home_state', 'Hjemme') });
    (api.runAction as ReturnType<typeof vi.fn>).mockResolvedValue({ states: { home: state('input_select.home_state', 'Borte') } });
    render(<App api={api} />);

    const homeCard = await screen.findByRole('group', { name: 'Hjemmestatus' });
    fireEvent.click(within(homeCard).getByRole('button', { name: 'Borte' }));
    await waitFor(() => expect(api.runAction).toHaveBeenCalledWith('home', 'Borte'));
  });

  it('opens the repair panel and restores focus after Escape', async () => {
    render(<App api={createApi({})} />);

    const repairButton = screen.getByRole('button', { name: 'Reparer smarthuset' });
    fireEvent.click(repairButton);
    const dialog = screen.getByRole('dialog', { name: 'Systemreparasjon (8080)' });
    expect(within(dialog).getByTitle('Reparer smarthuset')).toHaveAttribute('src', 'http://192.168.1.127:8080/');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(repairButton).toHaveFocus();
  });
});
