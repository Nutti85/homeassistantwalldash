import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.stubEnv('VITE_DASHBOARD_VERSION', 'v1');
});
