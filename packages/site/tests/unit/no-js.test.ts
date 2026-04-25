// RED stub — Task 6 post-build JS-absence gate.
//
// The actual gate is scripts/no-js-check.ts (invoked by `bun run check:no-js`
// in CI and as a post-build script). That script is the hard-fail path cited in:
// packages/specs/specs/00-foundations.md §"size-limit budget for Phase 0"
// packages/specs/plans/00-foundations.md §"Task 6"
//
// Why: keeping this as a comment-only stub (matching the pattern from Tasks 1–4)
// avoids embedding a slow `execSync('bun run build')` inside the Vitest suite,
// which would inflate unit-test run-time unacceptably. The real gate runs in CI
// as a discrete step, not inside Vitest. Task 10b wires it as:
//   `bun run scripts/no-js-check.ts` (post-build step in ci.yml).
//
// If a future task wants a proper Vitest assertion here, replace this comment
// with:
//
//   import { test, expect, beforeAll } from "vitest";
//   import { execSync } from "node:child_process";
//
//   beforeAll(() => {
//     execSync("bun run build", { cwd: process.cwd(), stdio: "inherit" });
//   }, 120_000);
//
//   test("no JS chunks under dist/_astro/", async () => {
//     const matches = Array.from(
//       new Bun.Glob("dist/_astro/*.js").scanSync({ cwd: process.cwd() })
//     );
//     expect(matches).toEqual([]);
//   });
//
// See: packages/specs/plans/00-foundations.md § Task 6
