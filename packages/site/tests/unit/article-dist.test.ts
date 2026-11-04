/**
 * Build checks over `dist/` for the research article (AC3.4, AC16.3).
 *
 * Pre-condition: `bun run build` has run (fixture or deploy build; both emit the article). As in
 * `card-pagefind-attrs.test.ts`, the suite reads the built output instead of building, because
 * other suites write temporary content entries while Vitest runs files in parallel.
 *
 * - AC3.4: every dataset a figure Block imports with `?url&no-inline` is emitted exactly once as
 *   `dist/_astro/<name>.<hash>.json`; its URL appears in the route HTML only inside island
 *   `props`; nothing is inlined as `data:application/json`; no file under `dist/` carries a
 *   sidecar's `"syncedAt"`.
 * - AC16.3: every island inside `.article-body` is `client="visible"` with the spec's root margin
 *   and a decoded `props` attribute of at most 2,048 UTF-8 bytes; the chrome's islands outside
 *   the body are the same as on a Tier S works page.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-3 (AC3.4), § P10-16 (AC16.3)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

// Why: happy-dom makes import.meta.url non-file; vitest runs with cwd = packages/site.
const SITE = process.cwd();
const DIST = join(SITE, "dist");
const BLOCKS = join(SITE, "src/components/article");
const ROUTE_HTML = readFileSync(join(DIST, "works/tactical-arena/index.html"), "utf8");
const { document } = parseHTML(ROUTE_HTML);

/** Dataset names imported as hashed URLs by any figure Block, sorted. */
function blockDatasets(): string[] {
	const names = new Set<string>();
	for (const f of readdirSync(BLOCKS).filter((n) => n.endsWith("Block.astro"))) {
		const src = readFileSync(join(BLOCKS, f), "utf8");
		for (const m of src.matchAll(/data\/article\/([a-z0-9_]+)\.json\?url&no-inline/g))
			if (m[1] !== undefined) names.add(m[1]);
	}
	return [...names].sort();
}

/** Every file under `dir`, as absolute paths. */
function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
	);
}

/** Islands as `name client rootMargin` lines, for the chrome comparison. */
function islandLines(islands: readonly Element[]): string[] {
	return islands
		.map((i) => {
			const opts = JSON.parse(i.getAttribute("opts") ?? "{}") as { name?: string };
			return `${opts.name ?? "?"} ${i.getAttribute("client") ?? "?"}`;
		})
		.sort();
}

describe("AC3.4: datasets are hashed static files referenced only from island props", () => {
	const astro = readdirSync(join(DIST, "_astro"));
	const names = blockDatasets();

	it("every committed dataset output is imported by a Block", () => {
		const outputs = readdirSync(join(SITE, "src/data/article"))
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.replace(/\.json$/, ""))
			.sort();
		expect(names).toEqual(outputs);
	});

	it.each(names)("%s: exactly one dist/_astro/<name>.<hash>.json", (name) => {
		const files = astro.filter((f) => new RegExp(`^${name}\\.[\\w-]+\\.json$`).test(f));
		expect(files).toHaveLength(1);
	});

	it.each(names)("%s: its URL is in the route HTML only inside island props", (name) => {
		const file = astro.find((f) => new RegExp(`^${name}\\.[\\w-]+\\.json$`).test(f));
		const url = `/_astro/${file}`;
		const inProps = [...document.querySelectorAll("astro-island")].filter((i) =>
			(i.getAttribute("props") ?? "").includes(url),
		);
		expect(inProps.length).toBeGreaterThanOrEqual(1);
		// Why: attribute values are entity-encoded, so `props="…"` never contains a raw quote.
		expect(ROUTE_HTML.replace(/\sprops="[^"]*"/g, "")).not.toContain(url);
	});

	it("inlines no JSON data URI", () => {
		expect(ROUTE_HTML).not.toContain("data:application/json");
	});

	it('no dist file carries a sidecar\'s "syncedAt"', () => {
		const hits = walk(DIST).filter((f) => readFileSync(f).includes('"syncedAt"'));
		expect(hits).toEqual([]);
	});
});

describe("AC16.3: article islands are lazy and their props small", () => {
	const body = document.querySelector(".article-body");
	const inBody = body ? [...body.querySelectorAll("astro-island")] : [];

	it("has the body and its figure islands", () => {
		expect(body).not.toBeNull();
		expect(inBody.length).toBeGreaterThanOrEqual(10);
	});

	it.each(
		inBody.map(
			(i) =>
				[(JSON.parse(i.getAttribute("opts") ?? "{}") as { name?: string }).name ?? "?", i] as const,
		),
	)("%s: client:visible with rootMargin 200px 0px, props ≤ 2,048 bytes", (_name, island) => {
		expect(island.getAttribute("client")).toBe("visible");
		const opts = JSON.parse(island.getAttribute("opts") ?? "{}") as {
			value?: { rootMargin?: string };
		};
		expect(opts.value?.rootMargin).toBe("200px 0px");
		expect(Buffer.byteLength(island.getAttribute("props") ?? "", "utf8")).toBeLessThanOrEqual(2048);
	});

	it("the chrome's islands outside the body match a Tier S works page", () => {
		const outside = [...document.querySelectorAll("astro-island")].filter(
			(i) => !body?.contains(i),
		);
		const tierS = readdirSync(join(DIST, "works"), { withFileTypes: true })
			.filter((e) => e.isDirectory() && e.name !== "tactical-arena")
			.map((e) => join(DIST, "works", e.name, "index.html"))
			.find((f) => !readFileSync(f, "utf8").includes('data-variant="article"'));
		if (tierS === undefined) throw new Error("no Tier S works page in dist");
		const other = parseHTML(readFileSync(tierS, "utf8")).document;
		expect(islandLines(outside)).toEqual(islandLines([...other.querySelectorAll("astro-island")]));
	});
});
