import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a PRODUCTION build (`next build && next start`)
 * and a real PostgreSQL database given by E2E_DATABASE_URL. The database is
 * wiped and migrated by tests/e2e/global-setup.ts — never point it at real data.
 */
const PORT = 3200;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://mts:mts@localhost:5432/my_training_sheet_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "iphone",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        // Local runs can reuse an installed Chrome instead of downloading one.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { DATABASE_URL },
  },
});
