// RED stub: assertions go green once Task 5a wires up Vitest.
// Until then, this file is a placeholder; the spec ties green status of these
// assertions to Task 5a. Vitest is NOT installed in Task 4 — attempting to run
// any test runner before Task 5a will fail. That is intentional.
//
// Why: spec § "Task 4 RED" requires committing a failing test that documents
// the check-docs CLI contract (fixture-based exit 1) before implementation is
// proven. Task 5a is the first moment Vitest exists and this file executes as
// a real test.
// See: packages/specs/plans/00-foundations.md § Task 4
//
// Permanent fixture lives at:
//   packages/site/tests/fixtures/check-docs/missing.ts
// It exports `foo` WITHOUT TSDoc @see/@issue/Why: — the check-docs script must
// flag it (exit 1, stderr naming "foo").
//
// Once Task 5a lands (vitest.config.ts), replace this entire file with:
//
//   import { test, expect } from "vitest";
//   import { execSync } from "node:child_process";
//   import { join } from "node:path";
//
//   const siteRoot = new URL("../..", import.meta.url).pathname;
//
//   test("check-docs exits 1 and names foo for undocumented fixture", () => {
//     let stderr = "";
//     let exitCode = 0;
//     try {
//       execSync("bun run check:docs --root tests/fixtures/check-docs", {
//         cwd: siteRoot,
//         stdio: "pipe",
//       });
//     } catch (err: unknown) {
//       const e = err as { stderr: Buffer; status: number };
//       stderr = e.stderr.toString();
//       exitCode = e.status;
//     }
//     expect(exitCode).toBe(1);
//     expect(stderr).toMatch(/foo/);
//   });
//
//   test("check-docs exits 0 for default --root src (no exports in Phase 0)", () => {
//     expect(() =>
//       execSync("bun run check:docs", {
//         cwd: siteRoot,
//         stdio: "pipe",
//       }),
//     ).not.toThrow();
//   });
