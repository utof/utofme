// Catalogue home (`/`): structure, jump links, expandable rows (mouse, keyboard, no JS),
// object canvases, chrome and Axe.
// @see packages/specs/adrs/0061-catalogue-home-curated-model.md
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const REAL_WORKS = [
	"tactical-arena",
	"eeg-ads1299-lab",
	"enth",
	"godot-ctcs",
	"gr-demo-learn",
	"linsae",
	"modified-maxwell-taichi",
];

const rows = (page: Page) => page.locator("details[data-home-row]");
const openRows = (page: Page) => page.locator("details[data-home-row][open]");

test.describe("structure", () => {
	test("one h1 (the wordmark), topic h2s, project h3s", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator("h1")).toHaveCount(1);
		await expect(page.getByRole("heading", { level: 1, name: "utofme" })).toBeVisible();
		await expect(page.locator('h1 a[data-test="wordmark"]')).toHaveAttribute("href", "/");
		const topics = page.locator('[data-test="home-topic"]');
		expect(await topics.count()).toBeGreaterThanOrEqual(5);
		expect(await page.locator('[data-test="home-topic"] > h2').count()).toBe(await topics.count());
		expect(await page.locator('[data-test="home-row"] h3').count()).toBe(await rows(page).count());
		await expect(page.locator("[role='heading']")).toHaveCount(0);
	});

	test("hero and highlighted follow the curation; every real work is listed in a topic", async ({
		page,
	}) => {
		await page.goto("/");
		await expect(page.locator('[data-test="home-hero"]')).toHaveCount(1);
		await expect(page.locator('[data-test="home-hero"] [data-work-slug]')).toHaveAttribute(
			"data-work-slug",
			"tactical-arena",
		);
		const highlighted = await page
			.locator('[data-test="home-highlighted"] [data-work-slug]')
			.evaluateAll((els) => els.map((el) => el.getAttribute("data-work-slug")));
		expect(highlighted).toEqual(REAL_WORKS.slice(1));
		for (const slug of REAL_WORKS) {
			await expect(page.locator(`details[data-home-row][data-slug="${slug}"]`)).toHaveCount(1);
		}
	});

	test("topics follow the registry order and mapping", async ({ page }) => {
		await page.goto("/");
		const ids = await page
			.locator('[data-test="home-topic"]')
			.evaluateAll((els) => els.map((el) => el.id));
		expect(ids.slice(0, 5)).toEqual([
			"topic-physics",
			"topic-rl",
			"topic-audio",
			"topic-electronics",
			"topic-notes",
		]);
		const physics = await page
			.locator("#topic-physics details[data-home-row]")
			.evaluateAll((els) => els.map((el) => el.getAttribute("data-slug")));
		expect(physics).toEqual(["godot-ctcs", "gr-demo-learn", "modified-maxwell-taichi"]);
		await expect(page.locator("#topic-rl details[data-home-row]")).toHaveAttribute(
			"data-slug",
			"tactical-arena",
		);
	});

	test("no mock stand-ins ship", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByText(/sample project/i)).toHaveCount(0);
		await expect(page.getByText(/stand-in/i)).toHaveCount(0);
	});

	test("every link on the page resolves", async ({ page, request }) => {
		await page.goto("/");
		const hrefs = await page
			.locator("header a[href], nav a[href], main a[href], footer a[href]")
			.evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute("href") ?? ""))]);
		const internal = hrefs.filter((h) => h.startsWith("/"));
		expect(internal.length).toBeGreaterThan(10);
		for (const href of internal) {
			expect(href.endsWith("/"), `${href} has a trailing slash`).toBe(true);
			expect((await request.get(href)).status(), href).toBe(200);
		}
		for (const href of hrefs.filter((h) => !h.startsWith("/") && !h.startsWith("#"))) {
			expect(href, href).toMatch(/^https:\/\//);
		}
	});
});

test.describe("jump links", () => {
	test("list Featured and every topic with its count", async ({ page }) => {
		await page.goto("/");
		const links = page.locator('[data-test="home-jump"] a');
		const featured = await page.locator('[data-test="works-grid"] > li').count();
		await expect(links.first()).toHaveAttribute("href", "#featured");
		await expect(links.first()).toHaveText(new RegExp(`^\\s*Featured\\s*${featured}\\s*$`));
		const topics = await page.locator('[data-test="home-topic"]').evaluateAll((els) =>
			els.map((el) => ({
				href: `#${el.id}`,
				count: el.querySelectorAll("details[data-home-row]").length,
			})),
		);
		expect(await links.count()).toBe(topics.length + 1);
		for (const [i, t] of topics.entries()) {
			const link = links.nth(i + 1);
			await expect(link).toHaveAttribute("href", t.href);
			await expect(link).toHaveText(new RegExp(`\\s${t.count}\\s*$`));
		}
	});

	for (const viewport of [
		{ width: 393, height: 851 },
		{ width: 1360, height: 900 },
	]) {
		test(`a jump lands the section heading below the sticky header (${viewport.width} px)`, async ({
			page,
		}) => {
			await page.setViewportSize(viewport);
			// Why: instant scrolling, so the position can be read right after the click.
			await page.emulateMedia({ reducedMotion: "reduce" });
			await page.goto("/");
			await page.locator('[data-test="home-jump"] a[href="#topic-audio"]').click();
			await expect(page).toHaveURL(/#topic-audio$/);
			await expect
				.poll(async () => {
					return page.evaluate(() => {
						const bottoms = [
							...document.querySelectorAll('[data-test="site-header"], [data-test="home-jump"]'),
						]
							.filter((el) => getComputedStyle(el).position === "sticky")
							.map((el) => el.getBoundingClientRect().bottom);
						const heading = document.querySelector("#topic-audio h2")?.getBoundingClientRect();
						if (!heading) return -999;
						return heading.top - Math.max(...bottoms);
					});
				})
				.toBeGreaterThanOrEqual(0);
			await expect(page.locator("#topic-audio h2")).toBeInViewport();
		});
	}
});

test.describe("rows", () => {
	test("none is open at first; a click opens one across the grid with the lede and a link", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1360, height: 900 });
		await page.goto("/");
		await expect(openRows(page)).toHaveCount(0);
		const row = page.locator('details[data-home-row][data-slug="gr-demo-learn"]');
		const more = row.locator('[data-test="home-row-more"]');
		await expect(more).toBeHidden();
		const closedWidth = (await row.boundingBox())?.width ?? 0;
		await row.locator("summary").click();
		await expect(row).toHaveAttribute("open", "");
		await expect(more).toBeVisible();
		await expect(more.locator("p")).toContainText("Julia");
		await expect(more.locator('[data-test="home-row-open"]')).toHaveAttribute(
			"href",
			"/works/gr-demo-learn/",
		);
		const grid = await page.locator("#topic-physics ul").boundingBox();
		const openWidth = (await row.boundingBox())?.width ?? 0;
		expect(openWidth).toBeGreaterThan(closedWidth * 1.5);
		expect(Math.abs(openWidth - (grid?.width ?? 0))).toBeLessThan(2);
	});

	test("only one row is open at a time; clicking it again closes it", async ({ page }) => {
		await page.goto("/");
		const first = rows(page).nth(0);
		const later = rows(page).nth(4);
		await first.locator("summary").click();
		await expect(openRows(page)).toHaveCount(1);
		await later.locator("summary").click();
		await expect(openRows(page)).toHaveCount(1);
		await expect(later).toHaveAttribute("open", "");
		await expect(first).not.toHaveAttribute("open", "");
		await later.locator("summary").click();
		await expect(openRows(page)).toHaveCount(0);
	});

	test("the open button navigates to the project", async ({ page }) => {
		await page.goto("/");
		const row = page.locator('details[data-home-row][data-slug="linsae"]');
		await row.locator("summary").click();
		await row.locator('[data-test="home-row-open"]').click();
		await page.waitForURL("**/works/linsae/");
		await expect(page.locator("h1")).toBeVisible();
	});

	test("keyboard: Enter and Space toggle a focused row, with a visible focus ring", async ({
		page,
	}) => {
		await page.goto("/");
		const row = page.locator('details[data-home-row][data-slug="enth"]');
		const summary = row.locator("summary");
		// A key press first, so the script focus below counts as keyboard focus (:focus-visible).
		await page.keyboard.press("Tab");
		await summary.focus();
		await expect(summary).toBeFocused();
		await expect(summary).toHaveCSS("outline-style", "solid");
		await expect(summary).toHaveCSS("outline-width", "4px");
		await page.keyboard.press("Enter");
		await expect(row).toHaveAttribute("open", "");
		await page.keyboard.press("Space");
		await expect(row).not.toHaveAttribute("open", "");
		await page.keyboard.press("Space");
		await expect(row).toHaveAttribute("open", "");
		// The next Tab stop is the row's own link: nothing interactive is nested in the summary.
		await page.keyboard.press("Tab");
		await expect(row.locator('[data-test="home-row-open"]')).toBeFocused();
		expect(await page.locator("summary a, summary button, a a, a button").count()).toBe(0);
	});

	test("opening a row is announced by the native control (no role=button divs)", async ({
		page,
	}) => {
		await page.goto("/");
		await expect(page.locator("div[role='button']")).toHaveCount(0);
		expect(await page.locator("details[data-home-row] > summary").count()).toBe(
			await rows(page).count(),
		);
	});
});

test.describe("without JavaScript", () => {
	test.use({ javaScriptEnabled: false });

	test("every project is reachable and rows still open", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByRole("heading", { level: 1, name: "utofme" })).toBeVisible();
		// Featured cards are plain links.
		await expect(page.locator('[data-test="home-hero"] a.card')).toHaveAttribute(
			"href",
			"/works/tactical-arena/",
		);
		// Every real work has a link in the markup.
		for (const slug of REAL_WORKS) {
			expect(await page.locator(`a[href="/works/${slug}/"]`).count()).toBeGreaterThanOrEqual(1);
		}
		// Rows show title, lede and date closed, and open natively.
		const row = page.locator('details[data-home-row][data-slug="godot-ctcs"]');
		await expect(row.locator("h3")).toHaveText("THROAT");
		await expect(row.locator("summary time")).toBeVisible();
		await row.locator("summary").click();
		await expect(row.locator('[data-test="home-row-open"]')).toBeVisible();
		await expect(row.locator('[data-test="home-row-open"]')).toHaveAttribute(
			"href",
			"/works/godot-ctcs/",
		);
	});
});

test.describe("object canvases", () => {
	test("are decorative, pixelated and drawn", async ({ page }) => {
		await page.goto("/");
		const canvases = page.locator("canvas[data-home-obj]");
		const total = await canvases.count();
		expect(total).toBeGreaterThan(10);
		expect(await page.locator('canvas[data-home-obj][aria-hidden="true"]').count()).toBe(total);
		await expect(canvases.first()).toHaveCSS("image-rendering", "pixelated");
		// Named objects for the real works, generic (no data-obj) for the rest.
		await expect(page.locator('[data-test="home-hero"] canvas[data-home-obj]')).toHaveAttribute(
			"data-obj",
			"tactical",
		);
		// Every canvas has pixels, including those far below the fold.
		await expect
			.poll(() =>
				canvases.evaluateAll(
					(els) =>
						els.filter((el) => {
							if (!(el instanceof HTMLCanvasElement)) return true;
							const data = el.getContext("2d")?.getImageData(0, 0, el.width, el.height).data;
							return !data?.some((v) => v !== 0);
						}).length,
				),
			)
			.toBe(0);
	});

	test("spin while visible and stand still when motion is paused", async ({ page }) => {
		await page.goto("/");
		const snapshot = () =>
			page
				.locator('[data-test="home-hero"] canvas[data-home-obj]')
				.evaluate((el) => (el instanceof HTMLCanvasElement ? el.toDataURL() : ""));
		const first = await snapshot();
		await expect.poll(snapshot, { timeout: 5000 }).not.toBe(first);
		await page.getByRole("button", { name: /pause motion/i }).click();
		await page.waitForTimeout(300);
		const paused = await snapshot();
		await page.waitForTimeout(700);
		expect(await snapshot()).toBe(paused);
	});

	test("reduced motion: a still frame, no animation", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/");
		const snapshot = () =>
			page
				.locator('[data-test="home-hero"] canvas[data-home-obj]')
				.evaluate((el) => (el instanceof HTMLCanvasElement ? el.toDataURL() : ""));
		await page.waitForTimeout(300);
		const still = await snapshot();
		expect(still.length).toBeGreaterThan(200);
		await page.waitForTimeout(700);
		expect(await snapshot()).toBe(still);
	});
});

test.describe("chrome and look", () => {
	test("light page colour, scanlines, display and pixel faces", async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => document.fonts.ready);
		const body = await page.locator("body").evaluate((el) => {
			const c = getComputedStyle(el);
			return { bg: c.backgroundColor, image: c.backgroundImage, size: c.backgroundSize };
		});
		expect(body.bg).toBe("rgb(226, 225, 221)");
		expect(body.image).toContain("linear-gradient");
		expect(body.size).toBe("100% 6px");
		expect(await page.evaluate(() => document.documentElement.dataset["theme"])).toBe("light");
		const family = (sel: string) =>
			page
				.locator(sel)
				.first()
				.evaluate((el) => getComputedStyle(el).fontFamily);
		expect(await family("h1")).toMatch(/Michroma/);
		expect(await family('[data-test="home-jump"] a')).toMatch(/Jersey 15/);
		expect(
			await page.evaluate(
				() => document.fonts.check('16px "Michroma"') && document.fonts.check('16px "Jersey 15"'),
			),
		).toBe(true);
	});

	test("fonts are self-hosted and preloaded; no third-party font request", async ({ page }) => {
		const hosts = new Set<string>();
		page.on("request", (r) => {
			if (r.resourceType() === "font") hosts.add(new URL(r.url()).host);
		});
		await page.goto("/");
		await page.evaluate(() => document.fonts.ready);
		expect([...hosts]).toEqual([new URL(page.url()).host]);
		const preloads = await page
			.locator('link[rel="preload"][as="font"]')
			.evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
		expect(preloads).toHaveLength(2);
		for (const href of preloads) expect(href).toMatch(/^\/_astro\/.*\.woff2$/);
	});

	test("header nav and footer carry only real routes", async ({ page }) => {
		await page.goto("/");
		const nav = await page
			.locator('nav[aria-label="Site"] a')
			.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
		expect(nav).toEqual(["/garden/", "/now/", "/uses/", "/search/", "https://github.com/utof"]);
		const footer = page.locator('footer[aria-label="Site footer"]');
		await expect(footer).toBeVisible();
		const foot = await footer
			.locator("a")
			.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
		expect(foot).toEqual(["/colophon/", "/tops/", "/stats/", "https://github.com/utof/utofme"]);
		await expect(page.locator("[data-motion-toggle]")).toBeVisible();
	});

	test("header, main and footer share one left edge", async ({ page }) => {
		await page.setViewportSize({ width: 1360, height: 900 });
		await page.goto("/");
		const lefts = await page.evaluate(() =>
			[
				'[data-test="wordmark"]',
				'[data-test="home-jump"] a',
				"main h2 + ul, main ul",
				"footer p",
			].map((sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().left ?? -1)),
		);
		expect(new Set(lefts).size, lefts.join(",")).toBe(1);
	});

	for (const width of [360, 393, 800, 1360]) {
		test(`no horizontal overflow at ${width} px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto("/");
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
			);
			expect(overflow).toBeLessThanOrEqual(0);
			// With a row open too.
			await rows(page).first().locator("summary").click();
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
				),
			).toBeLessThanOrEqual(0);
		});
	}

	test("tap targets in the header, jump row and footer are at least 44 px tall", async ({
		page,
	}) => {
		await page.goto("/");
		const small = await page
			.locator('[data-test="site-header"] a, [data-test="home-jump"] a, footer a, summary')
			.evaluateAll((els) =>
				els
					.filter((el) => el.getBoundingClientRect().height < 44)
					.map((el) => el.textContent ?? ""),
			);
		expect(small).toEqual([]);
	});
});

test.describe("accessibility", () => {
	test("Axe: no violations, rows closed", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("load");
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	});

	test("Axe: no violations with a row open", async ({ page }) => {
		await page.goto("/");
		await rows(page).first().locator("summary").click();
		await page.waitForTimeout(500);
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	});
});
