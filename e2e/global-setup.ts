/**
 * Global Playwright Setup
 * Runs once before all tests
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🔧 Global setup starting...');

  // Verify the test server is accessible
  const baseURL = process.env.AUDIT_BASE_URL || `http://localhost:${process.env.E2E_PORT || 3000}`;

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Wait for the server to be ready
    await page.goto(process.env.AUDIT_BASE_URL || 'http://localhost:3000', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });

    // Verify the page loaded correctly
    const title = await page.title();
    console.log(`✅ Server is ready. Page title: "${title}"`);

    await browser.close();
  } catch (error: unknown) {
    console.error('❌ Global setup failed:', error instanceof Error ? error.message : String(error));
    throw new Error(`Global setup failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('✅ Global setup complete');
}

export default globalSetup;