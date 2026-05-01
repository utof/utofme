/**
 * @vitest-environment happy-dom
 */
import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { inlineThemeScript, THEME_STORAGE_KEY, wireToggleScript } from "../../src/lib/theme.ts";

describe("inlineThemeScript", () => {
	beforeEach(() => {
		document.documentElement.removeAttribute("data-theme");
		document.documentElement.removeAttribute("data-theme-source");
		localStorage.clear();
	});

	it("falls back to media query when no localStorage value", () => {
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: () => ({ matches: true }), // dark
		});
		new Function(inlineThemeScript())();
		expect(document.documentElement.dataset.theme).toBe("dark");
		expect(document.documentElement.dataset.themeSource).toBe("system");
	});

	it("respects explicit dark localStorage", () => {
		localStorage.setItem(THEME_STORAGE_KEY, "dark");
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: () => ({ matches: false }),
		});
		new Function(inlineThemeScript())();
		expect(document.documentElement.dataset.theme).toBe("dark");
		expect(document.documentElement.dataset.themeSource).toBeUndefined();
	});

	it("respects explicit light localStorage even with dark media query", () => {
		localStorage.setItem(THEME_STORAGE_KEY, "light");
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: () => ({ matches: true }),
		});
		new Function(inlineThemeScript())();
		expect(document.documentElement.dataset.theme).toBe("light");
	});

	it("inline script body is ≤ 800 bytes", () => {
		expect(new TextEncoder().encode(inlineThemeScript()).byteLength).toBeLessThanOrEqual(800);
	});
});

describe("wireToggleScript", () => {
	it("toggle handler body is ≤ 600 bytes", () => {
		expect(new TextEncoder().encode(wireToggleScript()).byteLength).toBeLessThanOrEqual(600);
	});

	it("cycles light → dark → system → light", () => {
		document.documentElement.dataset.theme = "light";
		document.documentElement.removeAttribute("data-theme-source");
		localStorage.clear();
		document.body.innerHTML = `<button data-theme-toggle></button>`;
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: () => ({ matches: false }),
		});
		new Function(wireToggleScript())();
		const btn = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
		if (!btn) throw new Error("toggle button missing");
		btn.click();
		expect(document.documentElement.dataset.theme).toBe("dark");
		expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
		btn.click();
		expect(document.documentElement.dataset.themeSource).toBe("system");
		expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
		btn.click();
		expect(document.documentElement.dataset.theme).toBe("light");
		expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
	});

	it("sets aria-pressed=true on bind when explicit theme stored", () => {
		// Why: locks the #76 fix — SR users see pressed state immediately on page load.
		document.documentElement.dataset.theme = "dark";
		document.documentElement.removeAttribute("data-theme-source");
		document.body.innerHTML = `<button data-theme-toggle></button>`;
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: () => ({ matches: true }),
		});
		new Function(wireToggleScript())();
		const btn = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
		if (!btn) throw new Error("toggle button missing");
		expect(btn.getAttribute("aria-pressed")).toBe("true");
	});

	it("sets aria-pressed=false on bind when system mode", () => {
		// Why: system mode = no explicit user choice = aria-pressed false.
		document.documentElement.dataset.theme = "light";
		document.documentElement.dataset.themeSource = "system";
		document.body.innerHTML = `<button data-theme-toggle></button>`;
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: () => ({ matches: false }),
		});
		new Function(wireToggleScript())();
		const btn = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
		if (!btn) throw new Error("toggle button missing");
		expect(btn.getAttribute("aria-pressed")).toBe("false");
	});

	it("updates aria-pressed after each click (#76)", () => {
		// Why: SR users must hear the state change after each toggle action.
		document.documentElement.dataset.theme = "light";
		document.documentElement.dataset.themeSource = "system";
		document.body.innerHTML = `<button data-theme-toggle></button>`;
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: () => ({ matches: false }),
		});
		new Function(wireToggleScript())();
		const btn = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
		if (!btn) throw new Error("toggle button missing");
		// start: system → aria-pressed=false
		expect(btn.getAttribute("aria-pressed")).toBe("false");
		// click → light (explicit) → aria-pressed=true
		btn.click();
		expect(btn.getAttribute("aria-pressed")).toBe("true");
		// click → dark (explicit) → aria-pressed=true
		btn.click();
		expect(btn.getAttribute("aria-pressed")).toBe("true");
		// click → system → aria-pressed=false
		btn.click();
		expect(btn.getAttribute("aria-pressed")).toBe("false");
	});
});

describe("head ordering (built artefact)", () => {
	// Why: depends on `bun run build` having produced dist/index.html. Skipped
	// when the artefact is absent so the unit tier passes pre-build; CI runs
	// build before test, so the assertion fires in CI.
	const distPath = "dist/index.html";
	const hasDist = existsSync(distPath);
	const maybe = hasDist ? it : it.skip;

	maybe("dist/index.html places theme inline-script after viewport, before <title>", () => {
		const html = readFileSync(distPath, "utf8");
		const iCharset = html.indexOf("<meta charset");
		const iViewport = html.indexOf('name="viewport"');
		const themeScriptIdx = html.search(/<script[^>]*>[\s\S]{0,1200}utofme:theme/);
		const iTitle = html.indexOf("<title");
		expect(iCharset).toBeGreaterThan(-1);
		expect(iViewport).toBeGreaterThan(iCharset);
		expect(themeScriptIdx).toBeGreaterThan(iViewport);
		expect(themeScriptIdx).toBeLessThan(iTitle);
	});
});
