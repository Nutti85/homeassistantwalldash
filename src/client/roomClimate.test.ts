import { describe, expect, it } from 'vitest';
import { classifyClimateValue } from './roomClimate';

describe('room climate classification', () => {
  it('uses room-specific temperature comfort ranges', () => {
    expect(classifyClimateValue(21, 'temperature', 'living_room')).toBe('good');
    expect(classifyClimateValue(17, 'temperature', 'bedroom')).toBe('low_warning');
    expect(classifyClimateValue(25, 'temperature', 'bathroom')).toBe('high_warning');
  });

  it('treats low CO₂ as unavailable and elevated CO₂ as warnings', () => {
    expect(classifyClimateValue(320, 'co2', 'living_room')).toBe('unavailable');
    expect(classifyClimateValue(801, 'co2', 'bedroom')).toBe('high_warning');
    expect(classifyClimateValue(1501, 'co2', 'bedroom')).toBe('high_critical');
    expect(classifyClimateValue(600, 'co2', 'bathroom')).toBe('unavailable');
  });
});
