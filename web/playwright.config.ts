import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 8799;
const python = process.platform === "win32" ? "..\\.venv\\Scripts\\python.exe" : "../.venv/bin/python";

/** End-to-end tests against the built app served by the backend with Foundry switched off. */
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // An installed browser channel avoids downloading Playwright's own Chromium.
    channel: process.env.PW_CHANNEL ?? "chrome",
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: `${python} ../scripts/serve_fallback.py ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    // Comics printed during the tests go to a temp folder, not the presenter's output folder.
    env: { BOTTLE_THRONE_OUTPUT_DIR: join(tmpdir(), "bottle-throne-e2e") },
  },
});
