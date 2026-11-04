/**
 * Research-article layout on `/lab/article-layout/` (AC1.3, AC1.7, AC1.8, AC1.9).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-1
 */
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";

const URL = "/lab/article-layout/";
const BASE = "http://127.0.0.1:4321";

/** Opens the lab page in a fresh desktop context (the project default is Pixel 5). */
async function desktop(browser: Browser, width = 1440, height = 900): Promise<Page> {
	const context = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
	const page = await context.newPage();
	await page.goto(URL);
	return page;
}

test("AC1.3: variant markup, one h1 = headline, eyebrow, sections nav, no gallery", async ({
	page,
}) => {
	await page.goto(URL);
	await expect(page.locator('article[data-variant="article"]')).toHaveCount(1);
	await expect(page.locator("h1")).toHaveCount(1);
	await expect(page.locator("h1")).toHaveText("Layout lab: a research article");
	await expect(page.locator(".eyebrow")).toContainText("Tactical Arena");
	const links = page.locator('nav[aria-label="Sections"] a');
	await expect(links).toHaveCount(3);
	for (const href of await links.evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) {
		await expect(page.locator(href)).toHaveCount(1);
	}
	await expect(page.locator(".gallery")).toHaveCount(0);
	await expect(page.locator("a.u-url[hidden]")).toHaveCount(1);
	await expect(page.locator(".e-content.article-body")).toHaveCount(1);
});

test("AC1.3: each h2 has a labelled # anchor", async ({ page }) => {
	await page.goto(URL);
	const anchor = page.locator("h2#widths a.anchor");
	await expect(anchor).toHaveAttribute("href", "#widths");
	await expect(anchor).toHaveAttribute("aria-label", "Link to section Figure widths");
});

test("AC1.7: at 1440 px a wide figure starts at the text edge and is wider than the text", async ({
	browser,
}) => {
	const page = await desktop(browser);
	const box = async (sel: string) => {
		const b = await page.locator(sel).first().boundingBox();
		if (!b) throw new Error(`no box for ${sel}`);
		return b;
	};
	const text = await box(".article-body > p");
	const wide = await box("#lab-wide");
	const textFig = await box("#lab-text");
	const full = await box("#lab-full");
	expect(Math.abs(wide.x - text.x)).toBeLessThanOrEqual(1);
	expect(wide.width).toBeGreaterThan(text.width);
	expect(textFig.width).toBeLessThanOrEqual(text.width + 1);
	expect(full.width).toBeGreaterThanOrEqual(wide.width);
	await page.context().close();
});

test("aside note sits in the aside column at 1440 px", async ({ browser }) => {
	const page = await desktop(browser);
	const text = await page.locator(".article-body > p").first().boundingBox();
	const aside = await page.locator("aside.note").boundingBox();
	if (!text || !aside) throw new Error("missing boxes");
	expect(aside.x).toBeGreaterThan(text.x + text.width);
	await page.context().close();
});

test("AC1.7: at 393 px nothing under .article-body overflows horizontally", async ({ browser }) => {
	const page = await desktop(browser, 393, 851);
	const offenders = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>(".article-body, .article-body *")]
			.filter((el) => el.scrollWidth > el.clientWidth + 1)
			.map((el) => el.tagName + (el.id ? `#${el.id}` : "")),
	);
	expect(offenders).toEqual([]);
	await page.context().close();
});

test("AC1.8: Axe is clean at load", async ({ page }) => {
	await page.goto(URL);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

/**
 * Axe over the page as served with every `<script>` removed.
 *
 * Why: Axe itself needs scripting, so the "JavaScript disabled" check (AC1.8) runs
 * it on the no-script markup in a normal context.
 */
async function axeWithoutScripts(
	browser: Browser,
): Promise<{ violations: unknown[]; figures: number }> {
	const context = await browser.newContext({ baseURL: BASE });
	await context.route("**/*.js", (route) => route.abort());
	await context.route(URL, async (route) => {
		const response = await route.fetch();
		const body = (await response.text()).replace(/<script\b[\s\S]*?<\/script>/g, "");
		await route.fulfill({ response, body });
	});
	const page = await context.newPage();
	await page.goto(URL);
	const scripts = await page.locator("script").count();
	const figures = await page.locator("figure[data-figure]").count();
	const { violations } = await new AxeBuilder({ page }).analyze();
	await context.close();
	return { violations: scripts === 0 ? violations : [{ id: "scripts-still-present" }], figures };
}

test("AC1.8: Axe is clean with scripts removed, and the page is complete", async ({ browser }) => {
	const result = await axeWithoutScripts(browser);
	expect(result.figures).toBe(3);
	expect(result.violations).toEqual([]);
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
