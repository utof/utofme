/**
 * The site pet never rests on text or controls, and is accessible (AC2.9, AC2.10).
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (2, 3), § "Accessibility"
 * @see packages/specs/adrs/0062-site-pet-design-rules.md
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { ARTICLE, BASE, bringOut, engage, openPet, settled } from "./pet-support";

/** Content the pet's visible part touches: text blocks, figures and controls, in viewport coordinates. */
async function covered(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const btn = document.querySelector("#pet-root .pet-btn");
		if (!btn) return ["no pet"];
		const r = btn.getBoundingClientRect();
		const pet = {
			left: Math.max(0, r.left),
			right: Math.min(document.documentElement.clientWidth, r.right),
			top: r.top,
			bottom: r.bottom,
		};
		const selector =
			"main p, main h1, main h2, main h3, main h4, main li, main figure, main pre, main table, main blockquote, a, button, input, summary, video, img";
		const hits: string[] = [];
		for (const el of document.querySelectorAll(selector)) {
			if (el.closest("#pet-root")) continue;
			const style = getComputedStyle(el);
			if (style.visibility === "hidden" || style.display === "none") continue;
			for (const b of el.getClientRects()) {
				const overlap =
					Math.min(pet.right, b.right) - Math.max(pet.left, b.left) > 0.5 &&
					Math.min(pet.bottom, b.bottom) - Math.max(pet.top, b.top) > 0.5;
				if (overlap) {
					hits.push(`${el.tagName.toLowerCase()}: ${(el.textContent ?? "").trim().slice(0, 40)}`);
					break;
				}
			}
		}
		return hits;
	});
}

for (const [width, height] of [
	[390, 780],
	[1360, 800],
] as const) {
	for (const route of [ARTICLE, "/"]) {
		test(`AC2.10: at ${width} px on ${route} the resting pet covers no text and no control, top to bottom`, async ({
			browser,
		}) => {
			const context = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
			const page = await context.newPage();
			const root = await openPet(page, route);
			await settled(page);
			expect(await covered(page)).toEqual([]);
			// Part of the pet is always there to be found.
			expect(Number(await root.getAttribute("data-visible"))).toBeGreaterThanOrEqual(10);

			const total = await page.evaluate(() => document.documentElement.scrollHeight);
			let widest = Number(await root.getAttribute("data-visible"));
			for (const share of [0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 1]) {
				await page.evaluate((y) => window.scrollTo(0, y), Math.round((total - height) * share));
				// The pet re-checks its place 150 ms after the scroll stops.
				await page.waitForTimeout(450);
				await settled(page);
				expect(await covered(page), `scrolled to ${Math.round(share * 100)} %`).toEqual([]);
				// It only ever retreats on its own.
				const now = Number(await root.getAttribute("data-visible"));
				expect(now).toBeLessThanOrEqual(widest);
				widest = now;
			}
			await expect(root).toHaveAttribute("data-mood", "asleep");
			await context.close();
		});
	}
}

test("AC2.10: called out over content, it goes back by itself when the visitor scrolls on", async ({
	browser,
}) => {
	const context = await browser.newContext({
		baseURL: BASE,
		viewport: { width: 390, height: 780 },
	});
	const page = await context.newPage();
	const root = await openPet(page, ARTICLE);
	await page.evaluate(() => window.scrollTo(0, 2400));
	await page.waitForTimeout(450);
	await settled(page);
	const pet = root.locator("[data-pet]");
	await expect(pet).toHaveAttribute("data-dock", "tucked");
	await bringOut(page);
	await expect(pet).toHaveAttribute("data-dock", "out");
	// Out here means over the text (the visitor's choice): this also proves `covered` can see an overlap.
	expect((await covered(page)).length).toBeGreaterThan(0);
	await page.mouse.wheel(0, 300);
	await expect(pet).toHaveAttribute("data-dock", "tucked");
	await settled(page);
	expect(await covered(page)).toEqual([]);
	// Esc and a click elsewhere do the same.
	await bringOut(page);
	await page.keyboard.press("Escape");
	await expect(pet).toHaveAttribute("data-dock", "tucked");
	await bringOut(page);
	await page.mouse.click(120, 300);
	await expect(pet).toHaveAttribute("data-dock", "tucked");
	await context.close();
});

for (const route of ["/", ARTICLE]) {
	test(`AC2.9: Axe is clean on ${route} with the pet out and its panel open`, async ({ page }) => {
		const root = await openPet(page, route);
		// Asleep at rest.
		expect((await new AxeBuilder({ page }).include("#pet-root").analyze()).violations).toEqual([]);
		await engage(page);
		await root.locator("[data-pet-about]").click();
		await expect(root.locator("#pet-panel")).toBeVisible();
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	});
}

test("AC2.9: Axe is clean with the pet at home (the tab)", async ({ page }) => {
	await page.goto("/now/?pet=0");
	await expect(page.locator("[data-pet-door]")).toBeVisible();
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("AC2.9: the pet's controls are big enough and named", async ({ page }) => {
	const root = await openPet(page, "/now/");
	await engage(page);
	await root.locator("[data-pet-about]").click();
	for (const name of ["About Nib", "Send Nib home", "feed", "move to the other side"]) {
		const box = await root.getByRole("button", { name }).boundingBox();
		expect(box?.width, name).toBeGreaterThanOrEqual(24);
		expect(box?.height, name).toBeGreaterThanOrEqual(24);
	}
	await expect(root.getByRole("button", { name: "Nib, your pet. Pat" })).toBeVisible();
	await expect(page.getByRole("complementary", { name: "Site pet" })).toHaveCount(1);
	await expect(root.locator("canvas")).toHaveAttribute("aria-hidden", "true");
});
