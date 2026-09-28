import { defineConfig, devices } from '@playwright/test';

const port = 4175;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : undefined,
  },
  webServer: {
    command: 'pnpm exec vite --config vite.e2e.config.ts --host 127.0.0.1',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      BASE_PATH: '/',
      PORT: String(port),
      NODE_ENV: 'test',
    },
  },
});