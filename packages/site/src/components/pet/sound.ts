/**
 * The pet's two sounds, generated with Web Audio; silent unless the site's sound toggle is on.
 *
 * Why: no audio file and no bytes for visitors who keep sound off (the default).
 * The toggle's state is the `utofme:sound` key that `SoundToggle.astro` writes.
 *
 * @see packages/specs/specs/11-pet.md § "Not annoying: the rules" (6)
 * @see https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode
 */

let context: AudioContext | undefined;

function audio(): AudioContext | undefined {
	try {
		if (localStorage.getItem("utofme:sound") !== "on") return undefined;
		context ??= new AudioContext();
		return context;
	} catch {
		return undefined;
	}
}

function tone(frequency: number, seconds: number, peak: number, type: OscillatorType): void {
	const ctx = audio();
	if (!ctx) return;
	const now = ctx.currentTime;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = type;
	osc.frequency.value = frequency;
	gain.gain.setValueAtTime(0, now);
	gain.gain.linearRampToValueAtTime(peak, now + 0.03);
	gain.gain.linearRampToValueAtTime(0, now + seconds);
	osc.connect(gain).connect(ctx.destination);
	osc.start(now);
	osc.stop(now + seconds + 0.02);
}

/**
 * A short low purr (a pat).
 *
 * Why: two close low tones beat against each other, which reads as a purr without a sample.
 *
 * @see packages/specs/specs/11-pet.md § "Pat"
 */
export function purr(): void {
	tone(62, 0.25, 0.06, "triangle");
	tone(86, 0.25, 0.04, "triangle");
}

/**
 * A small blip (one letter eaten); `step` raises the pitch along a bite.
 *
 * Why: the bite is audible as a run of notes, one per letter.
 *
 * @see packages/specs/specs/11-pet.md § "Feed"
 */
export function blip(step: number): void {
	tone(420 + 40 * step, 0.07, 0.03, "square");
}
