/**
 * Main entry point for the Xiaoyuzhou Creator Platform Automation Tool
 */

import { run } from './cli';

// Run the CLI
run(process.argv).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
