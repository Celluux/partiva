import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.CI ? undefined : "msedge",
      },
    },
  ],
  webServer: [
    {
      command:
        "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
        VITE_API_URL: "http://127.0.0.1:5199",
      },
    },
    {
      command: "node tests/e2e/server.mjs",
      url: "http://127.0.0.1:5199/health",
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
