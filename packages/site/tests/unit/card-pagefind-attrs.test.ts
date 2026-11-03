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
 * Per-card block extraction: each card is `<a class="card …"` or
 * `<article class="card …"` … `</a>` / `</article>`. We locate each block by
 * scanning for opening tags whose class list contains the token `card` (the
 * masonry home renders `class="card card--media"`, `/works/` renders
 * `class="card"`) and finding the matching close tag. Attributes are read
 * independently of their order (Astro emits `class:list` last).
 * This is intentionally simple — no external HTML parser dep needed.
 * The assertion is per-card (keyed on data-preview-target) so a regression
 * that emits spans outside a card, or skips spans on one variant, will fail.
 *
 * data-work-slug: replaces the old static `transition:name` (P9-9 names the
 * morph frame at click time); the scope attribute must be absent.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 8 (Container API fallback)
 * @see https://pagefind.app/docs/metadata/ (fetched 2026-04-26)
 * @see https://docs.astro.build/en/guides/view-transitions/ (fetched 2026-04-26)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const SITE_DIR = join(import.meta.dirname, "../..");
const INDEX_HTML = join(SITE_DIR, "dist/index.html");

let html = "";

/** Map from data-preview-target id → the inner HTML of that card element. */
const cardBlocks = new Map<string, string>();

/** Map from data-preview-target id → the card's opening tag (attributes only). */
const cardOpenTags = new Map<string, string>();

/**
 * Opening tag of an `<a>` / `<article>`. The attribute part tolerates a `>`
 * inside a quoted value (e.g. a `data-summary` containing markup characters).
 */
const OPEN_TAG_RE = /<(a|article)\s(?:[^>"]|"[^"]*")*>/g;

/**
 * Read one attribute value out of an opening tag, independent of attribute order.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 8
 */
function attrValue(openTag: string, name: string): string | undefined {
	return new RegExp(`\\s${name}="([^"]*)"`).exec(openTag)?.[1];
}

/**
 * Extract per-card HTML blocks (and opening tags) from the built index.html.
 *
 * Why regex over a DOM parser: avoids an extra dev-dep; the HTML shape is
 * fixed by Card.astro and deterministic across builds. A real HTML parser
 * would be safer for arbitrary HTML but is overkill for one known template.
 *
 * Why match the `card` class TOKEN rather than `class="card"`: the media variant
 * on the masonry home adds `card--media` (ADR 0040), and Astro renders `class:list`
 * after the other attributes, so neither the exact class string nor the position of
 * `data-preview-target` relative to it is stable.
 *
 * @see packages/specs/plans/02-interactivity.md § Task 8
 * @see packages/specs/adrs/0040-light-only-masonry-home.md
 */
function extractCards(source: string): {
	blocks: Map<string, string>;
	openTags: Map<string, string>;
} {
	const blocks = new Map<string, string>();
	const openTags = new Map<string, string>();
	// Use matchAll to avoid Biome's noAssignInExpressions lint rule; the pattern
	// has the /g flag so matchAll returns all matches lazily.
	// match.index is always defined for /g matches from matchAll — narrow it
	// explicitly because TS types it as `number | undefined`.
	for (const match of source.matchAll(OPEN_TAG_RE)) {
		const openTag = match[0];
		const tagName = match[1]; // "a" or "article"
		if (tagName === undefined) continue;
		const classes = (attrValue(openTag, "class") ?? "").split(/\s+/);
		if (!classes.includes("card")) continue;
		// data-preview-target is always present on cards rendered by Card.astro.
		const id = attrValue(openTag, "data-preview-target"); // e.g. "code-2"
		if (id === undefined) continue;
		const tagStart = match.index ?? 0;
		const innerStart = tagStart + openTag.length;
		// Find the matching close tag. Nesting of the same tag isn't a concern
		// because <a> and <article> never nest within themselves in this output.
		const closeTag = `</${tagName}>`;
		const closeIdx = source.indexOf(closeTag, innerStart);
		if (closeIdx === -1) continue;
		blocks.set(id, source.slice(innerStart, closeIdx));
		openTags.set(id, openTag);
	}
	return { blocks, openTags };
}

beforeAll(() => {
	// Read the previously-built dist/index.html.
	// If the file doesn't exist the test will throw here with a clear message.
	html = readFileSync(INDEX_HTML, "utf-8");
	const { blocks, openTags } = extractCards(html);
	for (const [id, block] of blocks) {
		cardBlocks.set(id, block);
	}
	for (const [id, openTag] of openTags) {
		cardOpenTags.set(id, openTag);
	}
});

// ---------------------------------------------------------------------------
// Fixtures present in the production build (draft:true cards are excluded).
// Each entry mirrors the frontmatter in packages/site/src/content/works/*.
// ---------------------------------------------------------------------------
const PROD_FIXTURES = [
	{
		id: "code-1",
		title: "Demo project alpha",
		date: "2026-04-01",
		type: "code",
		tags: ["demo", "expressive-code"],
		summary:
			"A demo code work showcasing Expressive Code rendering with title, copy button, and the light github theme.",
	},
	{
		id: "code-2",
		title: "Hello world utility",
		date: "2026-03-15",
		type: "code",
		tags: ["utility"],
		summary: "Production-visible code fixture.",
	},
	{
		id: "math-2",
		title: "Production number theory notes",
		date: "2026-03-28",
		type: "math",
		tags: ["number-theory"],
		summary: "Production-visible math fixture with number theory content.",
	},
	{
		id: "music-2",
		title: "Production beat study",
		date: "2026-03-25",
		type: "music",
		tags: ["beat", "study"],
		summary: "Production-visible music fixture: synthesizer melody over a live drum loop.",
	},
	{
		id: "video-2",
		title: "Production video overview",
		date: "2026-03-20",
		type: "video",
		tags: ["overview", "video"],
		summary: "Production-visible video fixture with a longer runtime.",
	},
	{
		id: "writing-2",
		title: "Production post on iteration",
		date: "2026-03-30",
		type: "writing",
		tags: ["post", "iteration"],
		summary: "Production-visible writing fixture about the value of iterative thinking.",
	},
	{
		id: "writing-3-no-summary",
		title: "Writing without a summary",
		date: "2026-01-10",
		type: "writing",
		tags: ["no-summary"],
		summary: undefined, // intentionally absent — key test case
	},
	{
		id: "cover-fixture",
		title: "Cover image fixture",
		date: "2026-04-26",
		type: "writing",
		tags: ["cover-image", "phase-3"],
		summary: "Demonstrates the Phase 3 image pipeline.",
	},
	{
		id: "external-only",
		title: "External-only code fixture",
		date: "2026-01-05",
		type: "code",
		tags: ["external-only"],
		summary: "Fixture with external URL but no body, for card-href branch testing.",
	},
	{
		id: "no-link",
		title: "No-link writing fixture",
		date: "2026-01-04",
		type: "writing",
		tags: ["no-link"],
		summary: "Fixture with no body and no external URL, for card article-branch testing.",
	},
	{
		id: "writing-mdx-island",
		title: "MDX Svelte island demo",
		date: "2026-04-26",
		type: "writing",
		tags: ["mdx", "svelte"],
		summary: "Demonstrates Svelte 5 islands embedded inside MDX with state isolation.",
	},
	{
		id: "code-sandbox",
		title: "Live Sandpack demo",
		date: "2026-04-26",
		type: "code",
		tags: ["sandpack", "react", "phase-3"],
		summary: "Demonstrates a live React playground via Sandpack.",
	},
] as const;

// ---------------------------------------------------------------------------
// Helper: assert a span with the given attribute and value is inside `block`.
// ---------------------------------------------------------------------------
function containsMeta(block: string, metaValue: string): boolean {
	return block.includes(`data-pagefind-meta="${metaValue}"`);
}
function containsFilter(block: string, filterValue: string): boolean {
	return block.includes(`data-pagefind-filter="${filterValue}"`);
}

describe("Card.astro — per-card block extraction", () => {
	it("all 12 production cards are present in the build output", () => {
		expect(cardBlocks.size).toBe(PROD_FIXTURES.length);
		for (const f of PROD_FIXTURES) {
			expect(cardBlocks.has(f.id), `card block missing for id "${f.id}"`).toBe(true);
		}
	});
});

describe("Card.astro — per-card data-pagefind-meta spans (per-variant)", () => {
	for (const fixture of PROD_FIXTURES) {
		describe(`fixture: ${fixture.id}`, () => {
			it("card block contains data-pagefind-meta=title with correct text", () => {
				const block = cardBlocks.get(fixture.id) ?? "";
				expect(containsMeta(block, "title")).toBe(true);
				expect(block).toContain(fixture.title);
			});

			it("card block contains data-pagefind-meta=date with YYYY-MM-DD value", () => {
				const block = cardBlocks.get(fixture.id) ?? "";
				expect(containsMeta(block, "date")).toBe(true);
				// Assert the ISO date slice (YYYY-MM-DD) appears in this card.
				expect(block).toContain(fixture.date);
				// Assert the value is formatted as YYYY-MM-DD (not a full ISO string).
				expect(block).toMatch(/data-pagefind-meta="date"[^>]*>\d{4}-\d{2}-\d{2}/);
			});

			if (fixture.summary !== undefined) {
				it("card block contains data-pagefind-meta=summary with non-empty text", () => {
					const block = cardBlocks.get(fixture.id) ?? "";
					expect(containsMeta(block, "summary")).toBe(true);
					// Verify the summary text itself is in the block (non-empty).
					expect(block).toContain(fixture.summary);
				});
			} else {
				it("card block does NOT contain data-pagefind-meta=summary (no summary in fixture)", () => {
					// Why: the template conditionally renders the summary span only when
					// data.summary is truthy. A regression that always emits the span
					// would be caught here.
					const block = cardBlocks.get(fixture.id) ?? "";
					expect(containsMeta(block, "summary")).toBe(false);
				});
			}
		});
	}
});

describe("Card.astro — per-card data-pagefind-filter spans (per-variant)", () => {
	for (const fixture of PROD_FIXTURES) {
		describe(`fixture: ${fixture.id}`, () => {
			it(`card block contains data-pagefind-filter=type with value "${fixture.type}"`, () => {
				const block = cardBlocks.get(fixture.id) ?? "";
				expect(containsFilter(block, "type")).toBe(true);
				// Verify the type value textContent appears in the block.
				// Why: tolerate whitespace between `>` and the value — Astro can emit
				// indented children inside spans depending on the surrounding template.
				expect(block).toMatch(
					new RegExp(`data-pagefind-filter="type"[^>]*>\\s*${fixture.type}\\s*<`),
				);
			});

			for (const tag of fixture.tags) {
				it(`card block contains data-pagefind-filter=tag with value "${tag}"`, () => {
					const block = cardBlocks.get(fixture.id) ?? "";
					// At least one tag span with this exact tag value must be inside the block.
					// Whitespace tolerance: see comment above on the type filter.
					expect(block).toMatch(new RegExp(`data-pagefind-filter="tag"[^>]*>\\s*${tag}\\s*<`));
				});
			}
		});
	}
});

describe("Card.astro — morph hooks (per-variant)", () => {
	it("every production card has data-work-slug and no static transition scope", () => {
		// Why: P9-9 names the clicked card's [data-vt-frame] at click time, so cards
		// must carry `data-work-slug` and NO static `transition:name` scope.
		for (const fixture of PROD_FIXTURES) {
			const openTag = cardOpenTags.get(fixture.id) ?? "";
			expect(attrValue(openTag, "data-work-slug"), `data-work-slug on "${fixture.id}"`).toBe(
				fixture.id,
			);
			expect(attrValue(openTag, "data-astro-transition-scope")).toBeUndefined();
		}
	});

	it("exactly one data-work-slug card per production fixture", () => {
		const withSlug = [...cardOpenTags.values()].filter(
			(openTag) => attrValue(openTag, "data-work-slug") !== undefined,
		);
		expect(withSlug.length).toBe(PROD_FIXTURES.length);
	});
});
