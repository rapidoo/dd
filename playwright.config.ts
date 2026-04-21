import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3001);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
// When SKIP_WEBSERVER=1, tests run against the already-running dev server
// (useful when `pnpm dev` is already up on :3000 — Next locks the project dir).
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: `pnpm next dev -p ${PORT}`,
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 120_000,
          env: { ALLOW_TEST_LOGIN: '1' },
        },
      }),
});
