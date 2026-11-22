/**
 * The site pet: appears asleep, pat, feed, send home, flags, keyboard, persistence.
 *
 * @see packages/specs/specs/11-pet.md § "Deliverables and acceptance" (P11-2: AC2.2 – AC2.8, AC2.11 – AC2.13)
 * @see packages/specs/adrs/0062-site-pet-design-rules.md
 */
import { expect, test } from "@playwright/test";
import {
	ARTICLE,
	bringOut,
	counter,
	desktopPage,
	engage,
	openPet,
	selectText,
	settled,
} from "./pet-support";

test("AC2.12: an automated browser gets no pet and no tab unless it asks", async ({ page }) => {
	const requests: string[] = [];
	page.on("request", (r) => requests.push(r.url()));
	await page.goto("/");
	await page.waitForLoadState("networkidle");
	await expect(page.locator("#pet-root")).toBeHidden();
	await expect(page.locator("#pet-root canvas")).toHaveCount(0);
	expect(requests.filter((u) => /\/_astro\/start\./.test(u))).toEqual([]);
});

test("AC2.12: a visitor (not automated) gets the pet by default, asleep", async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
	});
	await page.goto("/");
	const root = page.locator("#pet-root");
	await expect(root).toHaveAttribute("data-ready", "empty", { timeout: 15_000 });
	await expect(root).toHaveAttribute("data-mood", "asleep");
	await expect(root.locator("canvas")).toHaveCount(1);
	// Nothing is stored before the first touch.
	expect(
		await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("pet"))),
	).toEqual([]);
});

for (const route of ["/", ARTICLE]) {
	test(`AC2.2: the pet appears asleep on ${route} and asks for no animation frame`, async ({
		page,
	}) => {
		const root = await openPet(page, route);
		await expect(root).toHaveAttribute("data-mood", "asleep");
		await expect(root.locator("canvas")).toBeVisible();
		await expect(root.locator("[data-pet-door]")).toBeHidden();
		// The sleeping figure is drawn (not a blank canvas).
		const painted = await root.locator("canvas").evaluate((canvas) => {
			if (!(canvas instanceof HTMLCanvasElement)) return 0;
			const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
			let n = 0;
			for (let i = 3; data && i < data.length; i += 4) if ((data[i] ?? 0) > 0) n++;
			return n;
		});
		expect(painted).toBeGreaterThan(200);
		// Asleep means still: the canvas does not change.
		const frame = () =>
			root.locator("canvas").evaluate((c) => (c instanceof HTMLCanvasElement ? c.toDataURL() : ""));
		const before = await frame();
		await page.waitForTimeout(700);
		expect(await frame()).toBe(before);
	});
}

test("AC2.3: a press on the head pats it; a click on the body does not", async ({ browser }) => {
	const page = await desktopPage(browser);
	const root = await openPet(page, ARTICLE);
	const box = await bringOut(page);
	const before = await counter(root, "pats");
	await page.mouse.click(box.x + box.w / 2, box.y + box.h * 0.85);
	expect(await counter(root, "pats")).toBe(before);
	await expect(root).not.toHaveAttribute("data-mood", "asleep");
	await page.mouse.move(box.x + box.w / 2, box.y + box.h * 0.2);
	await page.mouse.down();
	await expect(root).toHaveAttribute("data-mood", "patted");
	expect(await counter(root, "pats")).toBe(before + 1);
	// Stroking: 54 px of travel is three more pats.
	await page.mouse.move(box.x + box.w / 2 + 27, box.y + box.h * 0.2, { steps: 3 });
	await page.mouse.move(box.x + box.w / 2, box.y + box.h * 0.2, { steps: 3 });
	await page.mouse.up();
	expect(await counter(root, "pats")).toBe(before + 4);
	await page.context().close();
});

test("AC2.3: on a phone a tap brings it out and a tap on the head pats it", async ({ page }) => {
	const root = await openPet(page, "/");
	const pet = root.locator("[data-pet]");
	await expect(pet).toHaveAttribute("data-dock", "tucked");
	const sliver = await settled(page);
	const width = page.viewportSize()?.width ?? 0;
	await page.touchscreen.tap(width - 4, sliver.y + sliver.h * 0.7);
	await expect(pet).toHaveAttribute("data-dock", "out");
	expect(await counter(root, "pats")).toBe(0);
	const box = await settled(page);
	await page.touchscreen.tap(box.x + box.w / 2, box.y + box.h * 0.2);
	expect(await counter(root, "pats")).toBe(1);
	// Scrolling the page sends it back to the edge at once.
	await page.mouse.wheel(0, 400);
	await expect(pet).toHaveAttribute("data-dock", "tucked");
});

test("AC2.4: feeding eats copies; the page's text, markup and selection are untouched", async ({
	browser,
}) => {
	const page = await desktopPage(browser);
	const root = await openPet(page, ARTICLE);
	const box = await bringOut(page);
	const snapshot = () =>
		page.evaluate(() => {
			const main = document.querySelector("main");
			return { text: main?.textContent ?? "", html: main?.innerHTML ?? "" };
		});
	const before = await snapshot();
	const picked = await selectText(page, ".article-body p", 11);
	const letters = [...picked].filter((ch) => /\p{L}/u.test(ch)).length;
	expect(letters).toBeGreaterThan(3);
	await page.mouse.click(box.x + box.w / 2, box.y + box.h * 0.8);
	expect(await counter(root, "letters")).toBe(Math.min(8, letters));
	expect(await counter(root, "pats")).toBe(0);
	await expect(root).toHaveAttribute("data-mood", "eating");
	// Copies fly inside the pet's own hidden-from-AT layer, and are gone when the bite is over.
	const flying = root.locator(".pet-fx span");
	expect(await flying.count()).toBe(Math.min(8, letters));
	await expect(root.locator(".pet-fx")).toHaveAttribute("aria-hidden", "true");
	// Each copy starts exactly on its own letter, and one that has not left yet is invisible,
	// so the paragraph is never drawn over.
	const starts = await page.evaluate(() => {
		const range = window.getSelection()?.getRangeAt(0);
		const first = range?.getClientRects()[0];
		const spans = [...document.querySelectorAll<HTMLElement>("#pet-root .pet-fx span")];
		const last = spans[spans.length - 1];
		return {
			dx: Math.abs(Number.parseFloat(spans[0]?.style.left ?? "0") - (first?.left ?? -99)),
			dy: Math.abs(Number.parseFloat(spans[0]?.style.top ?? "0") - (first?.top ?? -99)),
			lastOpacity: last ? getComputedStyle(last).opacity : "",
			font: spans[0]?.style.fontFamily === "" ? "" : "set",
		};
	});
	expect(starts.dx).toBeLessThanOrEqual(1);
	expect(starts.dy).toBeLessThanOrEqual(1);
	expect(starts.lastOpacity).toBe("0");
	expect(starts.font).toBe("set");
	expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(picked);
	await expect(flying).toHaveCount(0, { timeout: 8000 });
	expect(await snapshot()).toEqual(before);
	expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(picked);
	await expect(root.locator("[role=status]")).toContainText("ate");
	await page.context().close();
});

test("AC2.4: a full belly refuses, and nothing is counted", async ({ browser }) => {
	const page = await desktopPage(browser);
	const root = await openPet(page, ARTICLE);
	const box = await bringOut(page);
	await selectText(page, ".article-body p", 40);
	for (let bite = 0; bite < 3; bite++) {
		await page.mouse.click(box.x + box.w / 2, box.y + box.h * 0.8);
	}
	expect(await counter(root, "letters")).toBe(24);
	await page.mouse.click(box.x + box.w / 2, box.y + box.h * 0.8);
	expect(await counter(root, "letters")).toBe(24);
	await expect(root.locator("[role=status]")).toContainText("is full");
	await page.context().close();
});

test("AC2.5: send home, reload: still at home; the tab calls it back", async ({ browser }) => {
	const page = await desktopPage(browser);
	const root = await openPet(page, ARTICLE);
	await engage(page);
	await root.locator("[data-pet-home]").click();
	const door = root.locator("[data-pet-door]");
	await expect(door).toBeVisible();
	await expect(root.locator("canvas")).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem("utofme:pet"))).toBe("0");

	const requests: string[] = [];
	page.on("request", (r) => requests.push(r.url()));
	await page.goto(ARTICLE);
	await page.waitForLoadState("networkidle");
	await expect(door).toBeVisible();
	await expect(root.locator("canvas")).toHaveCount(0);
	expect(requests.filter((u) => /\/_astro\/start\./.test(u))).toEqual([]);
	// The static tab's button clears the overlay scrollbar and has a usable hit area.
	const size = await door.boundingBox();
	expect(size?.width).toBeGreaterThanOrEqual(24);
	expect(size?.height).toBeGreaterThanOrEqual(44);
	const scrollbarClearance = await door.evaluate(
		(el) => document.documentElement.clientWidth - el.getBoundingClientRect().right,
	);
	expect(scrollbarClearance).toBeGreaterThanOrEqual(16);

	await door.click();
	await expect(root).toHaveAttribute("data-ready", /.+/);
	await expect(root.locator("canvas")).toHaveCount(1);
	await expect(door).toBeHidden();
	await expect(root.locator(".pet-btn")).toBeFocused();
	expect(await page.evaluate(() => localStorage.getItem("utofme:pet"))).toBe("1");
	await page.context().close();
});

test("AC2.6: ?pet=0 sends it home, persists, and loads no pet code", async ({ page }) => {
	const requests: string[] = [];
	page.on("request", (r) => requests.push(r.url()));
	await page.goto("/?pet=0");
	await page.waitForLoadState("networkidle");
	await expect(page.locator("[data-pet-door]")).toBeVisible();
	await expect(page.locator("#pet-root canvas")).toHaveCount(0);
	await page.goto("/now/");
	await page.waitForLoadState("networkidle");
	await expect(page.locator("[data-pet-door]")).toBeVisible();
	expect(requests.filter((u) => /\/_astro\/start\./.test(u))).toEqual([]);
	// …and ?pet=1 brings it back for good.
	await page.goto("/now/?pet=1");
	await expect(page.locator("#pet-root")).toHaveAttribute("data-ready", /.+/, { timeout: 15_000 });
	await page.goto("/now/");
	await expect(page.locator("#pet-root canvas")).toHaveCount(1);
});

test("AC2.7: with reduced motion it still responds, and nothing ever flies or slides", async ({
	browser,
}) => {
	const context = await browser.newContext({
		baseURL: "http://127.0.0.1:4321",
		viewport: { width: 1360, height: 800 },
		reducedMotion: "reduce",
	});
	const page = await context.newPage();
	const root = await openPet(page, ARTICLE);
	const box = await bringOut(page);
	await expect(root.locator("[data-pet]")).not.toHaveClass(/is-stepping/);
	// Count every node ever added to the letters layer.
	await page.evaluate(() => {
		window.__petAdded = 0;
		const layer = document.querySelector("#pet-root .pet-fx");
		if (layer) {
			new MutationObserver((records) => {
				for (const r of records) window.__petAdded = (window.__petAdded ?? 0) + r.addedNodes.length;
			}).observe(layer, { childList: true });
		}
	});
	await page.mouse.move(box.x + box.w / 2, box.y + box.h * 0.2);
	await page.mouse.down();
	await expect(root).toHaveAttribute("data-mood", "patted");
	await page.mouse.up();
	expect(await counter(root, "pats")).toBe(1);
	// The pose goes back by itself (one timer, no frame loop).
	await expect(root).toHaveAttribute("data-mood", "happy");
	await selectText(page, ".article-body p", 8);
	await page.mouse.click(box.x + box.w / 2, box.y + box.h * 0.8);
	expect(await counter(root, "letters")).toBeGreaterThan(0);
	await expect(root).toHaveAttribute("data-mood", "eating");
	await expect(root).toHaveAttribute("data-mood", "happy", { timeout: 6000 });
	expect(await page.evaluate(() => window.__petAdded)).toBe(0);
	await context.close();
});

test("AC2.8: the whole pet works from the keyboard", async ({ browser }) => {
	const page = await desktopPage(browser);
	const root = await openPet(page, ARTICLE);
	// The pet is the last tab stop of the page.
	const lastFocusable = await page.evaluate(() => {
		const all = [
			...document.querySelectorAll<HTMLElement>(
				"a[href],button,input,select,textarea,summary,[tabindex]",
			),
		].filter((el) => el.tabIndex >= 0 && el.offsetParent !== null && !el.closest("[hidden]"));
		return all[all.length - 1]?.closest("#pet-root") !== null;
	});
	expect(lastFocusable).toBe(true);

	await root.locator(".pet-btn").focus();
	await expect(root.locator("[data-pet]")).toHaveAttribute("data-dock", "out");
	await page.keyboard.press("Enter");
	expect(await counter(root, "pats")).toBe(1);
	await expect(root).toHaveAttribute("data-mood", "patted");
	await page.keyboard.press("Space");
	expect(await counter(root, "pats")).toBe(2);

	await page.keyboard.press("Tab");
	const about = root.locator("[data-pet-about]");
	await expect(about).toBeFocused();
	await expect(about).toHaveAccessibleName("About Nib");
	await page.keyboard.press("Enter");
	await expect(about).toHaveAttribute("aria-expanded", "true");
	const panel = root.locator("#pet-panel");
	await expect(panel).toBeVisible();
	await expect(panel).toContainText("Alphabet 0 of 26");

	// Rename.
	await page.keyboard.press("Tab");
	await expect(root.locator("[data-pet-home]")).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(panel.getByLabel("Name")).toBeFocused();
	await page.keyboard.press("ControlOrMeta+A");
	await page.keyboard.type("Zorp");
	await page.keyboard.press("Tab");
	await expect(root.locator(".pet-btn")).toHaveAccessibleName("Zorp, your pet. Pat");

	// Feed without a selection: one letter of the page title.
	await expect(root.locator("[data-pet-feed]")).toBeFocused();
	await page.keyboard.press("Enter");
	expect(await counter(root, "letters")).toBe(1);
	await expect(panel).toContainText("Alphabet 1 of 26");
	await expect(root.locator("[role=status]")).toContainText("Zorp ate S.");

	// Move to the other side and back.
	await page.keyboard.press("Tab");
	await expect(root.locator("[data-pet-move]")).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(root.locator("[data-pet]")).toHaveAttribute("data-side", "left");

	// Esc closes the panel and returns focus to its button; nothing was trapped.
	await page.keyboard.press("Escape");
	await expect(panel).toBeHidden();
	await expect(about).toBeFocused();

	// Send home: focus lands on the tab, which brings it back.
	await page.keyboard.press("Tab");
	await page.keyboard.press("Enter");
	const door = root.locator("[data-pet-door]");
	await expect(door).toBeFocused();
	await expect(door).toHaveAccessibleName("Call the pet back");
	await page.keyboard.press("Enter");
	await expect(root.locator(".pet-btn")).toBeFocused();
	await expect(root.locator(".pet-btn")).toHaveAccessibleName("Zorp, your pet. Pat");
	await page.context().close();
});

test("AC2.11: state survives a reload, encrypted; a tampered blob is a clean reset", async ({
	browser,
}) => {
	const page = await desktopPage(browser);
	let root = await openPet(page, ARTICLE);
	await expect(root).toHaveAttribute("data-ready", "empty");
	await engage(page);
	await root.locator("[data-pet-about]").click();
	await root.getByLabel("Name").fill("Zorp");
	await root.getByLabel("Name").press("Enter");
	await root.locator(".pet-btn").focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("Enter");
	expect(await counter(root, "pats")).toBe(2);
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem("utofme:pet:state")))
		.toMatch(/^p1\./);
	// Let the debounced save of the last pat land.
	await page.waitForTimeout(600);

	const blob = (await page.evaluate(() => localStorage.getItem("utofme:pet:state"))) ?? "";
	expect(blob).not.toContain("Zorp");
	expect(Buffer.from(blob.slice(3), "base64").toString("latin1")).not.toContain("Zorp");
	expect(Buffer.from(blob.slice(3), "base64").toString("latin1")).not.toContain("pats");
	// The key is a non-extractable CryptoKey in IndexedDB.
	const key = await page.evaluate(
		() =>
			new Promise<{ type: string; extractable: boolean; algorithm: string } | null>((resolve) => {
				const open = indexedDB.open("utofme-pet", 1);
				open.onsuccess = () => {
					const get: IDBRequest<unknown> = open.result
						.transaction("keys")
						.objectStore("keys")
						.get("k1");
					get.onsuccess = () => {
						const k = get.result;
						resolve(
							k instanceof CryptoKey
								? { type: k.type, extractable: k.extractable, algorithm: k.algorithm.name }
								: null,
						);
					};
				};
			}),
	);
	expect(key).toEqual({ type: "secret", extractable: false, algorithm: "AES-GCM" });

	root = await openPet(page, ARTICLE);
	await expect(root).toHaveAttribute("data-ready", "ok");
	expect(await counter(root, "pats")).toBe(2);
	await expect(root.locator(".pet-btn")).toHaveAccessibleName("Zorp, your pet. Pat");
	// A returning pet is asleep too.
	await expect(root).toHaveAttribute("data-mood", "asleep");

	// Tamper: flip one character of the ciphertext.
	await page.evaluate(() => {
		const value = localStorage.getItem("utofme:pet:state") ?? "";
		const i = 30;
		const swapped = value.charAt(i) === "A" ? "B" : "A";
		localStorage.setItem("utofme:pet:state", value.slice(0, i) + swapped + value.slice(i + 1));
	});
	root = await openPet(page, ARTICLE);
	await expect(root).toHaveAttribute("data-ready", "reset");
	expect(await counter(root, "pats")).toBe(0);
	await expect(root.locator(".pet-btn")).toHaveAccessibleName("Nib, your pet. Pat");
	expect(await page.evaluate(() => localStorage.getItem("utofme:pet:state"))).toBeNull();
	await page.context().close();
});

test("AC2.11: two tabs share the pet", async ({ browser }) => {
	const context = await browser.newContext({
		baseURL: "http://127.0.0.1:4321",
		viewport: { width: 1360, height: 800 },
	});
	const a = await context.newPage();
	const b = await context.newPage();
	const rootA = await openPet(a, ARTICLE);
	const rootB = await openPet(b, "/now/");
	await rootA.locator(".pet-btn").focus();
	await a.keyboard.press("Enter");
	await a.keyboard.press("Enter");
	await a.keyboard.press("Enter");
	await expect(rootB).toHaveAttribute("data-pats", "3", { timeout: 5000 });
	await rootB.locator(".pet-btn").focus();
	await b.keyboard.press("Enter");
	await expect(rootA).toHaveAttribute("data-pats", "4", { timeout: 5000 });
	await context.close();
});

test("AC2.13: the pet survives a ClientRouter navigation: same node, same state", async ({
	browser,
}) => {
	const page = await desktopPage(browser);
	const root = await openPet(page, "/now/");
	await root.locator(".pet-btn").focus();
	await page.keyboard.press("Enter");
	expect(await counter(root, "pats")).toBe(1);
	await page.evaluate(() => {
		window.__petCanvas = document.querySelector("#pet-root canvas");
	});
	await page.locator('header a[href="/"]').first().click();
	await page.waitForURL((url) => url.pathname === "/");
	// The window (and what was stored on it) is the same: no full reload happened.
	expect(
		await page.evaluate(
			() =>
				window.__petCanvas instanceof HTMLCanvasElement &&
				window.__petCanvas === document.querySelector("#pet-root canvas"),
		),
	).toBe(true);
	expect(await counter(root, "pats")).toBe(1);
	await expect(root.locator("canvas")).toHaveCount(1);
	// A link with ?pet=0 sends it home without a reload.
	await page.evaluate(() => {
		const link = document.createElement("a");
		link.href = "/now/?pet=0";
		link.textContent = "now";
		link.id = "pet-off-link";
		document.querySelector("main")?.prepend(link);
	});
	await page.locator("#pet-off-link").click();
	await page.waitForURL(/\/now\/\?pet=0/);
	await expect(root.locator("[data-pet-door]")).toBeVisible();
	await expect(root.locator("canvas")).toHaveCount(0);
	await page.context().close();
});

test("print: the pet is not printed", async ({ page }) => {
	const root = await openPet(page, "/now/");
	await expect(root.locator("canvas")).toBeVisible();
	await page.emulateMedia({ media: "print" });
	await expect(root).toBeHidden();
});
