import { describe, expect, it } from 'vitest';
import { homeLabel, temperatureValue } from './dashboardModel';

describe('dashboard state presentation', () => {
  it('uses Home Assistant returned state for the home label', () => {
    expect(homeLabel({ state: 'Borte' })).toBe('Borte');
  });

  it('uses the returned climate temperature, not a requested value', () => {
    expect(temperatureValue({ entity_id: 'climate.room', state: 'cool', attributes: { temperature: 21 } })).toBe('21 °C');
  });

  it('handles unavailable state safely in Norwegian', () => {
    expect(temperatureValue({ entity_id: 'climate.room', state: 'unavailable', attributes: {} })).toBe('Ikke tilgjengelig');
  });
});
