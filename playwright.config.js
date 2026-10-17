import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
const port = Number(process.env.PARTIVA_E2E_PORT || 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Porta E2E inválida.");
export default defineConfig({
  // OneDrive may lock trace files during browser shutdown. Keep transient
  // browser artifacts outside the synchronized checkout.
  outputDir: join(tmpdir(), "partiva-e2e", `run-${process.pid}`),
  testDir: "tests/e2e",
  testMatch: "*.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
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
      command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
      url: `http://127.0.0.1:${port}`,
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
