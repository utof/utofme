/**
 * Theme first-paint and toggle scripts. Inlined verbatim — never imported as runtime modules.
 * Why: site-js cap headroom = 13 KB; inline form is the ONLY one that runs before first paint.
 * @see packages/specs/specs/06-indieweb.md § Architecture (Theme persistence)
 * @see packages/specs/plans/06-indieweb.md § Task 9
 */

/**
 * localStorage key used for theme persistence.
 * Why: single source of truth shared by inlineThemeScript, wireToggleScript,
 * and test assertions — prevents silent drift if the key is ever renamed.
 * @see https://github.com/utof/utofme/issues/75
 */
export const THEME_STORAGE_KEY = "utofme:theme";

/**
 * First-paint script — head-injected, runs before any stylesheet load. ≤ 800 B.
 * Why: must execute before CSS to avoid FOUC. Wrapped in IIFE + try/catch to
 * survive Safari private-mode (localStorage throws) without leaving <html>
 * theme-less.
 * @see packages/specs/plans/06-indieweb.md § Task 9
 */
export function inlineThemeScript(): string {
	// Why: ToD logic is inlined here (duplicates src/lib/time-of-day.ts) because
	// <script is:inline> cannot import from source modules at runtime. The unit
	// tests in tests/unit/time-of-day.test.ts guard the canonical form; keep
	// both in sync if the hour ranges change.
	// @see packages/specs/plans/07-atmosphere.md § T3 Implementation outline
	// @see packages/specs/adrs/0038-time-of-day-inline-script.md
	return `(function(){try{var t=localStorage.getItem("utofme:theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}else{var d=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.dataset.themeSource="system";}}catch(e){try{document.documentElement.dataset.theme=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}catch(e2){}}try{var h=new Date().getHours();document.documentElement.dataset.tod=h<5?"night":h<8?"dawn":h<17?"day":h<20?"dusk":"night";}catch(e3){}})();`;
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
	// Why: aria-pressed reflects whether an explicit theme is stored:
	//   false = system (no user choice), true = light or dark persisted.
	// Set on bind (initial state) and after each click (state change) so SR
	// users receive state feedback without aria-live announcements on a button.
	// ''+(bool) coerces to the 'true'/'false' strings required by ARIA spec.
	// D is captured once per forEach; data-astro-rerun re-runs the script on
	// each SPA navigation, re-capturing a fresh reference.
	// See: https://github.com/utof/utofme/issues/76
	return `document.querySelectorAll('[data-theme-toggle]').forEach(function(b){var A='aria-pressed',K='utofme:theme',D=document.documentElement.dataset;b.setAttribute(A,''+(D.themeSource!='system'));b.onclick=function(){var c=D.themeSource=='system'?'system':D.theme,n=c=='light'?'dark':c=='dark'?'system':'light';if(n=='system'){try{localStorage.removeItem(K);}catch(e){}D.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';D.themeSource='system';}else{try{localStorage.setItem(K,n);}catch(e){}D.theme=n;delete D.themeSource;}b.setAttribute(A,''+(n!='system'));};});`;
}
