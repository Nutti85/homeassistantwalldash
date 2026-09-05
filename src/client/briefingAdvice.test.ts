import { describe, expect, it } from 'vitest';
import type { HomeAssistantState } from '../shared/entities';
import { buildChargingAdvice, chargingPreparationAdvice, observeCharging } from './briefingAdvice';

const now = new Date('2026-09-05T18:00:00Z');
const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}, ageMinutes = 0): HomeAssistantState => ({
  entity_id,
  state: value,
  attributes,
  last_updated: new Date(now.getTime() - ageMinutes * 60_000).toISOString(),
});
const chargingStates = (overrides: Record<string, HomeAssistantState> = {}) => ({
  chargerMode: state('sensor.mode', 'connected_charging'),
  chargerPower: state('sensor.power', '3790', { unit_of_measurement: 'W' }),
  chargerPlug: state('binary_sensor.plug', 'on'),
  chargerCharging: state('binary_sensor.charging', 'on'),
  chargerConnectivity: state('binary_sensor.connectivity', 'on'),
  ...overrides,
});

describe('charging advice', () => {
  it('normalizes watts and infers Andreas when only his car has fresh charging power', () => {
    const observation = observeCharging(chargingStates({ carAndreasChargingPower: state('sensor.car_power', '3.9', { unit_of_measurement: 'kW' }) }), now);
    expect(observation).toMatchObject({ status: 'charging', confidence: 'inferred', vehicle: 'andreas', powerKw: 3.79 });
    expect(buildChargingAdvice(chargingStates({ carAndreasChargingPower: state('sensor.car_power', '3.9', { unit_of_measurement: 'kW' }) }), now)?.text)
      .toBe('Det ser ut som Andreas sin bil lader hjemme.');
  });

  it('does not choose a car when both cars report active charging', () => {
    expect(observeCharging(chargingStates({
      carAndreasChargingPower: state('sensor.andreas_power', '3.9'),
      carHegeChargingPower: state('sensor.hege_power', '3.8'),
    }), now)).toMatchObject({ status: 'charging', confidence: 'conflict' });
    expect(buildChargingAdvice(chargingStates({
      carAndreasChargingPower: state('sensor.andreas_power', '3.9'),
      carHegeChargingPower: state('sensor.hege_power', '3.8'),
    }), now)?.text).toBe('Hjemmeladeren er i bruk.');
  });

  it('returns unknown when the charger evidence is stale', () => {
    expect(observeCharging(chargingStates({ chargerPower: state('sensor.power', '3790', {}, 31) }), now))
      .toEqual({ status: 'unknown', confidence: 'unknown' });
    expect(buildChargingAdvice(chargingStates({ chargerPower: state('sensor.power', '3790', {}, 31) }), now, true)?.text)
      .toBe('Får ikke sjekket ladingen nå.');
  });

  it('distinguishes a connected charger from active charging', () => {
    expect(buildChargingAdvice(chargingStates({ chargerMode: state('sensor.mode', 'connected'), chargerCharging: state('binary_sensor.charging', 'off'), chargerPower: state('sensor.power', '0') }), now)?.text)
      .toBe('Hjemmeladeren er tilkoblet, men bilen lader ikke.');
  });

  it('creates a stable preparation and review window without inventing charging duration', () => {
    const advice = chargingPreparationAdvice('commute:andreas:2026-09-06', new Date('2026-09-06T05:35:00Z'));
    expect(advice).toMatchObject({
      id: 'charging:commute:andreas:2026-09-06',
      category: 'charging',
      severity: 'notice',
      text: 'Koble til bilen i kveld.',
    });
    expect(Date.parse(advice.prepareAt)).toBeLessThan(Date.parse(advice.dueAt));
    expect(Date.parse(advice.dueAt)).toBeLessThan(Date.parse(advice.reviewAt));
    expect(Date.parse(advice.reviewAt)).toBeLessThan(Date.parse(advice.expiresAt));
    expect(advice.text).not.toMatch(/timer|ferdig|kl\./i);
  });
});
