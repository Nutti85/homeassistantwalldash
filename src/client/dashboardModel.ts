import type { HomeAssistantState } from '../shared/entities';

const unavailableLabel = 'Ikke tilgjengelig';

export const homeLabel = (state: Pick<HomeAssistantState, 'state'> | undefined): string => {
  if (!state || state.state === 'unavailable' || state.state === 'unknown') {
    return unavailableLabel;
  }

  return state.state;
};

export const booleanLabel = (state: Pick<HomeAssistantState, 'state'> | undefined): string => {
  if (!state || state.state === 'unavailable' || state.state === 'unknown') {
    return unavailableLabel;
  }

  return state.state === 'on' ? 'På' : state.state === 'off' ? 'Av' : state.state;
};

export const temperatureNumber = (state: HomeAssistantState | undefined): number | undefined => {
  const value = state?.attributes.temperature;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

export const temperatureValue = (state: HomeAssistantState | undefined): string => {
  const value = temperatureNumber(state);
  if (value !== undefined) return `${value} °C`;
  const currentTemperature = state?.attributes.current_temperature;
  return typeof currentTemperature === 'number' && Number.isFinite(currentTemperature)
    ? `${currentTemperature} °C nå · settpunkt mangler`
    : unavailableLabel;
};
