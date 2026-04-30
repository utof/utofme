/**
 * Theme first-paint and toggle scripts. Inlined verbatim — never imported as runtime modules.
 * Why: site-js cap headroom = 13 KB; inline form is the ONLY one that runs before first paint.
 * @see packages/specs/specs/06-indieweb.md § Architecture (Theme persistence)
 * @see packages/specs/plans/06-indieweb.md § Task 9
 */

/**
 * First-paint script — head-injected, runs before any stylesheet load. ≤ 800 B.
 * Why: must execute before CSS to avoid FOUC. Wrapped in IIFE + try/catch to
 * survive Safari private-mode (localStorage throws) without leaving <html>
 * theme-less.
 * @see packages/specs/plans/06-indieweb.md § Task 9
 */
export function inlineThemeScript(): string {
	return `(function(){try{var t=localStorage.getItem("utofme:theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;return;}var d=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.dataset.themeSource="system";}catch(e){try{document.documentElement.dataset.theme=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}catch(e2){}}})();`;
}

/**
 * Toggle button click handler — ≤ 600 B.
 *
 * Idempotent across SPA navigations: the script tag must carry
 * `data-astro-rerun` (Astro docs: ClientRouter re-runs only inline scripts with
 * that attribute). Each rerun re-binds via `onclick=` (overwrites prior binding,
 * no double-fire) instead of `addEventListener` (which would stack handlers).
 * @see https://docs.astro.build/en/guides/view-transitions/#script-behavior-with-view-transitions
 */
export function wireToggleScript(): string {
	return `document.querySelectorAll("[data-theme-toggle]").forEach(function(b){b.onclick=function(){var d=document.documentElement.dataset;var c=d.themeSource==="system"?"system":d.theme;var n=c==="light"?"dark":c==="dark"?"system":"light";if(n==="system"){try{localStorage.removeItem("utofme:theme");}catch(e){}var m=window.matchMedia("(prefers-color-scheme: dark)").matches;d.theme=m?"dark":"light";d.themeSource="system";}else{try{localStorage.setItem("utofme:theme",n);}catch(e){}d.theme=n;delete d.themeSource;}};});`;
}
