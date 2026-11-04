/**
 * Structural parse of an article MDX file, for the content lint and (lane P) the provenance test.
 *
 * Why: the lint rules of P10-1 (word count, section ids, figure numbers, `$` escaping) must run
 * without compiling MDX; a small line-and-regex reader is enough because the article uses a
 * closed set of constructs (imports, `{/* *\/}` comments, `*Block` figures, `<N/>`, `<Stamp/>`,
 * the inline `<EloSentenceBlock/>`).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-1 (structural content lint)
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17 (provenance and claims lint)
 */
import { slug as slugify } from "github-slugger";
import matter from "gray-matter";

/** One `## ` section. */
export interface ProseSection {
	/** `github-slugger` id of the heading text. */
	id: string;
	title: string;
}

/** One figure Block found in the body. */
export interface ProseFigure {
	component: string;
	/** The `number` prop; `undefined` when absent or not a literal. */
	number: number | undefined;
	/** Text of the child with `slot="caption"` ("" when none). */
	caption: string;
	/** Text of the child with `slot="try"` ("" when none). */
	try: string;
}

/** Result of {@link parseMdxProse}. */
export interface MdxProse {
	frontmatter: Record<string, unknown>;
	sections: ProseSection[];
	/** Prose paragraphs in order, components/imports/comments/math removed; `<N/>` and `<Stamp/>` kept. */
	paragraphs: string[];
	figures: ProseFigure[];
	/** Words in paragraphs and headings. */
	words: number;
	/** The body has a `$$` block. */
	hasMathBlock: boolean;
	/** An unescaped `$` is followed by a digit outside code and `$$` blocks. */
	unescapedDollar: boolean;
}

// Why: F13 is inline and unnumbered (spec P10-15): it reads as part of its sentence, so it is a
// prose token like `<N/>`, never a figure and never removed markup.
const INLINE = "EloSentenceBlock";
const TOKEN = new RegExp(`<(?:N|Stamp|${INLINE})\\b[^>]*\\/>`, "g");
const FIG_MARK = /^\uE000(\d+)\uE000$/;

function squash(s: string): string {
	return s
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function slotMatch(inner: string, slot: string): string | undefined {
	return new RegExp(`<(\\w+)\\b[^>]*\\bslot="${slot}"[^>]*>([\\s\\S]*?)</\\1>`).exec(inner)?.[2];
}

function slotText(inner: string, slot: string): string {
	const m = slotMatch(inner, slot);
	return m === undefined ? "" : squash(m);
}

function slotSource(inner: string, slot: string): string {
	return (slotMatch(inner, slot) ?? "").replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
	return text
		.replace(TOKEN, "0")
		.split(/\s+/)
		.filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

interface ScanFigure extends ProseFigure {
	/** Raw source of the caption slot (tags kept, whitespace collapsed). */
	captionSrc: string;
	/** Raw source of the try slot. */
	trySrc: string;
}

type ScanItem =
	| { kind: "h2"; title: string; id: string }
	| { kind: "heading"; text: string }
	| { kind: "para"; text: string }
	| { kind: "figure"; figure: ScanFigure };

interface Scan {
	frontmatter: Record<string, unknown>;
	items: ScanItem[];
	hasMathBlock: boolean;
	unescapedDollar: boolean;
}

// Why: one pass shared by `parseMdxProse` (P10-1) and `parseMdxSource` (P10-17), so the two lints
// see the same paragraphs, sections and figures.
function scan(text: string): Scan {
	const parsed = matter(text);
	const frontmatter = JSON.parse(JSON.stringify(parsed.data)) as Record<string, unknown>;
	let body = parsed.content;

	body = body.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
	body = body.replace(/^(?:import|export)\s.*$/gm, "");

	const figures: ScanFigure[] = [];
	const figureRe = new RegExp(
		`<((?!${INLINE}\\b)[A-Z]\\w*Block)\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/\\1>)`,
		"g",
	);
	body = body.replace(
		figureRe,
		(_m, component: string, attrs: string, inner: string | undefined) => {
			const n = /\bnumber=(?:\{(\d+)\}|"(\d+)")/.exec(attrs);
			const raw = n?.[1] ?? n?.[2];
			figures.push({
				component,
				number: raw === undefined ? undefined : Number(raw),
				caption: slotText(inner ?? "", "caption"),
				try: slotText(inner ?? "", "try"),
				captionSrc: slotSource(inner ?? "", "caption"),
				trySrc: slotSource(inner ?? "", "try"),
			});
			return `\n\n\uE000${figures.length - 1}\uE000\n\n`;
		},
	);

	const mathRe = /\$\$[\s\S]*?\$\$/g;
	const hasMathBlock = mathRe.test(body);
	body = body.replace(mathRe, "\n\n");

	// Other components (paired then self-closing); N, Stamp and inline Blocks stay as tokens.
	body = body.replace(
		new RegExp(
			`<(?!N\\b|Stamp\\b|${INLINE}\\b)([A-Z]\\w*)\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/\\1>)`,
			"g",
		),
		"\n\n",
	);

	const fenceFree = body.replace(/```[\s\S]*?```/g, "\n\n").replace(/`[^`\n]*`/g, "");
	const unescapedDollar = /(?<!\\)\$\d/.test(fenceFree);

	const items: ScanItem[] = [];
	for (const block of body.split(/\n\s*\n/)) {
		const t = block.trim();
		if (t === "") continue;
		const f = FIG_MARK.exec(t);
		const fig = f?.[1] === undefined ? undefined : figures[Number(f[1])];
		if (fig !== undefined) {
			items.push({ kind: "figure", figure: fig });
			continue;
		}
		const h = /^##\s+(.+)$/.exec(t);
		if (h?.[1] !== undefined) {
			const title = h[1].trim();
			items.push({ kind: "h2", title, id: slugify(title) });
			continue;
		}
		if (/^#{1,6}\s/.test(t)) {
			items.push({ kind: "heading", text: t.replace(/^#+\s+/, "") });
			continue;
		}
		const para = t.replace(/<(?!N\b|Stamp\b)\/?[a-z][^>]*>/g, "").replace(/\s+/g, " ");
		items.push({ kind: "para", text: para });
	}
	return { frontmatter, items, hasMathBlock, unescapedDollar };
}

/**
 * Parses an MDX file into the structure the content lint needs.
 *
 * Why: P10-1 lint rules and lane P's provenance test share one reader so they cannot disagree.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-1
 */
export function parseMdxProse(text: string): MdxProse {
	const s = scan(text);
	const sections: ProseSection[] = [];
	const paragraphs: string[] = [];
	const figures: ProseFigure[] = [];
	let words = 0;
	for (const it of s.items) {
		if (it.kind === "figure") {
			const { component, number, caption, try: tryText } = it.figure;
			figures.push({ component, number, caption, try: tryText });
		} else if (it.kind === "h2") {
			sections.push({ id: it.id, title: it.title });
			words += countWords(it.title);
		} else if (it.kind === "heading") {
			words += countWords(it.text);
		} else {
			paragraphs.push(it.text);
			words += countWords(it.text);
		}
	}
	const { frontmatter, hasMathBlock, unescapedDollar } = s;
	return { frontmatter, sections, paragraphs, figures, words, hasMathBlock, unescapedDollar };
}

/** One figure Block with the raw sources of its slots (lane P). */
export interface SourceFigure {
	component: string;
	number: number | undefined;
	/** Raw `caption` slot (tags kept, whitespace collapsed); "" when none. */
	caption: string;
	/** Raw `try` slot; "" when none. */
	try: string;
}

/** One `## ` section (or the preamble before the first one) with its paragraphs and figures. */
export interface SourceSection {
	/** Heading id; "" for the preamble. */
	id: string;
	title: string;
	/** Paragraph sources: lower-case tags removed, `<N/>`, `<Stamp/>` and inline Blocks kept. */
	paragraphs: string[];
	figures: SourceFigure[];
}

/** Result of {@link parseMdxSource}. */
export interface MdxSource {
	frontmatter: Record<string, unknown>;
	/** Prose and figures before the first `## ` heading. */
	preamble: SourceSection;
	sections: SourceSection[];
}

/**
 * Parses an MDX file into sections, each with its paragraph sources and figure slot sources.
 *
 * Why: the provenance lint (P10-17) works per section (stamps, the honesty sentence) and per
 * caption, and needs the `<N>` tags that `parseMdxProse` squashes out of captions.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17
 */
export function parseMdxSource(text: string): MdxSource {
	const s = scan(text);
	const preamble: SourceSection = { id: "", title: "", paragraphs: [], figures: [] };
	const sections: SourceSection[] = [];
	let cur = preamble;
	for (const it of s.items) {
		if (it.kind === "h2") {
			cur = { id: it.id, title: it.title, paragraphs: [], figures: [] };
			sections.push(cur);
		} else if (it.kind === "figure") {
			const { component, number, captionSrc, trySrc } = it.figure;
			cur.figures.push({ component, number, caption: captionSrc, try: trySrc });
		} else {
			cur.paragraphs.push(it.kind === "para" ? it.text : it.text.trim());
		}
	}
	return { frontmatter: s.frontmatter, preamble, sections };
}

/** One structural lint failure. */
export interface LintFailure {
	/** Stable rule name, asserted by tests. */
	rule:
		| "body-words"
		| "dek-words"
		| "lede-words"
		| "gallery-empty"
		| "cover-alt"
		| "sections-match"
		| "figure-order"
		| "figure-referenced"
		| "math-flag"
		| "dollar-escape";
	message: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
	// Why: `Array.isArray` narrows `unknown` to `any[]`, which type-coverage --strict rejects.
	return Array.isArray(v) ? (v as unknown[]) : [];
}

/**
 * Structural lint of one research-article MDX file (callers pass only non-draft, non-fixture
 * works that have `article`). Returns every failed rule; empty means pass.
 *
 * Why: P10-1 replaces the 40–120-word Tier S body rule for article entries with these checks.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-1 (structural content lint)
 */
export function lintArticle(text: string): LintFailure[] {
	const p = parseMdxProse(text);
	const fm = p.frontmatter;
	const article = isRecord(fm["article"]) ? fm["article"] : {};
	const fails: LintFailure[] = [];
	const add = (rule: LintFailure["rule"], message: string) => fails.push({ rule, message });

	if (p.words < 1500 || p.words > 5000) add("body-words", `body has ${p.words} words`);
	const dek = countWords(typeof article["dek"] === "string" ? article["dek"] : "");
	if (dek < 6 || dek > 16) add("dek-words", `dek has ${dek} words`);
	const lede = countWords(typeof fm["lede"] === "string" ? fm["lede"] : "");
	if (lede < 6 || lede > 20) add("lede-words", `lede has ${lede} words`);

	const gallery = asArray(fm["gallery"]);
	if (gallery.length > 0) {
		add("gallery-empty", `gallery has ${gallery.length} items`);
	}
	const cover = fm["cover"];
	if (!isRecord(cover) || typeof cover["alt"] !== "string" || cover["alt"].trim() === "") {
		add("cover-alt", "cover has no alt");
	}

	const declared = asArray(article["sections"]).map((s) => (isRecord(s) ? s["id"] : undefined));
	const found = p.sections.map((s) => s.id);
	if (JSON.stringify(declared) !== JSON.stringify(found)) {
		add(
			"sections-match",
			`sections ${JSON.stringify(declared)} vs headings ${JSON.stringify(found)}`,
		);
	}

	const numbers = p.figures.map((f) => f.number);
	if (numbers.some((n, i) => n !== i + 1)) {
		add("figure-order", `figure numbers ${JSON.stringify(numbers)} are not 1..n in order`);
	}
	const prose = p.paragraphs.join("\n");
	for (const n of numbers) {
		if (n !== undefined && !new RegExp(`\\bFigure ${n}\\b`).test(prose)) {
			add("figure-referenced", `Figure ${n} is never referenced in prose`);
		}
	}

	if ((article["math"] === true) !== p.hasMathBlock) {
		add(
			"math-flag",
			`article.math is ${String(article["math"])} but hasMathBlock is ${p.hasMathBlock}`,
		);
	}
	if (p.unescapedDollar) add("dollar-escape", "unescaped $ before a digit; write \\$40");
	return fails;
}

// ---------------------------------------------------------------------------------------------
// Provenance and claims lint (P10-17, lane P)
// ---------------------------------------------------------------------------------------------

/** Rule names of {@link lintProvenance}. */
export type ProvenanceRule =
	| "bare-digit"
	| "banned-claim"
	| "chained-elo"
	| "banned-literal"
	| "missing-stamp"
	| "honesty"
	| "caption-length"
	| "caption-fact"
	| "caption-claim"
	| "missing-try"
	| "unknown-fact"
	| "money"
	| "hardware";

/** One provenance lint failure. */
export interface ProvenanceFailure {
	/** Stable rule name, asserted by tests. */
	rule: ProvenanceRule;
	/** `#section-id`, `preamble`, `frontmatter` or `Figure N`. */
	where: string;
	message: string;
}

/** The fact reader the lint needs; `src/lib/facts.ts` (`{ fact, formatFact }`) satisfies it. */
export interface ProvenanceFacts {
	/** Throws on an unknown key. */
	fact(key: string): { readonly measuredOn?: unknown };
	/** The fact as `<N>` prints it. */
	formatFact(key: string, opts?: { readonly ci?: boolean; readonly alt?: boolean }): string;
}

/**
 * Digit patterns that may stay in prose: names and labels, not measurements.
 *
 * Why: spec P10-17 lists them; ISO dates come before years so a year never eats part of a date,
 * and years stop at 2039 so a bare count like 2048 is not mistaken for one.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17 (No bare digits)
 */
export const DIGIT_EXEMPTIONS: readonly RegExp[] = [
	/\b\d{4}-\d{2}-\d{2}\b/g,
	/\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)\b/g,
	/\bCS2\b/g,
	/\bDust2\b/g,
	/\b[35]v[35]\b/g,
	/\bv[1-3]\b/g,
	/\b(?:RTX|GTX) \d{4}(?: Ti)?\b/g,
	/\b28×28\b/g,
	/\bFigure \d+\b/g,
	/\b[Bb]lock \d+\b/g,
	/\b20[0-3]\d\b/g,
];

const N_TAG = /<N\b[^>]*\/>/g;
const STAMP_TAG = /<Stamp\b[^>]*\/>/g;
const INLINE_TAG = new RegExp(`<${INLINE}\\b[^>]*\\/>`, "g");
const CLAIM_VERB =
	/\b(?:beat(?:s|ing|en)?|defeat\w*|outperform\w*|outplay\w*|surpass\w*|rival\w*|on par with|as good as|better than|stronger than|superior to|plays? like (?:a )?pros?)\b/gi;
const CLAIM_ALONE = /\b(?:superhuman|human-level|pro-level)\b/gi;
const CLAIM_TARGET = /\b(?:pros?|professionals?|humans?|people|players)\b/i;
const NEGATION = /^(?:not|never|no|yet|nor)$|n['’]t$/i;
const HONESTY = /no agent has (yet )?played (a )?human/i;
const HONESTY_FIRST_WORDS = 120;
const HONESTY_AGAIN = "toward-real-cs2";
const CAPTION_MAX = 100;

interface NAttrs {
	key: string;
	ci: boolean;
	alt: boolean;
}

function nAttrs(tag: string): NAttrs {
	const key = /\bk="([^"]*)"/.exec(tag)?.[1] ?? "";
	const rest = tag.replace(/\bk="[^"]*"/, "");
	return { key, ci: /\bci\b/.test(rest), alt: /\balt\b/.test(rest) };
}

/** Prose as read: a fact is the word "N"; stamps, inline Blocks, tags and link targets go. */
function plain(src: string): string {
	return src
		.replace(N_TAG, "N")
		.replace(STAMP_TAG, "")
		.replace(INLINE_TAG, "")
		.replace(/\]\([^)]*\)/g, "]")
		.replace(/<[^>]*>/g, "")
		.replace(/[*[\]]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function sentences(src: string): string[] {
	return src.split(/(?<=[.!?])\s+(?=\S)/).filter((s) => s.trim() !== "");
}

function bareDigits(src: string): string[] {
	let t = plain(src);
	for (const re of DIGIT_EXEMPTIONS) t = t.replace(re, " ");
	return t.split(/\s+/).filter((w) => /\d/.test(w));
}

function negatedBefore(before: string): boolean {
	return before
		.trim()
		.split(/\s+/)
		.slice(-6)
		.map((w) => w.replace(/^[^\p{L}]+|[^\p{L}'’]+$/gu, ""))
		.some((w) => NEGATION.test(w));
}

function lastWord(before: string): string {
	const words = before.trim().split(/\s+/);
	return (words[words.length - 1] ?? "").replace(/[^\p{L}]/gu, "");
}

/** Banned claims in one plain sentence; returns the offending phrases. */
function bannedClaims(sentence: string): string[] {
	const out: string[] = [];
	const hasTarget = CLAIM_TARGET.test(sentence);
	for (const m of sentence.matchAll(CLAIM_VERB)) {
		if (!hasTarget) break;
		const before = sentence.slice(0, m.index);
		const duel = /^beats?$/i.test(m[0]) && /^(?:holders?|peekers?)$/i.test(lastWord(before));
		if (!duel && !negatedBefore(before)) out.push(m[0]);
	}
	for (const m of sentence.matchAll(CLAIM_ALONE)) {
		if (!negatedBefore(sentence.slice(0, m.index))) out.push(m[0]);
	}
	return out;
}

function literals(sentence: string): string[] {
	const out: string[] = [];
	if (/over its starting point/i.test(sentence)) out.push("over its starting point");
	const fast = /twice as fast|2\s?[×x] faster/i.exec(sentence);
	if (fast && !/plant|3v3/i.test(sentence)) out.push(fast[0]);
	return out;
}

function count(text: string, re: RegExp): number {
	return [...text.matchAll(re)].length;
}

/**
 * The provenance and claims lint of P10-17 over one article MDX file. Returns every failure;
 * empty means pass.
 *
 * Rules: no bare digits (after removing `<N/>`, `<Stamp/>`, tags with their attributes, link
 * targets and `$$` maths; {@link DIGIT_EXEMPTIONS} stay); banned claims per sentence with the
 * 6-word negation window and the "holder beats peeker" exemption; no 3v3 and 5v5 Elo keys in one
 * sentence without "different"; banned literals; a `<Stamp>` in every section that prints a
 * `measuredOn` fact; the honesty sentence in the first section's first 120 words and in
 * `#toward-real-cs2`; captions ≤ 100 rendered characters with ≥ 1 `<N>` and a stated claim;
 * a `try` slot on every numbered figure; known fact keys; money only through the
 * `compute.cloud.usd` fact; hardware in its approved wording.
 *
 * Why: every number on the page must come from a keyed fact and no sentence may claim the agents
 * reach professional or human play (spec P10-17, ADR 0059).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-17 (Provenance and claims lint)
 * @see packages/specs/adrs/0059-keyed-facts-n-and-claims-lint.md
 */
export function lintProvenance(text: string, facts: ProvenanceFacts): ProvenanceFailure[] {
	const doc = parseMdxSource(text);
	const fails: ProvenanceFailure[] = [];
	const add = (rule: ProvenanceRule, where: string, message: string) =>
		fails.push({ rule, where, message });

	const fm = doc.frontmatter;
	const article = isRecord(fm["article"]) ? fm["article"] : {};
	for (const v of [fm["lede"], fm["summary"], article["headline"], article["dek"]]) {
		if (typeof v !== "string") continue;
		for (const s of sentences(v)) {
			for (const c of bannedClaims(s)) add("banned-claim", "frontmatter", `"${c}" in "${s}"`);
			for (const l of literals(s)) add("banned-literal", "frontmatter", `"${l}" in "${s}"`);
		}
	}

	const known = (key: string, where: string): { measured: boolean } | undefined => {
		try {
			return { measured: facts.fact(key).measuredOn !== undefined };
		} catch {
			add("unknown-fact", where, `unknown fact key "${key}"`);
			return undefined;
		}
	};

	const checkPiece = (src: string, where: string): { measured: string | undefined } => {
		let measured: string | undefined;
		for (const tag of src.match(N_TAG) ?? []) {
			const { key } = nAttrs(tag);
			if (known(key, where)?.measured === true) measured ??= key;
		}
		const digits = bareDigits(src);
		if (digits.length > 0) add("bare-digit", where, `bare number(s): ${digits.join(", ")}`);
		for (const raw of sentences(src)) {
			const s = plain(raw);
			for (const c of bannedClaims(s)) add("banned-claim", where, `"${c}" in "${s}"`);
			for (const l of literals(s)) add("banned-literal", where, `"${l}" in "${s}"`);
			const keys = (raw.match(N_TAG) ?? []).map((t) => nAttrs(t).key);
			const v3 = keys.some((k) => k.startsWith("elo.3v3."));
			const other = keys.some((k) => k.startsWith("elo.") && !k.startsWith("elo.3v3."));
			if (v3 && other && !/\bdifferent\b/i.test(s)) {
				add("chained-elo", where, `3v3 and 5v5 Elo in one sentence: "${s}"`);
			}
		}
		const p = plain(src);
		if (p.includes("$")) add("money", where, "a dollar amount outside the compute.cloud.usd fact");
		const cloud = count(src, /cloud GPU/gi);
		const approved = count(src, /<N k="compute\.cloud\.usd" alt \/>\s+of\s+cloud GPU/g);
		if (cloud !== approved) {
			add("money", where, 'write the cost as <N k="compute.cloud.usd" alt /> of cloud GPU');
		}
		if (count(p, /2080/g) !== count(p, /a friend['’]s RTX 2080 Ti/g)) {
			add("hardware", where, `write "a friend's RTX 2080 Ti"`);
		}
		if (count(p, /1660/g) !== count(p, /a desktop GTX 1660 Ti/g)) {
			add("hardware", where, `write "a desktop GTX 1660 Ti"`);
		}
		return { measured };
	};

	for (const sec of [doc.preamble, ...doc.sections]) {
		const where = sec.id === "" ? "preamble" : `#${sec.id}`;
		let measured: string | undefined;
		let stamped = false;
		const note = (piece: string, at: string) => {
			const found = checkPiece(piece, at).measured;
			measured ??= found;
			stamped ||= /<Stamp\b/.test(piece);
		};
		for (const para of sec.paragraphs) note(para, where);
		for (const fig of sec.figures) {
			if (fig.number === undefined) continue;
			const at = `Figure ${fig.number}`;
			note(fig.caption, at);
			note(fig.try, at);
			const rendered = plain(
				fig.caption.replace(N_TAG, (tag) => {
					const { key, ci, alt } = nAttrs(tag);
					try {
						return facts.formatFact(key, { ci, alt });
					} catch {
						return key;
					}
				}),
			);
			const len = [...rendered].length;
			if (len > CAPTION_MAX) add("caption-length", at, `caption is ${len} characters`);
			const claims = sentences(fig.caption).some((s) => /<N\b/.test(s) && /\.\s*$/.test(plain(s)));
			if (!/<N\b/.test(fig.caption)) add("caption-fact", at, "caption prints no <N> fact");
			else if (!claims) add("caption-claim", at, "no sentence with a fact ends in a full stop");
			if (plain(fig.try) === "") add("missing-try", at, "interactive figure without a try line");
		}
		if (measured !== undefined && !stamped) {
			add("missing-stamp", where, `"${measured}" has measuredOn but the section has no <Stamp>`);
		}
	}

	const first = doc.sections[0];
	const firstText = first === undefined ? "" : plain(first.paragraphs.join(" "));
	const m = HONESTY.exec(firstText);
	const upTo = m === null ? Number.POSITIVE_INFINITY : firstText.slice(0, m.index + m[0].length);
	const firstWords = typeof upTo === "string" ? upTo.split(/\s+/).length : upTo;
	if (firstWords > HONESTY_FIRST_WORDS) {
		add("honesty", first === undefined ? "preamble" : `#${first.id}`, "honesty sentence missing");
	}
	const again = doc.sections.find((s) => s.id === HONESTY_AGAIN);
	if (again === undefined || !HONESTY.test(plain(again.paragraphs.join(" ")))) {
		add("honesty", `#${HONESTY_AGAIN}`, "honesty sentence missing");
	}
	return fails;
}
