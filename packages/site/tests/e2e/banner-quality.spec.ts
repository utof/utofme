/**
 * Project banner quality (D-02), short-viewport cap (M-05) and morph overlap (M-14), e2e.
 *
 * Why: the card → banner morph persists the card <video> (at most 1024 px); without the swap the
 * banner plays an upscaled card loop while a direct load plays the 1920 px rendition.
 *
 * @see packages/specs/reports/ui-fix-banner.md
 */
import { expect, test } from "@playwright/test";

const SLUG = "tactical-arena";

const bannerVideos = (page: import("@playwright/test").Page) =>
	page.evaluate(() =>
		[...document.querySelectorAll<HTMLVideoElement>(".banner video[data-loop]")].map((v) => ({
			size: v.dataset.loopSize,
			src: v.currentSrc.split("/").pop() ?? "",
			width: v.videoWidth,
			ready: v.hasAttribute("data-ready"),
		})),
	);

// Why both: eeg-ads1299-lab is framed like its banner, so its persisted card node is swapped for the banner
// rendition; tactical-arena has its own framing, so its banner mounts its own video (no persisted node).
for (const slug of ["eeg-ads1299-lab", SLUG]) {
	test(`after a card → banner morph the banner plays the 1920 px rendition (${slug})`, async ({
		page,
	}) => {
		await page.goto("/");
		await page.locator(`a.card[href="/works/${slug}/"]`).click();
		await page.waitForURL(`**/works/${slug}/`);
		await expect
			.poll(async () => (await bannerVideos(page))[0]?.src ?? "", { timeout: 8000 })
			.toMatch(/^banner\./);
		await expect
			.poll(async () => (await bannerVideos(page))[0]?.width ?? 0, { timeout: 8000 })
			.toBe(1920);
		// The card rendition is gone and the banner video is visible (no poster-only state).
		await expect.poll(async () => (await bannerVideos(page)).length, { timeout: 8000 }).toBe(1);
		await expect
			.poll(async () => (await bannerVideos(page))[0]?.ready, { timeout: 8000 })
			.toBe(true);
	});
}

test("Back to the grid leaves the card on the card rendition", async ({ page }) => {
	await page.goto("/");
	await page.locator(`a.card[href="/works/${SLUG}/"]`).click();
	await page.waitForURL(`**/works/${SLUG}/`);
	await expect
		.poll(async () => (await bannerVideos(page))[0]?.src ?? "", { timeout: 8000 })
		.toMatch(/^banner\./);
	await page.goBack();
	await page.waitForURL("**/");
	await expect
		.poll(
			() =>
				page.evaluate((slug) => {
					const v = document.querySelector<HTMLVideoElement>(
						`a.card[href="/works/${slug}/"] video[data-loop]`,
					);
					return v?.dataset.loopSize ?? "none";
				}, SLUG),
			{ timeout: 8000 },
		)
		.toBe("card");
	const src = await page.evaluate(
		(slug) =>
			document
				.querySelector<HTMLVideoElement>(`a.card[href="/works/${slug}/"] video[data-loop]`)
				?.querySelector("source")
				?.getAttribute("src") ?? "",
		SLUG,
	);
	expect(src).toContain("/card.");
});

test("Pause motion: the morph ends on the sharp banner poster, no card video left", async ({
	page,
}) => {
	await page.addInitScript(() => localStorage.setItem("utofme:motion", "paused"));
	await page.goto("/");
	await page.locator(`a.card[href="/works/${SLUG}/"]`).click();
	await page.waitForURL(`**/works/${SLUG}/`);
	await expect.poll(async () => (await bannerVideos(page))[0]?.size).toBe("banner");
	expect((await bannerVideos(page)).every((v) => !v.ready)).toBe(true);
});

test.describe("landscape phone", () => {
	test.use({ viewport: { width: 852, height: 393 } });
	test("banner is capped so the title shows in the first screen (M-05)", async ({ page }) => {
		await page.goto(`/works/${SLUG}/`);
		const banner = await page.locator(".banner").boundingBox();
		const h1 = await page.locator("h1").boundingBox();
		if (!banner || !h1) throw new Error("no banner/h1");
		expect(banner.height).toBeLessThanOrEqual(393 * 0.4);
		expect(h1.y + h1.height).toBeLessThan(393);
	});
});
