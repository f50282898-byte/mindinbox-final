/**
 * Global Playwright Teardown
 * Runs once after all tests
 */

import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Global teardown starting...');

  // Clean up any test artifacts
  // Note: Playwright handles browser cleanup automatically

  console.log('✅ Global teardown complete');
}

export default globalTeardown;