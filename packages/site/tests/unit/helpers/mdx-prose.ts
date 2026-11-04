/**
 * Structural parse of an article MDX file, for the content lint and (lane P) the provenance test.
 *
 * Why: the lint rules of P10-1 (word count, section ids, figure numbers, `$` escaping) must run
 * without compiling MDX; a small line-and-regex reader is enough because the article uses a
 * closed set of constructs (imports, `{/* *\/}` comments, `*Block` figures, `<N/>`, `<Stamp/>`).
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-1 (structural content lint)
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

const TOKEN = /<(?:N|Stamp)\b[^>]*\/>/g;

function squash(s: string): string {
	return s
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function slotText(inner: string, slot: string): string {
	const m = new RegExp(`<(\\w+)\\b[^>]*\\bslot="${slot}"[^>]*>([\\s\\S]*?)</\\1>`).exec(inner);
	return m?.[2] === undefined ? "" : squash(m[2]);
}

function countWords(text: string): number {
	return text
		.replace(TOKEN, "0")
		.split(/\s+/)
		.filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Parses an MDX file into the structure the content lint needs.
 *
 * Why: P10-1 lint rules and lane P's provenance test share one reader so they cannot disagree.
 *
 * @see packages/specs/specs/10-tactical-arena-article.md § P10-1
 */
export function parseMdxProse(text: string): MdxProse {
	const parsed = matter(text);
	const frontmatter = JSON.parse(JSON.stringify(parsed.data)) as Record<string, unknown>;
	let body = parsed.content;

	body = body.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
	body = body.replace(/^(?:import|export)\s.*$/gm, "");

	const figures: ProseFigure[] = [];
	const figureRe = /<([A-Z]\w*Block)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
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
			});
			return "\n\n";
		},
	);

	const mathRe = /\$\$[\s\S]*?\$\$/g;
	const hasMathBlock = mathRe.test(body);
	body = body.replace(mathRe, "\n\n");

	// Other components (paired then self-closing); N and Stamp stay as tokens.
	body = body.replace(/<(?!N\b|Stamp\b)([A-Z]\w*)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g, "\n\n");

	const fenceFree = body.replace(/```[\s\S]*?```/g, "\n\n").replace(/`[^`\n]*`/g, "");
	const unescapedDollar = /(?<!\\)\$\d/.test(fenceFree);

	const sections: ProseSection[] = [];
	const paragraphs: string[] = [];
	let words = 0;
	for (const block of body.split(/\n\s*\n/)) {
		const t = block.trim();
		if (t === "") continue;
		const h = /^##\s+(.+)$/.exec(t);
		if (h?.[1] !== undefined) {
			const title = h[1].trim();
			sections.push({ id: slugify(title), title });
			words += countWords(title);
			continue;
		}
		if (/^#{1,6}\s/.test(t)) {
			words += countWords(t.replace(/^#+\s+/, ""));
			continue;
		}
		const para = t.replace(/<(?!N\b|Stamp\b)\/?[a-z][^>]*>/g, "").replace(/\s+/g, " ");
		paragraphs.push(para);
		words += countWords(para);
	}

	return { frontmatter, sections, paragraphs, figures, words, hasMathBlock, unescapedDollar };
}
