import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('App', () => {
  it('shows the confirmed guest-mode state returned after pressing its card', async () => {
    const api = createApi({
      home: state('input_select.home_state', 'Hjemme'),
      guestMode: state('input_boolean.toggle', 'off'),
    });
    (api.runAction as ReturnType<typeof vi.fn>).mockResolvedValue({ states: { guestMode: state('input_boolean.toggle', 'on') } });
    render(<App api={api} />);

    expect(await guestCard().findByText('Av')).toBeInTheDocument();
    fireEvent.click(guestCard().getByRole('button', { name: 'Gjestemodus' }));
    expect(guestCard().getByText('Av')).toBeInTheDocument();
    await waitFor(() => expect(guestCard().getByText('På')).toBeInTheDocument());
  });

  it('calls home with the selected option', async () => {
    const api = createApi({ home: state('input_select.home_state', 'Hjemme') });
    (api.runAction as ReturnType<typeof vi.fn>).mockResolvedValue({ states: { home: state('input_select.home_state', 'Borte') } });
    render(<App api={api} />);

    await screen.findByRole('button', { name: 'Borte' });
    fireEvent.click(screen.getByRole('button', { name: 'Borte' }));
    await waitFor(() => expect(api.runAction).toHaveBeenCalledWith('home', 'Borte'));
  });

  it('disables only the pending action and clears it after confirmation', async () => {
    let confirm!: (value: { states: Record<string, HomeAssistantState> }) => void;
    const api = createApi({ guestMode: state('input_boolean.toggle', 'off') });
    (api.runAction as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { confirm = resolve; }));
    render(<App api={api} />);

    await guestCard().findByText('Av');
    const guestButton = guestCard().getByRole('button', { name: 'Gjestemodus' });
    const morningButton = screen.getByRole('button', { name: 'Morgenmodus' });
    fireEvent.click(guestButton);
    expect(guestButton).toBeDisabled();
    expect(morningButton).not.toBeDisabled();
    confirm({ states: { guestMode: state('input_boolean.toggle', 'on') } });
    await waitFor(() => expect(guestButton).not.toBeDisabled());
  });

  it('shows an update error and preserves the prior confirmed state', async () => {
    const api = createApi({ guestMode: state('input_boolean.toggle', 'off') });
    (api.runAction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
    render(<App api={api} />);

    await guestCard().findByText('Av');
    fireEvent.click(guestCard().getByRole('button', { name: 'Gjestemodus' }));
    expect(await guestCard().findByText('Kunne ikke oppdatere smarthuset. Prøv igjen.')).toBeInTheDocument();
    expect(guestCard().getByText('Av')).toBeInTheDocument();
  });

  it('uses the confirmed cooling temperature plus one and waits for its response', async () => {
    let confirm!: (value: { states: Record<string, HomeAssistantState> }) => void;
    const api = createApi({
      cooling: state('automation.cooling', 'off'),
      climate: state('climate.room', 'cool', { temperature: 21 }),
    });
    (api.setTemperature as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { confirm = resolve; }));
    render(<App api={api} />);

    const coolingCard = await screen.findByRole('group', { name: 'Kjøl huset' });
    expect(within(coolingCard).getByText('21 °C')).toBeInTheDocument();
    fireEvent.click(within(coolingCard).getByRole('button', { name: 'Øk temperatur' }));
    expect(api.setTemperature).toHaveBeenCalledWith(22);
    expect(within(coolingCard).getByText('21 °C')).toBeInTheDocument();
    confirm({ states: { climate: state('climate.room', 'cool', { temperature: 22 }) } });
    await waitFor(() => expect(within(coolingCard).getByText('22 °C')).toBeInTheDocument());
  });
});
