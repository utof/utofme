// RED stub: assertion goes green once Task 5a wires up Vitest.
// Until then, this file is a placeholder; the spec ties green status of this
// assertion to Task 5a. Vitest is NOT installed in Task 1 — attempting to run
// any test runner before Task 5a will fail. That is intentional.
//
// Why: spec §"Task 1 RED" requires committing a failing test that documents
// the Astro env contract before the scaffold is proven. Task 5a is the first
// moment Vitest exists and this file executes as a real test.
// See: packages/specs/plans/00-foundations.md § Task 5a
//
// Once Task 5a lands (vitest.config.ts + globals: true), replace this entire
// file with:
//
//   import { test, expect } from "vitest";
//   test("BASE_URL is /", () => {
//     expect(import.meta.env.BASE_URL).toBe("/");
//   });
