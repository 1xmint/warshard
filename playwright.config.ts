import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  globalTimeout: 600_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1440, height: 1000 },
    // Exercise the shipped low-resolution setting on CI's software GPU.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:5173",
          localStorage: [{ name: "warshard.quality", value: "2" }],
        },
      ],
    },
    trace: "retain-on-failure",
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // The launcher owns separate child process groups on Unix; let it reap them
    // before Playwright falls back to killing the parent group.
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
