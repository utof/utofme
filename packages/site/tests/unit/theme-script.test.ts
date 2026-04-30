/**
 * @vitest-environment happy-dom
 */
import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { inlineThemeScript, wireToggleScript } from "../../src/lib/theme.ts";

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
		localStorage.setItem("utofme:theme", "dark");
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: () => ({ matches: false }),
		});
		new Function(inlineThemeScript())();
		expect(document.documentElement.dataset.theme).toBe("dark");
		expect(document.documentElement.dataset.themeSource).toBeUndefined();
	});

	it("respects explicit light localStorage even with dark media query", () => {
		localStorage.setItem("utofme:theme", "light");
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
		expect(localStorage.getItem("utofme:theme")).toBe("dark");
		btn.click();
		expect(document.documentElement.dataset.themeSource).toBe("system");
		expect(localStorage.getItem("utofme:theme")).toBeNull();
		btn.click();
		expect(document.documentElement.dataset.theme).toBe("light");
		expect(localStorage.getItem("utofme:theme")).toBe("light");
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
