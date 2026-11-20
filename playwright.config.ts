import { devices, PlaywrightTestConfig } from "@playwright/test";
import { screenReaderConfig } from "@guidepup/playwright";

// screenReaderConfig = { workers: 1, fullyParallel: false, use: { headless: false } }
// Screen readers do not work against headless browsers.
const config: PlaywrightTestConfig = {
  ...screenReaderConfig,
  testDir: "./tests",
  outputDir: "test-results",
  reportSlowTests: null,
  // One test per page template; the job timeout in .github/workflows/voiceover.yml is 60 min.
  timeout: 50 * 60 * 1000,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  projects: [
    {
      // Playwright's WebKit build (macOS app "Playwright"); the pairing Guidepup recommends for VoiceOver.
      name: "webkit",
      use: { ...devices["Desktop Safari"], headless: false, video: "on" },
    },
  ],
};

export default config;
