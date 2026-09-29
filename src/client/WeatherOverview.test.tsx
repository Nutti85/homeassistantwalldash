import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WeatherChart } from './WeatherOverview';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('updates the compact plot and spaces time labels when its SVG resizes', () => {
  let resize = () => {};
  let width = 320;
  let height = 150;
  const observe = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe = observe;
    disconnect() {}
  });
  vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width, height }) as DOMRect);
  const points = Array.from({ length: 6 }, (_, index) => ({ datetime: `2026-09-29T${10 + index}:00:00Z`, temperature: 12, precipitation: 0, windSpeed: 3 }));
  const { container } = render(<WeatherChart points={points} compact/>);
  const svg = container.querySelector('svg')!;
  expect(observe).toHaveBeenCalledWith(svg);
  const labels = [...svg.querySelectorAll('.time-label')];
  expect(labels).toHaveLength(2);
  expect(Number(labels[1].getAttribute('x')) - Number(labels[0].getAttribute('x'))).toBeGreaterThanOrEqual(48);
  width = 640;
  height = 300;
  act(() => resize());
  expect(svg.querySelectorAll('.time-label')).toHaveLength(6);
  expect(svg.getAttribute('viewBox')).toBe('0 0 640 300');
});
