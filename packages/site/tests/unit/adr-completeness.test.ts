// RED stub — Task 10d ADR completeness gate.
//
// Asserts that all six Phase 0 ADRs exist under packages/specs/adrs/:
//   0001-monorepo-bun-workspaces.md
//   0002-cloudflare-workers-no-adapter-for-static.md
//   0003-biome-plus-narrow-prettier.md
//   0004-static-output-default.md
//   0005-mono-font-fallback-ofl-only.md
//   0006-defer-stryker-and-fast-check-to-phase-1.md
//
// Why: a machine-checkable invariant that the Phase 0 ADR list from
// packages/specs/specs/00-foundations.md § "ADRs to write" is fully delivered.
// Prevents accidental deletion or renaming of ADR files in future commits.
//
// See: packages/specs/plans/00-foundations.md § Task 10d
// See: packages/specs/specs/00-foundations.md § "ADRs to write"
//
// Once activated (remove from vitest.config.ts exclude list), replace this file with:
//
//   import { readdirSync } from "node:fs";
//   import { resolve } from "node:path";
//   import { test, expect } from "vitest";
//
//   const ADRS_DIR = resolve(__dirname, "../../../packages/specs/adrs");
//   const adrs = readdirSync(ADRS_DIR);
//
//   const REQUIRED = [
//     "0001-monorepo-bun-workspaces.md",
//     "0002-cloudflare-workers-no-adapter-for-static.md",
//     "0003-biome-plus-narrow-prettier.md",
//     "0004-static-output-default.md",
//     "0005-mono-font-fallback-ofl-only.md",
//     "0006-defer-stryker-and-fast-check-to-phase-1.md",
//   ] as const;
//
//   for (const adr of REQUIRED) {
//     test(`ADR file exists: ${adr}`, () => {
//       expect(adrs).toContain(adr);
//     });
//   }
