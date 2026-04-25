// RED stub — Task 10a wrangler.jsonc shape gate.
//
// Asserts: (i) no top-level `main` key (omit, not null); (ii) assets.directory === './dist';
// (iii) assets.not_found_handling === '404-page'.
//
// Why: wrangler.jsonc is schema-validated by wrangler at deploy time. Having a unit test
// that parses it early catches drift before CI touches real Cloudflare infrastructure.
// The stub pattern (comment-only until activated) matches Tasks 1–6 stubs in this directory.
// Activation: remove this stub from the vitest.config.ts exclude list in the polish round
// that wires full unit coverage.
//
// See: packages/specs/plans/00-foundations.md § Task 10a
// See: packages/specs/adrs/0002-cloudflare-workers-no-adapter-for-static.md
//
// Once activated, replace this file with:
//
//   import { readFileSync } from "node:fs";
//   import { resolve } from "node:path";
//   import { test, expect } from "vitest";
//
//   const raw = readFileSync(
//     resolve(__dirname, "../../wrangler.jsonc"),
//     "utf8"
//   );
//   // Strip line comments (// …) so JSON.parse can handle JSONC
//   const stripped = raw.replace(/^\s*\/\/.*$/gm, "");
//   const cfg = JSON.parse(stripped) as Record<string, unknown>;
//
//   test("no top-level main key", () => {
//     expect(Object.hasOwn(cfg, "main")).toBe(false);
//   });
//
//   test("assets.directory is ./dist", () => {
//     expect((cfg.assets as Record<string, string>).directory).toBe("./dist");
//   });
//
//   test("assets.not_found_handling is 404-page", () => {
//     expect((cfg.assets as Record<string, string>).not_found_handling).toBe(
//       "404-page"
//     );
//   });
