export type ClimateMetric = 'temperature' | 'humidity' | 'co2';
export type ClimateRoomType = 'living_room' | 'bedroom' | 'bathroom';
export type ClimateStatus = 'low_critical' | 'low_warning' | 'good' | 'high_warning' | 'high_critical' | 'unavailable';

type Thresholds = {
  good: readonly [number, number];
  lowWarning: number;
  lowCritical: number;
  highWarning: number;
  highCritical: number;
};

type RoomClimateRules = Partial<Record<ClimateMetric, Thresholds>>;

const temperatureRules: Record<ClimateRoomType, Thresholds> = {
  living_room: { good: [20, 22], lowWarning: 18, lowCritical: 18, highWarning: 22, highCritical: 24 },
  bedroom: { good: [18, 21], lowWarning: 18, lowCritical: 16, highWarning: 21, highCritical: 23 },
  bathroom: { good: [22, 24], lowWarning: 20, lowCritical: 20, highWarning: 24, highCritical: 26 },
};

const humidityRules: Record<ClimateRoomType, Thresholds> = {
  living_room: { good: [30, 50], lowWarning: 30, lowCritical: 20, highWarning: 50, highCritical: 60 },
  bedroom: { good: [30, 50], lowWarning: 30, lowCritical: 20, highWarning: 50, highCritical: 60 },
  bathroom: { good: [30, 50], lowWarning: 30, lowCritical: 20, highWarning: 60, highCritical: 70 },
};

const occupiedCo2: Thresholds = { good: [350, 800], lowWarning: 350, lowCritical: 350, highWarning: 800, highCritical: 1500 };

export const roomClimateRules: Record<ClimateRoomType, RoomClimateRules> = {
  living_room: { temperature: temperatureRules.living_room, humidity: humidityRules.living_room, co2: occupiedCo2 },
  bedroom: { temperature: temperatureRules.bedroom, humidity: humidityRules.bedroom, co2: occupiedCo2 },
  bathroom: { temperature: temperatureRules.bathroom, humidity: humidityRules.bathroom },
};

export function classifyClimateValue(value: number | undefined, metric: ClimateMetric, roomType: ClimateRoomType): ClimateStatus {
  const rules = roomClimateRules[roomType][metric];
  if (value === undefined || !Number.isFinite(value) || !rules) return 'unavailable';
  if (metric === 'co2' && value < 350) return 'unavailable';
  if (value < rules.lowCritical) return 'low_critical';
  if (value < rules.lowWarning) return 'low_warning';
  if (value <= rules.good[1] && value >= rules.good[0]) return 'good';
  if (value > rules.highCritical) return 'high_critical';
  if (value > rules.highWarning) return 'high_warning';
  return value < rules.good[0] ? 'low_warning' : 'high_warning';
}

export const climateStatusColor: Record<ClimateStatus, string> = {
  low_critical: '#68b9df',
  low_warning: '#68b9df',
  good: '#67cf9b',
  high_warning: '#eda928',
  high_critical: '#ff655d',
  unavailable: '#777b76',
};
