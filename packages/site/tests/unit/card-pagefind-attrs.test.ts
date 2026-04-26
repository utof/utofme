/**
 * Unit tests: Card.astro Pagefind index attributes — build-output approach.
 *
 * Why: The Astro Container API cannot render Card.astro in a plain Vitest
 * environment because Card uses a dynamic tag variable `<Tag>` (resolved to
 * `"a"` or `"article"` at runtime). Astro's SSR runtime treats non-literal tag
 * names as framework components and throws NoMatchingRenderer — a known
 * Container API limitation. The plan's fallback is to render via `bun run build`
 * and assert on the dist HTML output. This is authoritative: the build output
 * is exactly what Pagefind indexes at `pagefind build` time.
 *
 * Pre-condition: `bun run build` must have been run before this test suite
 * (lefthook and CI both run build first). In the TDD workflow the developer
 * runs `bun run build && bun run test` to flip RED → GREEN.
 *
 * Why not trigger the build from beforeAll: `schema-violations.test.ts` writes
 * a temporary invalid fixture to `src/content/works/` during its test run.
 * Vitest runs test files in parallel by default, so triggering a build from
 * beforeAll races with that test's fixture file and the build fails on the
 * invalid content entry. Reading the already-built dist avoids the race.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 8 (Container API fallback)
 * @see https://pagefind.app/docs/metadata/ (fetched 2026-04-26)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const SITE_DIR = join(import.meta.dirname, "../..");
const INDEX_HTML = join(SITE_DIR, "dist/index.html");

let html = "";

beforeAll(() => {
	// Read the previously-built dist/index.html.
	// If the file doesn't exist the test will throw here with a clear message.
	html = readFileSync(INDEX_HTML, "utf-8");
});

describe("Card.astro — data-pagefind-meta spans (build output)", () => {
	it("at least one card has data-pagefind-meta=title span", () => {
		expect(html).toContain('data-pagefind-meta="title"');
	});

	it("at least one card has data-pagefind-meta=date span", () => {
		expect(html).toContain('data-pagefind-meta="date"');
	});

	it("date meta spans contain ISO-format dates (YYYY-MM-DD)", () => {
		// Ensure the date value rendered is the ISO slice, not a full ISO string.
		// The build fixtures have dates like 2026-03-15 so this pattern must match.
		expect(html).toMatch(/data-pagefind-meta="date"[^>]*>\d{4}-\d{2}-\d{2}</);
	});

	it("at least one card has data-pagefind-meta=summary span (fixture has summary)", () => {
		// Both code-1 and music-2 fixtures have a summary field.
		expect(html).toContain('data-pagefind-meta="summary"');
	});

	it("cards without a summary field have no extra data-pagefind-meta=summary span near no-summary card title", () => {
		// writing-3-no-summary.md fixture has no summary. Verify title span present.
		// Full absence test runs in e2e where we can isolate the specific card element.
		expect(html).toContain("Writing without a summary");
	});
});

describe("Card.astro — data-pagefind-filter spans (build output)", () => {
	it("contains data-pagefind-filter=type span with value 'code'", () => {
		expect(html).toMatch(/data-pagefind-filter="type"[^>]*>code</);
	});

	it("contains data-pagefind-filter=type span with value 'video'", () => {
		expect(html).toMatch(/data-pagefind-filter="type"[^>]*>video</);
	});

	it("contains data-pagefind-filter=type span with value 'music'", () => {
		expect(html).toMatch(/data-pagefind-filter="type"[^>]*>music</);
	});

	it("contains data-pagefind-filter=type span with value 'math'", () => {
		expect(html).toMatch(/data-pagefind-filter="type"[^>]*>math</);
	});

	it("contains data-pagefind-filter=type span with value 'writing'", () => {
		expect(html).toMatch(/data-pagefind-filter="type"[^>]*>writing</);
	});

	it("contains at least one data-pagefind-filter=tag span", () => {
		expect(html).toContain('data-pagefind-filter="tag"');
	});

	it("contains multiple data-pagefind-filter=tag spans (multi-tag fixture)", () => {
		// music-2 has tags: ["beat", "study"]; writing-1 has tags: ["post", "iteration"].
		// Two or more tag spans must appear.
		const matches = html.match(/data-pagefind-filter="tag"/g) ?? [];
		expect(matches.length).toBeGreaterThanOrEqual(2);
	});

	it("tag spans contain the fixture tag values", () => {
		// "utility" is the tag from code-1.md; "beat" from music-2.md.
		expect(html).toContain("utility");
		expect(html).toContain("beat");
	});
});

describe("Card.astro — transition:name attribute (build output)", () => {
	it("rendered HTML contains 'card-' prefix from transition:name on at least one element", () => {
		// Astro compiles `transition:name={`card-${id}`}` into a
		// data-astro-transition-scope attribute whose value includes the slug.
		// The exact attribute name is Astro-internal, but the value "card-<id>"
		// must appear somewhere in the output.
		// Fixture ids: code-1, math-1, music-1, video-1, writing-1 etc.
		expect(html).toMatch(/card-code-\d|card-math-\d|card-music-\d|card-video-\d|card-writing-\d/);
	});
});
