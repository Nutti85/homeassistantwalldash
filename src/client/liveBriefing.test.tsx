import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App, { type DashboardApi } from './App';

const api = (): DashboardApi => ({
  getStates: vi.fn().mockResolvedValue({ states: { outdoor: { entity_id: 'sensor.outdoor', state: '17', attributes: {} } } }),
  getAiReport: vi.fn().mockResolvedValue(undefined), requestAiReportRefresh: vi.fn(),
  runAction: vi.fn(), runLightCommand: vi.fn(), setTemperature: vi.fn(),
});
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });
const flush = async () => { await act(async () => { await Promise.resolve(); }); };

describe('live briefing', () => {
  it('shows current afternoon without an AI report and keeps period selection local', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T14:00:00Z'));
    const backend = api(); render(<App api={backend}/>); await flush();
    expect(screen.getByRole('region', { name: 'Ettermiddagsbriefing' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Klara AI' })); await flush();
    const dialog = screen.getByRole('dialog', { name: 'Ettermiddagsbriefing' });
    expect(within(dialog).getAllByTestId('briefing-metric')).toHaveLength(5);
    fireEvent.click(within(dialog).getByRole('button', { name: /^Morgen$/ }));
    expect(screen.getByRole('dialog', { name: 'Morgenbriefing' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ettermiddagsbriefing' })).toBeInTheDocument();
    expect(backend.requestAiReportRefresh).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Nå$/ }));
    expect(screen.getByRole('dialog', { name: 'Ettermiddagsbriefing' })).toBeInTheDocument();
  });
  it('changes periods on the clock and immediately after waking without a popup', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T12:59:40Z'));
    const backend = api(); render(<App api={backend}/>); await flush();
    expect(screen.getByRole('region', { name: 'Formiddagsbriefing' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByRole('region', { name: 'Ettermiddagsbriefing' })).toBeInTheDocument();
    vi.setSystemTime(new Date('2026-09-05T21:15:00Z'));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(screen.getByRole('region', { name: 'Nattbriefing' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('resets manual choice on close and is not blocked by a failed AI request', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T14:00:00Z'));
    const backend = api(); vi.mocked(backend.getAiReport!).mockRejectedValue(new Error('offline'));
    render(<App api={backend}/>); await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Klara AI' })); await flush();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Neste døgn' }));
    expect(screen.getByRole('dialog', { name: 'Neste døgn' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lukk Klara AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Klara AI' })); await flush();
    expect(screen.getByRole('dialog', { name: 'Ettermiddagsbriefing' })).toBeInTheDocument();
    expect(screen.queryByText('Ingen AI-rapport er publisert ennå.')).not.toBeInTheDocument();
  });
});
