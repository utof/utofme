import type { Browser, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Helpers for the site-pet specs.
 *
 * Why `?pet=1`: automated browsers get no pet by default (spec 11, rule 10), so
 * every pet spec asks for it explicitly.
 *
 * @see packages/specs/specs/11-pet.md § "Deliverables and acceptance" (P11-2)
 */
declare global {
	interface Window {
		/** Nodes ever added to the flying-letters layer (set by a spec). */
		__petAdded?: number;
		/** The pet's canvas before a navigation (set by a spec). */
		__petCanvas?: Element | null;
	}
}

export const BASE = "http://127.0.0.1:4321";
export const ARTICLE = "/works/tactical-arena/";

/** Opens `route` with the pet switched on and waits until its state has loaded. */
export async function openPet(page: Page, route: string): Promise<Locator> {
	await page.goto(`${route}?pet=1`);
	const root = page.locator("#pet-root");
	await expect(root).toHaveAttribute("data-ready", /.+/, { timeout: 15_000 });
	return root;
}

/** A fresh desktop page (the project default is a phone). */
export async function desktopPage(browser: Browser, width = 1360, height = 800): Promise<Page> {
	const context = await browser.newContext({ baseURL: BASE, viewport: { width, height } });
	return context.newPage();
}

/** Waits until the pet has stopped moving (its stepped slide is over). */
export async function settled(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
	const read = () =>
		page.locator("#pet-root .pet-btn").evaluate((el) => {
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, w: r.width, h: r.height };
		});
	// Why a fixed wait between reads: the slide moves in 60 ms steps, so two equal reads 130 ms apart mean it stopped.
	let last = await read();
	for (let i = 0; i < 40; i++) {
		await page.waitForTimeout(130);
		const now = await read();
		if (now.x === last.x && now.y === last.y) return now;
		last = now;
	}
	throw new Error("the pet never came to rest");
}

/** Brings a tucked pet out by clicking its sliver (the visitor's "come here"); returns its box. */
export async function bringOut(
	page: Page,
): Promise<{ x: number; y: number; w: number; h: number }> {
	const pet = page.locator("#pet-root [data-pet]");
	const box = await settled(page);
	if ((await pet.getAttribute("data-dock")) !== "out") {
		const width = page.viewportSize()?.width ?? 0;
		const x = box.x < 0 ? 4 : Math.min(width - 4, box.x + 4);
		await page.mouse.click(x, box.y + box.h * 0.8);
		await expect(pet).toHaveAttribute("data-dock", "out");
	}
	return settled(page);
}

/** Brings the pet out and pokes its body, as a visitor would before using its controls; returns its box. */
export async function engage(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
	const box = await bringOut(page);
	await page.mouse.click(box.x + box.w / 2, box.y + box.h * 0.85);
	await expect(page.locator("#pet-root [data-pet-about]")).toBeVisible();
	return box;
}

/** The number in one of the root's `data-*` counters. */
export async function counter(root: Locator, name: "pats" | "letters"): Promise<number> {
	return Number(await root.getAttribute(`data-${name}`));
}

/** Selects the first `length` characters of the first text node with letters under `selector`. */
export async function selectText(page: Page, selector: string, length: number): Promise<string> {
	return page.evaluate(
		([sel, len]) => {
			const host = document.querySelector(String(sel));
			if (!host) throw new Error(`no ${sel}`);
			const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const text = node.textContent ?? "";
				const start = text.search(/\p{L}/u);
				if (start < 0) continue;
				const range = document.createRange();
				range.setStart(node, start);
				range.setEnd(node, Math.min(text.length, start + Number(len)));
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
				return selection?.toString() ?? "";
			}
			throw new Error(`no text under ${sel}`);
		},
		[selector, length],
	);
}
