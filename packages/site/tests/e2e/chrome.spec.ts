/**
 * One site chrome: shared header, page-title rule, footer rows, tap targets, phone card
 * caption and share metadata.
 *
 * Why: UI polish review P-01/P-04/P-05/P-06/P-10/P-11 and the phone caption bar finding.
 * @see packages/specs/reviews/ui/polish.md
 */
import { expect, test } from "@playwright/test";

const ROUTES = [
	"/",
	"/now/",
	"/uses/",
	"/colophon/",
	"/tops/",
	"/stats/",
	"/garden/",
	"/garden/graph/",
	"/search/",
	"/works/tactical-arena/",
	"/this-page-does-not-exist-xyz/",
];

test.describe("desktop chrome", () => {
	test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

	test("the wordmark has the same box on every route", async ({ page }) => {
		const boxes: string[] = [];
		for (const route of ROUTES) {
			await page.goto(route);
			const b = await page
				.locator('[data-test="site-header"] [data-test="wordmark"]')
				.boundingBox();
			expect(b, route).not.toBeNull();
			boxes.push(`${Math.round(b?.x ?? 0)},${Math.round(b?.y ?? 0)},${Math.round(b?.height ?? 0)}`);
		}
		expect(new Set(boxes).size, boxes.join(" | ")).toBe(1);
	});

	test("page titles are 36 px at one offset on every non-project, non-home page", async ({
		page,
	}) => {
		const tops: string[] = [];
		for (const route of ROUTES.filter((r) => r !== "/" && !r.startsWith("/works/"))) {
			await page.goto(route);
			const h = await page
				.locator("main h1")
				.first()
				.evaluate((el) => ({
					size: getComputedStyle(el).fontSize,
					top: Math.round(el.getBoundingClientRect().top),
				}));
			expect(h.size, route).toBe("36px");
			tops.push(String(h.top));
		}
		expect(new Set(tops).size, tops.join(",")).toBe(1);
	});

	test("project page: Pause motion lives in the header controls, breadcrumb stays", async ({
		page,
	}) => {
		await page.goto("/works/tactical-arena/");
		await expect(page.locator('[data-test="site-controls"] [data-motion-toggle]')).toBeVisible();
		await expect(page.locator('[data-test="breadcrumb"]')).toBeVisible();
		const t = await page.locator("[data-motion-toggle]").boundingBox();
		const w = await page.locator("[data-test='site-header']").boundingBox();
		// Right edge of the control == right edge of the header column (the sound toggle is
		// left of Pause motion? no: Pause motion first, Sound last).
		expect(t && w).toBeTruthy();
		const sound = await page.locator("[data-sound-toggle]").boundingBox();
		expect((sound?.x ?? 0) + (sound?.width ?? 0)).toBeCloseTo((w?.x ?? 0) + (w?.width ?? 0), 0);
	});

	test("sound and pause toggles share border, radius and height", async ({ page }) => {
		await page.goto("/works/tactical-arena/");
		const style = (sel: string) =>
			page.locator(sel).evaluate((el) => {
				const cs = getComputedStyle(el);
				return [cs.borderTopWidth, cs.borderTopColor, cs.borderRadius, cs.height].join("|");
			});
		expect(await style("[data-sound-toggle]")).toBe(await style("[data-motion-toggle]"));
		await expect(page.locator("[data-sound-toggle]")).toContainText("Sound off");
	});

	test("accent colours link underline on hover (slash page)", async ({ page }) => {
		await page.goto("/now/");
		const link = page.locator("main article a").first();
		await link.hover();
		const c = await link.evaluate((el) => getComputedStyle(el).textDecorationColor);
		expect(c).toBe("rgb(13, 153, 255)");
	});
});

const HIT_SELECTORS = [
	"[data-test='wordmark']",
	"[data-sound-toggle]",
	"[data-motion-toggle]",
	"footer a",
	".h-card a",
	"nav.cross-link a",
	"[data-test='breadcrumb']",
];

/** Every element matching `sel` must own the points at the corners of its 44x44 hit box. */
async function undersized(page: import("@playwright/test").Page): Promise<string[]> {
	return page.evaluate((sels) => {
		const bad: string[] = [];
		for (const sel of sels) {
			for (const el of document.querySelectorAll(sel)) {
				const r = el.getBoundingClientRect();
				if (r.width === 0 || r.height === 0) continue;
				const cx = r.left + r.width / 2;
				const cy = r.top + r.height / 2;
				for (const [dx, dy] of [
					[-21, -21],
					[21, -21],
					[-21, 21],
					[21, 21],
				] as const) {
					const x = cx + dx;
					const y = cy + dy;
					if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
					const hit = document.elementFromPoint(x, y);
					if (!hit || !(el === hit || el.contains(hit)))
						bad.push(`${sel} "${(el.textContent ?? "").trim().slice(0, 14)}" @${dx},${dy}`);
				}
			}
		}
		return bad;
	}, HIT_SELECTORS);
}

for (const [name, viewport, touch] of [
	["phone portrait", { width: 393, height: 852 }, true],
	["desktop", { width: 1280, height: 800 }, false],
] as const) {
	test.describe(`hit areas, ${name}`, () => {
		test.use({ viewport, hasTouch: touch, isMobile: touch });

		for (const route of ["/now/", "/colophon/", "/works/tactical-arena/", "/uses/"]) {
			test(`44x44 hit area on ${route}`, async ({ page }) => {
				await page.goto(route);
				for (const sel of ["footer", ".h-card"])
					await page.locator(sel).first().scrollIntoViewIfNeeded();
				const bad: string[] = [];
				// Scroll each target into view so elementFromPoint can see its box.
				for (const sel of HIT_SELECTORS) {
					const n = await page.locator(sel).count();
					for (let i = 0; i < n; i++) {
						await page.locator(sel).nth(i).scrollIntoViewIfNeeded();
						bad.push(...(await undersized(page)).filter((m) => m.startsWith(sel)));
					}
				}
				expect([...new Set(bad)]).toEqual([]);
			});
		}
	});
}

test.describe("phone footer", () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test("two deliberate rows: copyright + source, then the nav", async ({ page }) => {
		await page.goto("/now/");
		const copy = await page.locator("footer .copy").boundingBox();
		const repo = await page.locator("footer a.repo").boundingBox();
		const nav = await page.locator("footer nav").boundingBox();
		expect(copy && repo && nav).toBeTruthy();
		// Same row for copy and source, nav strictly below both.
		expect(
			Math.abs(
				(copy?.y ?? 0) + (copy?.height ?? 0) / 2 - ((repo?.y ?? 0) + (repo?.height ?? 0) / 2),
			),
		).toBeLessThan(24);
		expect(nav?.y ?? 0).toBeGreaterThanOrEqual((repo?.y ?? 0) + (repo?.height ?? 0) - 1);
	});

	test("card caption bar is about a third of the card; meta hidden; no reveal shift", async ({
		page,
	}) => {
		await page.goto("/");
		const m = await page
			.locator(".card--media")
			.first()
			.evaluate((card) => {
				const h = (sel: string): number =>
					card.querySelector(sel)?.getBoundingClientRect().height ?? 0;
				const style = (sel: string) => {
					const el = card.querySelector(sel);
					return el ? getComputedStyle(el) : null;
				};
				return {
					ratio: h(".cap") / h(".card-figure"),
					meta: style(".cap__m")?.display,
					transform: style(".cap")?.transform,
				};
			});
		expect(m.meta).toBe("none");
		expect(m.transform).toBe("none");
		expect(m.ratio).toBeLessThan(0.36);
	});
});

test.describe("share metadata", () => {
	test("title template and og/twitter tags", async ({ page }) => {
		await page.goto("/garden/");
		await expect(page).toHaveTitle("Garden · utofme");
		const content = (sel: string) => page.locator(sel).getAttribute("content");
		expect(await content('meta[property="og:title"]')).toBe("Garden · utofme");
		expect(await content('meta[property="og:url"]')).toBe("https://utof.me/garden/");
		expect(await content('meta[name="twitter:card"]')).toBe("summary_large_image");
		expect(await content('meta[name="theme-color"]')).toBeTruthy();
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			"href",
			"https://utof.me/garden/",
		);
		await page.goto("/");
		await expect(page).toHaveTitle("utofme");
	});

	test("a project's og:image is a 1200 px wide image that resolves", async ({ page, request }) => {
		await page.goto("/works/tactical-arena/");
		const url = await page.locator('meta[property="og:image"]').getAttribute("content");
		expect(url).toMatch(/^https:\/\/utof\.me\/_astro\//);
		const res = await request.get(new URL(url ?? "", "http://127.0.0.1:4321").pathname);
		expect(res.status()).toBe(200);
		await page.goto("/works/tactical-arena/");
		const size = await page.evaluate(
			async (path) => {
				const img = new Image();
				img.src = path;
				await img.decode();
				return [img.naturalWidth, img.naturalHeight];
			},
			new URL(url ?? "").pathname,
		);
		expect(size).toEqual([1200, 630]);
	});

	test("other pages use the site default image", async ({ page, request }) => {
		await page.goto("/now/");
		const url = await page.locator('meta[property="og:image"]').getAttribute("content");
		expect(url).toBe("https://utof.me/og-default.png");
		expect((await request.get("/og-default.png")).status()).toBe(200);
	});
});
