/**
 * The pet's loader: the only pet code every visitor downloads.
 *
 * Why: it reads the home/out switch and, only when the pet is out, imports the
 * pet module when the browser is idle. A pet at home leaves a small static tab
 * that calls it back. Automated browsers get nothing unless they ask.
 *
 * @see packages/specs/specs/11-pet.md § "Loading and budgets"
 * @see packages/specs/adrs/0062-site-pet-design-rules.md
 */
import { browserStorage, resolveSwitch, type SwitchState, writeSwitch } from "../../lib/flags";

/**
 * Whether the pet should be out, given the visitor's choice and whether the browser is automated.
 *
 * Why: out by default for people; crawlers, link previews and test runners
 * (`navigator.webdriver`) see the page without it unless `?pet=1` or a stored choice says otherwise.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (10)
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Navigator/webdriver
 */
export function petWanted(choice: SwitchState, automated: boolean): boolean {
	return choice === "on" || (choice === "default" && !automated);
}

function whenIdle(run: () => void): void {
	if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 3000 });
	else setTimeout(run, 1200);
}

/**
 * Wires the mount point (`#pet-root` and its "call back" tab) to the switch.
 *
 * Why: called once per document; the root is `transition:persist`ed, so the pet
 * outlives ClientRouter navigations and the switch is re-read on each one
 * (`?pet=0` on a link works).
 *
 * @see https://docs.astro.build/en/guides/view-transitions/#lifecycle-events
 */
export function bootPet(doc: Document = document): void {
	const root = doc.getElementById("pet-root");
	const door = root?.querySelector<HTMLButtonElement>("[data-pet-door]");
	if (!root || !door) return;
	let dispose: (() => void) | undefined;
	let pending = false;

	const showDoor = (focus: boolean): void => {
		dispose?.();
		dispose = undefined;
		door.hidden = false;
		root.hidden = false;
		if (focus) door.focus();
	};
	const start = (focus: boolean): void => {
		if (pending || dispose) return;
		pending = true;
		void import("./start").then(({ startPet }) => {
			pending = false;
			door.hidden = true;
			root.hidden = false;
			dispose = startPet(root, {
				focus,
				onHome: (viaKeyboard) => {
					writeSwitch("pet", false, browserStorage());
					showDoor(viaKeyboard);
				},
			});
		});
	};
	const apply = (): void => {
		const choice = resolveSwitch("pet", doc.location.search, browserStorage());
		if (petWanted(choice, navigator.webdriver === true)) whenIdle(() => start(false));
		else if (choice === "off") showDoor(false);
		else root.hidden = true;
	};

	door.addEventListener("click", () => {
		writeSwitch("pet", true, browserStorage());
		start(true);
	});
	apply();
	doc.addEventListener("astro:page-load", apply);
}
