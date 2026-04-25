// RED stub: assertions below execute once Task 5a wires up Vitest.
// Until then, this file is a placeholder; green status is tied to Task 5a.
// Vitest is NOT installed in Task 2 — attempting to run any test runner before
// Task 5a will fail. That is intentional.
//
// Why: spec § "Task 2 RED" requires committing a failing test that documents
// the biome.json and lefthook.yml config contract before tooling is proven.
// Task 5a is the first moment Vitest exists and this file executes as a real test.
// See: packages/specs/plans/00-foundations.md § Task 5a
//
// Once Task 5a lands (vitest.config.ts), replace this entire file with:
//
// import { test, expect } from "vitest";
// import { readFileSync } from "node:fs";
// import yaml from "js-yaml";
//
// test("biome.json has $schema pointing to biomejs.dev 2.x", () => {
//   const cfg = JSON.parse(
//     readFileSync(new URL("../../biome.json", import.meta.url), "utf8"),
//   );
//   expect(cfg.$schema).toMatch(/biomejs\.dev\/schemas\/2\..+\/schema\.json/);
// });
//
// test("lefthook.yml pre-commit uses piped group", () => {
//   const cfg = yaml.load(
//     readFileSync(new URL("../../../../lefthook.yml", import.meta.url), "utf8"),
//   ) as Record<string, unknown>;
//   const jobs = (cfg["pre-commit"] as { jobs: { group: { piped: boolean } }[] })
//     ?.jobs;
//   expect(jobs?.[0]?.group?.piped).toBe(true);
// });
