// RED stub: assertion below executes once Task 5a wires up Vitest.
// Until then, this file is a placeholder; green status is tied to Task 5a.
// Vitest is NOT installed in Task 3 — attempting to run any test runner before
// Task 5a will fail. That is intentional.
//
// Why: spec § "Task 3 RED" requires committing a failing test that documents
// the knip CLI contract (exits 0 on packages/site) before implementation is
// proven. Task 5a is the first moment Vitest exists and this file executes as
// a real test.
// See: packages/specs/plans/00-foundations.md § Task 3
//
// Once Task 5a lands (vitest.config.ts), replace this entire file with:
//
// import { test, expect } from "vitest";
// import { execSync } from "node:child_process";
//
// test("knip exits 0 on packages/site", () => {
//   expect(() =>
//     execSync("bun x knip", {
//       cwd: new URL("../..", import.meta.url).pathname,
//       stdio: "pipe",
//     }),
//   ).not.toThrow();
// });
