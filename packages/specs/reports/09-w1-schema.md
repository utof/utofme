# 09 · W1 — works schema v2 + fixture handling

Branch `p09/w1-schema` (from `origin/phase/09-project-view`). Spec P9-3; review findings 7 and 11 applied.

## Built
- `src/content.config.ts`: schema v2 (shape verbatim below). `cover` is now `media` (backward-compatible with `{src, alt}`).
- `fixture: true` frontmatter added to all 16 mock entries (frontmatter only, bodies untouched).
- `src/lib/works.ts`: `listWorks(..., { includeFixtures })` (default `true`) and pure `prevNext(entries, id)` -> `{ prev, next }`.
- `src/lib/works-collection.ts`: `getWorksCollection(filter?)`, the single gateway. It reads `UTOFME_FIXTURES` from `astro:env/server`.
- `astro.config.mjs`: `env.schema.UTOFME_FIXTURES = envField.boolean({ context: "server", access: "public", default: true })`.
- All six `getCollection("works", …)` callers now use the gateway: `index.astro`, `works/index.astro` and `lab/datamosh.astro` (one call line plus the import each), `works/[...slug].astro`, `feed.xml.ts` and `feed/works.xml.ts`. Nothing else queries `works`. The sitemap and pagefind need no change, because fixture pages are never built when the flag is false.
- Guard `scripts/check-no-fixtures.ts` plus `package.json` script `check:no-fixtures`. `deploy.yml` builds with `UTOFME_FIXTURES: "false"` and then runs the guard step.
- Existing tests that build `WorkEntry` by hand (`works-helpers`, `feed`, `microformats`) gained the new defaulted fields `gallery: []`, `links: []`, `fixture: false`.

## Final Zod shape (verbatim)
```ts
const loopSlug = z
	.string()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
	.max(64);

/**
export function worksSchema({ image }: SchemaContext) {
	const media = z.object({
		src: image(),
		alt: z.string().min(1).max(200),
		loop: loopSlug.optional(),
		focus: z.number().int().min(0).max(100).default(50),
	});
	const baseFields = {
		title: z.string(),
		slug: z.string().optional(),
		date: z.coerce.date(),
		updated: z.coerce.date().optional(),
		tags: z.array(z.string()).default([]),
		draft: z.boolean().default(false),
		summary: z.string().max(240).optional(),
		cover: media.optional(),
		gallery: z
			.array(media.extend({ caption: z.string().min(1).max(100) }))
			.max(5)
			.default([]),
		lede: z.string().min(1).max(120).optional(),
		status: z.enum(["shipped", "prototype", "research", "archived"]).optional(),
		started: z.coerce.date().optional(),
		links: z
			.array(
				z.object({
					label: z.string().min(1).max(24),
					href: z.url(),
					private: z.boolean().default(false),
				}),
			)
			.max(5)
			.default([]),
		fixture: z.boolean().default(false),
	};
	const stack = z.array(z.string().min(1)).max(8).optional();

	return z
		.discriminatedUnion("type", [
			z.object({
				type: z.literal("code"),
				repo: z.url().optional(),
				stack: z.array(z.string()),
				...baseFields,
			}),
			z.object({
				type: z.literal("video"),
				stack,
				duration: z.number(),
				youtube: z.string().optional(),
				...baseFields,
			}),
			z.object({
				type: z.literal("music"),
				stack,
				bpm: z.number().optional(),
				listen: z.url().optional(),
				...baseFields,
			}),
			z.object({
				type: z.literal("math"),
				stack,
				pdf: z.string().optional(),
				arxiv: z.string().optional(),
				...baseFields,
			}),
			z.object({
				type: z.literal("writing"),
				stack,
				wordCount: z.number().optional(),
				readingTime: z.number().optional(),
				...baseFields,
			}),
		])
		.superRefine((d, ctx) => {
			if (d.started && d.started.getTime() > d.date.getTime()) {
				ctx.addIssue({
					code: "custom",
					path: ["started"],
					message: "started must be on or before date",
				});
			}
		});
}

```
`WorkEntry = z.infer<ReturnType<typeof worksSchema>>` is unchanged. Its output type now always has `gallery`, `links` and `fixture` (they are defaulted).
Note: `focus` defaults to 50 and `private` to false. `lede`, `status`, `started`, `cover.loop` and `stack` on non-code types are optional.

## Guard
- Scans every file under `dist/`. File and directory names are checked as paths. Text files (html/xml/txt/json/js/css/svg) are checked for content. Pagefind `.pf_*` files are gunzipped first.
- Fixture slugs come from `fixture: true` in `src/content/works/*.md(x)`. A hit is `works/<slug>` not followed by `[A-Za-z0-9_-]`, or a `data-fixture` attribute.
- `[data-fixture]` is only caught if `Card.astro` emits it. That file belongs to another worker, so the slug scan is the real protection.

## Proof (both runs documented)
- `UTOFME_FIXTURES=false bun run build` built 17 pages, and the guard printed `check-no-fixtures: clean (16 fixture slugs …)`, exit 0. `dist/works/` contains only `index.html`.
- `bun run build` with the default (fixtures on) built 29 pages, and the guard reported `97 fixture leak(s)` (for example `lab/datamosh/index.html: works/code-1` and `index.html: works/music-2`), exit 1.
- Both build runs also ran with `/lab/datamosh` routed through the gateway, so with fixtures off there is no fixture card or GIF on that page.

## Gates (packages/site)
- Unit suite: 360 passed, 73 skipped. The only failing file is `card-pagefind-attrs.test.ts` (71 tests, failing at import), which fails before my change too. 0 type errors.
- New tests: `works-schema-v2.test.ts` (15, fast-check) and `check-no-fixtures.test.ts` (5).
- `biome check`: no errors (25 infos, all pre-existing style hints).
- `astro check`: 0 errors, 0 warnings.
- `type-coverage --strict`: 100.00% (21695/21695).
- `knip`: only the pre-existing lefthook config hint.
- `check:docs`: pass.
- Not run: Playwright e2e.

## Decisions
- The gateway takes the caller's predicate and ANDs the fixture filter. This keeps the edits to files owned by other workers to a single call line plus the import.
- `listWorks` defaults `includeFixtures` to true, so dev, CI and tests are unchanged. Production exclusion happens in the gateway.
- The `superRefine` for `started ≤ date` wraps the union. `z.infer` still resolves, and `discriminatedUnion` is not otherwise affected.
- The guard does not try to decode pagefind CBOR indexes. Fragments hold URLs, and no fixture page is indexed when it is not built.

## Open issues
- `public/loops/mock-*` (review finding 7b) is not handled here, because P9-11 is deferred. The guard will catch a slug reference if one appears.
- Content-lint (AC3.4) is not part of this task.
