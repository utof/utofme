// Fixture: deliberate undocumented export to drive the check-docs RED test.
// The file-level comment here does NOT satisfy the per-symbol TSDoc rule.
// Task 5a's check-docs.test.ts spawns `bun run check:docs --root tests/fixtures/check-docs`
// and asserts exit 1 with stderr naming `foo`.
//
// Why: needed by `tests/unit/check-docs.test.ts` (Task 5a).
// See: packages/specs/plans/00-foundations.md § Task 4
export const foo = 1;
