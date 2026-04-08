import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3002',
    screenshot: 'only-on-failure',
    navigationTimeout: 45000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
})
