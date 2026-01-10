/**
 * Slop Studios 3 - Main Entry Point
 */

export const VERSION = '0.0.1';

export function main(): void {
  console.log(`Slop Studios 3 v${VERSION}`);
}

// Run if executed directly
if (require.main === module) {
  main();
}
