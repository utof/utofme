// Why: canonical "harness wired" smoke test — proves Vitest 4.x + happy-dom are
// installed and vitest.config.ts is resolved correctly. All other stubs in this
// directory remain comment-only until their respective tasks activate them.
// See: packages/specs/plans/00-foundations.md § Task 5a
import { expect, test } from "vitest";

test("vitest harness wired", () => {
	expect(1 + 1).toBe(2);
});
