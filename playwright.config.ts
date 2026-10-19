import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run preview',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
      },
});
