/**
 * Page-level e2e for the research article on `/works/tactical-arena/` (lane I).
 *
 * AC1.3 markup, AC1.7 geometry, AC1.8 Axe (load, hydrated, scripts removed), AC1.9 first screen,
 * AC3.5 dataset requests, AC16.4 CLS, AC16.5 ClientRouter cleanup, linked numbers, and the
 * first-screen `@visual` snapshots. AC1.5 is the existing suites (`chrome`, `footer`,
 * `layout-chrome`, `project-layout`, `banner-quality`, `p09-morph`) run unchanged on the article.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-1, § P10-3, § P10-16
 * @see packages/specs/plans/10-tactical-arena-article.md § Lane I
 */
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";

const URL = "/works/tactical-arena/";
const BASE = "http://127.0.0.1:4321";
/** Section ids in body order (spec P10-17 § Structure). */
const SECTIONS = [
	"ten-seconds",
	"a-board",
	"learning",
	"practice-maps",
	"measured-honestly",
	"stronger-not-more-cs",
	"notebook",
	"toward-real-cs2",
	"methods",
];
/** Datasets fetched on a user action rather than on visible (F7's parked drawer, AC11.6). */
const ON_OPEN = /notebook_parked\./;

declare global {
	interface Window {
		__soft?: number;
	}
}

/** Opens the article in a fresh desktop context (the project default is Pixel 5). */
async function desktop(browser: Browser, width = 1440, height = 900): Promise<Page> {
	const context = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
	const page = await context.newPage();
	await page.goto(URL);
	return page;
}

/**
 * Scroll the whole page in half-viewport steps so every island meets its `client:visible`
 * margin, then wait until none is still server-rendered and the network is quiet.
 */
async function hydrateAll(page: Page): Promise<void> {
	await page.evaluate(async () => {
		const step = window.innerHeight / 2;
		for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
			window.scrollTo(0, y);
			await new Promise((r) => setTimeout(r, 60));
		}
	});
	await expect(page.locator(".article-body astro-island[ssr]")).toHaveCount(0, { timeout: 15_000 });
	await page.waitForLoadState("networkidle");
}

/** Sum of `layout-shift` values without recent input while scrolling top to bottom. */
async function clsOf(page: Page): Promise<number> {
	return page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				let sum = 0;
				new PerformanceObserver((list) => {
					for (const e of list.getEntries()) {
						if (
							"value" in e &&
							typeof e.value === "number" &&
							"hadRecentInput" in e &&
							!e.hadRecentInput
						)
							sum += e.value;
					}
				}).observe({ type: "layout-shift", buffered: true });
				const max = document.documentElement.scrollHeight;
				let y = 0;
				const step = () => {
					window.scrollTo(0, y);
					y += window.innerHeight / 2;
					if (y <= max + window.innerHeight) setTimeout(step, 120);
					else setTimeout(() => resolve(sum), 400);
				};
				step();
			}),
	);
}

/**
 * Elements under `.article-body` whose content is wider than their box (AC1.7).
 *
 * Exempt, each by construction rather than by name:
 * - inside `.katex` (`.katex-mathml` is KaTeX's visually hidden MathML; accents are zero-width
 *   boxes): a formula too wide for the column still fails, through its `.katex-display`;
 * - SVG children: they lay out in the SVG's viewport, which is itself checked;
 * - visually hidden boxes (1 px wide, the screen-reader-only pattern);
 * - the no-JS data tables inside `<details>`, which scroll sideways inside their own box
 *   (WCAG 1.4.10 exempts content that needs two-dimensional layout, such as data tables).
 */
async function overflowing(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>(".article-body, .article-body *")]
			.filter((el) => el.closest(".katex") === null)
			.filter((el) => !(el.parentElement?.closest("svg") ?? null))
			.filter((el) => el.clientWidth > 1)
			.filter(
				(el) =>
					!(
						el.tagName === "TABLE" &&
						el.closest("details") !== null &&
						getComputedStyle(el).overflowX === "auto"
					),
			)
			.filter((el) => el.scrollWidth > el.clientWidth + 1)
			.map(
				(el) =>
					`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${[...el.classList].join(".")} in ${el.closest("figure")?.id ?? "prose"}`,
			),
	);
}

test("AC1.3: variant markup, one h1 = headline, eyebrow, sections nav, no gallery", async ({
	page,
}) => {
	await page.goto(URL);
	await expect(page.locator('article[data-variant="article"]')).toHaveCount(1);
	await expect(page.locator("h1")).toHaveCount(1);
	await expect(page.locator("h1")).toHaveText("Stronger, Not More Human");
	await expect(page.locator(".eyebrow")).toContainText("Tactical Arena");
	const hrefs = await page
		.locator('nav[aria-label="Sections"] a')
		.evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
	expect(hrefs).toEqual(SECTIONS.map((id) => `#${id}`));
	for (const href of hrefs) await expect(page.locator(`h2${href}`)).toHaveCount(1);
	await expect(page.locator(".gallery")).toHaveCount(0);
	await expect(page.locator("a.u-url[hidden]")).toHaveCount(1);
	await expect(page.locator(".e-content.article-body")).toHaveCount(1);
});

test("AC1.7: at 1440 px every wide figure starts at the text edge and is wider than the text", async ({
	browser,
}) => {
	const page = await desktop(browser);
	const text = await page.locator(".article-body > p").first().boundingBox();
	if (!text) throw new Error("no text paragraph");
	const wide = page.locator(".article-body > .fig--wide");
	expect(await wide.count()).toBeGreaterThan(0);
	for (const box of await wide.evaluateAll((els) =>
		els.map((el) => {
			const r = el.getBoundingClientRect();
			return { id: el.id, x: r.x, width: r.width };
		}),
	)) {
		expect(Math.abs(box.x - text.x), box.id).toBeLessThanOrEqual(1);
		expect(box.width, box.id).toBeGreaterThan(text.width);
	}
	await page.context().close();
});

test("AC1.7: at 393 px nothing under .article-body overflows, before and after hydration", async ({
	page,
}) => {
	await page.goto(URL);
	expect(page.viewportSize()?.width).toBe(393);
	expect(await overflowing(page)).toEqual([]);
	await hydrateAll(page);
	expect(await overflowing(page)).toEqual([]);
});

test("AC1.8: Axe is clean at load", async ({ page }) => {
	await page.goto(URL);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("AC1.8: Axe is clean after every figure has hydrated (phone and 1440 px)", async ({
	page,
	browser,
}) => {
	test.setTimeout(120_000);
	await page.goto(URL);
	await hydrateAll(page);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	const wide = await desktop(browser);
	await hydrateAll(wide);
	expect((await new AxeBuilder({ page: wide }).analyze()).violations).toEqual([]);
	await wide.context().close();
});

test("AC1.8: with scripts removed the page is complete and Axe is clean", async ({ browser }) => {
	// Why: Axe itself needs scripting, so "JavaScript disabled" runs it on the no-script markup.
	const context = await browser.newContext({ baseURL: BASE });
	await context.route("**/*.js", (route) => route.abort());
	await context.route(URL, async (route) => {
		const response = await route.fetch();
		const body = (await response.text()).replace(/<script\b[\s\S]*?<\/script>/g, "");
		await route.fulfill({ response, body });
	});
	const page = await context.newPage();
	await page.goto(URL);
	expect(await page.locator("script").count()).toBe(0);
	const figures = page.locator(".article-body figure[data-figure]");
	expect(await figures.count()).toBe(11);
	for (const fig of await figures.all()) await expect(fig.locator("figcaption")).toHaveCount(1);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	await context.close();
});

test("AC1.9: on Pixel 5 the h1 and dek are in the first viewport; banner is 16:9", async ({
	page,
}) => {
	await page.goto(URL);
	const vh = page.viewportSize()?.height ?? 0;
	for (const sel of ["h1", ".lede"]) {
		const b = await page.locator(sel).boundingBox();
		expect(b && b.y + b.height, sel).toBeLessThanOrEqual(vh);
	}
	const banner = await page.locator(".banner").boundingBox();
	if (!banner) throw new Error("no banner");
	expect(banner.width / banner.height / (16 / 9)).toBeGreaterThan(0.98);
	expect(banner.width / banner.height / (16 / 9)).toBeLessThan(1.02);
});

test("AC1.9: at 1440×900 the h1 and dek are in the first viewport; banner is 3:1", async ({
	browser,
}) => {
	const page = await desktop(browser);
	for (const sel of ["h1", ".lede"]) {
		const b = await page.locator(sel).boundingBox();
		expect(b && b.y + b.height, sel).toBeLessThanOrEqual(900);
	}
	const banner = await page.locator(".banner").boundingBox();
	if (!banner) throw new Error("no banner");
	expect(banner.width / banner.height / 3).toBeGreaterThan(0.98);
	expect(banner.width / banner.height / 3).toBeLessThan(1.02);
	await page.context().close();
});

test("AC3.5: datasets load on visible, once per URL, and never again", async ({ page }) => {
	const counts = new Map<string, number>();
	page.on("request", (r) => {
		const path = new globalThis.URL(r.url()).pathname;
		if (/^\/_astro\/[^/]+\.json$/.test(path)) counts.set(path, (counts.get(path) ?? 0) + 1);
	});
	await page.goto(URL);
	await page.waitForLoadState("networkidle");
	const islands = await page.locator(".article-body astro-island").evaluateAll((els) =>
		els.map((el) => {
			const box = (el.closest("figure") ?? el.parentElement ?? el).getBoundingClientRect();
			return {
				top: box.top + window.scrollY,
				urls: [...(el.getAttribute("props") ?? "").matchAll(/\/_astro\/[\w@.-]+\.json/g)].map(
					(m) => m[0],
				),
			};
		}),
	);
	const vh = page.viewportSize()?.height ?? 0;
	const near = new Set(islands.filter((i) => i.top <= vh + 200).flatMap((i) => i.urls));
	const far = islands.filter((i) => i.top > vh + 200 && i.urls.length > 0);
	expect(far.length).toBeGreaterThan(0);
	for (const u of far.flatMap((i) => i.urls).filter((u) => !near.has(u)))
		expect(counts.get(u) ?? 0, `${u} before scrolling`).toBe(0);

	for (const island of islands) {
		await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 100)), island.top);
		for (const u of island.urls.filter((u) => !ON_OPEN.test(u)))
			await expect.poll(() => counts.get(u) ?? 0, { message: u }).toBe(1);
	}
	const settled = new Map(counts);
	for (const [u, n] of settled) expect(n, u).toBe(1);
	for (const u of islands.flatMap((i) => i.urls).filter((u) => ON_OPEN.test(u)))
		expect(counts.get(u) ?? 0, u).toBe(0);

	await page.evaluate(() => window.scrollTo(0, 0));
	for (const island of islands)
		await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 100)), island.top);
	await page.waitForLoadState("networkidle");
	expect(new Map(counts)).toEqual(settled);
});

test("AC16.4: CLS stays at or under 0.02 while scrolling, phone and 1440 px", async ({
	page,
	browser,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	expect(await clsOf(page)).toBeLessThanOrEqual(0.02);
	const wide = await desktop(browser);
	await wide.emulateMedia({ reducedMotion: "reduce" });
	await wide.reload();
	expect(await clsOf(wide)).toBeLessThanOrEqual(0.02);
	await wide.context().close();
});

test("AC16.5: article → home → article three times; every swap away leaves figuresLive at 0", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await page.goto(URL);
	await page.evaluate(() => {
		window.__soft = 1;
	});
	for (let round = 0; round < 3; round++) {
		await hydrateAll(page);
		const live = await page.evaluate(() => Number(document.documentElement.dataset.figuresLive));
		expect(live, `round ${round}: figures hold live resources`).toBeGreaterThan(0);
		await page.locator('[data-test="wordmark"]').click();
		await page.waitForURL("/");
		await expect
			.poll(() => page.evaluate(() => document.documentElement.dataset.figuresLive ?? "unset"))
			.toBe("0");
		expect(await page.evaluate(() => window.__soft), "soft navigation").toBe(1);
		await page.locator(`a[href="${URL}"]`).first().click();
		await page.waitForURL(URL);
		await expect(page.locator('article[data-variant="article"]')).toHaveCount(1);
	}
});

test("linked numbers: hovering a prose number marks the F3 point", async ({ browser }) => {
	const page = await desktop(browser);
	const mark = page.locator('figure#f3 [data-fact="elo.head.block2"]');
	await page.locator("figure#f3").scrollIntoViewIfNeeded();
	await expect(page.locator("figure#f3 astro-island[ssr]")).toHaveCount(0);
	await expect(mark.first()).toBeAttached();
	const prose = page.locator('.article-body > p data[data-fact="elo.head.block2"]').first();
	await prose.scrollIntoViewIfNeeded();
	await prose.hover();
	await expect(mark.first()).toHaveClass(/is-linked/);
	await page.locator("h1").hover();
	await expect(page.locator("figure#f3 .is-linked")).toHaveCount(0);
	await page.context().close();
});

test("@visual article first screen (Pixel 5)", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	await page.waitForLoadState("load");
	await expect(page).toHaveScreenshot("article-first-screen-phone.png", {
		animations: "disabled",
		mask: [page.locator(".banner video")],
	});
});

test("@visual article first screen (1440×900)", async ({ browser }) => {
	const page = await desktop(browser);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.reload();
	await page.waitForLoadState("load");
	await expect(page).toHaveScreenshot("article-first-screen-desktop.png", {
		animations: "disabled",
		mask: [page.locator(".banner video")],
	});
	await page.context().close();
});
