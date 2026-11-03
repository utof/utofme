// Why: e2e for the datamosh hover and its `/lab/datamosh/` playground (ADR 0041).
// The config's only project is Pixel 5 (touch, `(pointer: coarse)`), where the effect
// is correctly OFF, so the hover tests switch to a desktop-style context
// (`isMobile: false`, `hasTouch: false`) which reports `(pointer: fine)`.
// AxeBuilder import shape: https://playwright.dev/docs/accessibility-testing
// `fill` on `<input type=range>`: https://playwright.dev/docs/api/class-locator#locator-fill
// @see packages/specs/adrs/0041-datamosh-cpu-canvas-hover.md
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { MOSH_PARAMS } from "../../src/lib/datamosh/config";

const desktop = {
	viewport: { width: 1280, height: 900 },
	isMobile: false,
	hasTouch: false,
	deviceScaleFactor: 1,
} as const;

test.describe("/lab/datamosh/", () => {
	test.use(desktop);

	test("renders one control per MOSH_PARAMS entry and passes Axe", async ({ page }) => {
		const response = await page.goto("/lab/datamosh/");
		expect(response?.status()).toBe(200);
		const controls = page.locator('[data-test="mosh-control"]');
		await expect(controls).toHaveCount(MOSH_PARAMS.length);
		for (const param of MOSH_PARAMS) {
			const control = page.locator(`#mosh-${param.key}`);
			await expect(control).toBeVisible();
			// A real <label for> names every control.
			await expect(page.locator(`label[for="mosh-${param.key}"]`)).toHaveText(param.label);
		}
		await expect(page.locator('[data-test="mosh-lab-grid"] li')).not.toHaveCount(0);
		const results = await new AxeBuilder({ page }).analyze();
		expect(results.violations).toEqual([]);
	});

	test("is noindexed", async ({ page }) => {
		await page.goto("/lab/datamosh/");
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
	});

	test("changing a slider mirrors the value into the URL m-* params", async ({ page }) => {
		await page.goto("/lab/datamosh/");
		const block = page.locator("#mosh-block");
		await expect(block).toBeVisible();
		await block.fill("8");
		await expect(page).toHaveURL(/[?&]m-block=8(&|$)/);
		// Putting a value back to its default drops the param again.
		await block.fill("16");
		await expect(page).not.toHaveURL(/m-block=/);
	});

	test("initial control values come from the URL", async ({ page }) => {
		await page.goto("/lab/datamosh/?m-block=24&m-seed=self");
		await expect(page.locator("#mosh-block")).toHaveValue("24");
		await expect(page.locator("#mosh-seed")).toHaveValue("self");
	});
});

test.describe("hover datamosh on /?mosh", () => {
	test.use(desktop);

	test("moving the pointer over a card shows a 2d canvas inside that card's li", async ({
		page,
	}) => {
		await page.goto("/?mosh");
		const item = page.locator('[data-test="works-grid"] > li').first();
		const img = item.locator("img").first();
		await img.scrollIntoViewIfNeeded();
		await expect(img).toHaveJSProperty("complete", true);
		const box = await img.boundingBox();
		if (!box) throw new Error("card image has no box");
		const canvas = item.locator('canvas[data-mosh-backend="2d"]');
		await expect(async () => {
			await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
			await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 8 });
			await expect(canvas).toBeVisible({ timeout: 1000 });
		}).toPass({ timeout: 15_000 });
		await expect(canvas).toHaveAttribute("aria-hidden", "true");
		await expect(canvas).toHaveCSS("pointer-events", "none");
		await expect(page.locator('canvas[data-mosh-backend="2d"]')).toHaveCount(1);
	});

	test("the dither is not armed when mosh is on", async ({ page }) => {
		await page.goto("/?mosh&dither");
		const img = page.locator('[data-test="works-grid"] img').first();
		await img.scrollIntoViewIfNeeded();
		await expect(img).toHaveJSProperty("complete", true);
		const box = await img.boundingBox();
		if (!box) throw new Error("card image has no box");
		await expect(async () => {
			await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
			await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 8 });
			await expect(page.locator('canvas[data-mosh-backend="2d"]')).toBeVisible({ timeout: 1000 });
		}).toPass({ timeout: 15_000 });
		await expect(page.locator("canvas[data-dither-backend]")).toHaveCount(0);
	});

	test("mounts nothing without the mosh flag", async ({ page }) => {
		await page.goto("/");
		const img = page.locator('[data-test="works-grid"] img').first();
		await img.scrollIntoViewIfNeeded();
		const box = await img.boundingBox();
		if (!box) throw new Error("card image has no box");
		await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
		await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 8 });
		await expect(page.locator("canvas[data-mosh-backend]")).toHaveCount(0);
	});
});

test.describe("hover datamosh on a coarse-pointer device", () => {
	// Default project context: Pixel 5, `(pointer: coarse)`, touch. The gate must keep the effect off.
	test("stays off even with the flag on", async ({ page }) => {
		await page.goto("/?mosh");
		const img = page.locator('[data-test="works-grid"] img').first();
		await img.scrollIntoViewIfNeeded();
		await expect(img).toHaveJSProperty("complete", true);
		expect(await page.evaluate(() => window.matchMedia("(pointer: fine)").matches)).toBe(false);
		const box = await img.boundingBox();
		if (!box) throw new Error("card image has no box");
		await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
		await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 8 });
		await page.waitForTimeout(500);
		await expect(page.locator("canvas[data-mosh-backend]")).not.toBeVisible();
	});
});
