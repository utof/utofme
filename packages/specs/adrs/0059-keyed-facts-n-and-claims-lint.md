# 0059 — Keyed facts, `<N>` and the claims lint

Status: accepted (phase 10, spec P10-17, OD-4)

## Context
The research article prints about 160 numbers: Elo deltas with intervals, medians, rates, counts. They come from a private notes repo whose fact sheet cites a source for each one. Two things can go wrong on such a page. A number can drift: a re-export moves a value, and the prose still prints the old one next to a figure that shows the new one. A sentence can overclaim: the project's goal is agents that play at the level of professionals, the agents have never played a human or a real CS2 match, and a loose "beats" or "on par with" would say otherwise. A human review catches some of this once. It does not catch the edit six months later.

## Decision
- **Keyed facts.** The notes repo's lane builds `facts.json` (`facts/1`): dotted lower-case keys, the value stored as printed in its unit, its precision (`digits`), optional `unit`, `sign`, `alt` (an approved wording such as "about $40" or "1 in 7"), `lo`/`hi`, and `measuredOn` for every agent number. Its checker asserts each value against the cited fact-sheet line or computes it from the data file the figure reads. The site sync drops `src` (ADR 0054); `src/lib/facts.ts` validates the file and throws on an unknown key, so the build fails.
- **`<N k="…" />`** prints a fact as `<data class="n" value data-fact>`, at its own digits (a stored value is never rounded twice), with `ci` and `alt` options and a `title` "as measured on …" for `measuredOn` facts. Prose, captions and figure readouts read the same keyed value.
- **Stamps.** Every section that prints a `measuredOn` fact carries a visible `<Stamp>`. The article derives the stamp text from the fact itself through a one-line MDX export (`on(k) = measuredOnText(fact(k).measuredOn)`), so a re-sync moves the stamp with the number. Stamps sit between em dashes in the prose, not in parentheses: the component's text has inner whitespace.
- **Provenance and claims lint** (`lintProvenance` in `tests/unit/helpers/mdx-prose.ts`, run by `tests/unit/article-provenance.test.ts` on the real entry and on one fixture per rule). It shares the structural lint's MDX reader, so both see the same paragraphs, sections and figures.
  - *No bare digits* in prose, captions or try lines after removing `<N/>`, `<Stamp/>`, tags with their attributes, link targets, code spans and `$$` maths. Exempt: `CS2`, `Dust2`, `3v3`/`5v5`, `v1`–`v3`, GPU model names, `28×28`, `Figure N`, `block N`, years 2000–2039, and day-month or ISO dates.
  - *Banned claims*, per sentence: a comparison verb (`beat`, `defeat`, `outperform`, `outplay`, `surpass`, `rival`, `on par with`, `as good as`, `better than`, `stronger than`, `superior to`, `plays like a pro`) together with a target (`pro`, `professional`, `human`, `people`, `players`) in either order, or `superhuman` / `human-level` / `pro-level` alone. A sentence passes only with a negation (`not`, `never`, `no`, `yet`, `nor`, `n't`) in the 6 words before the verb, or for the duel statistic "holder beats peeker".
  - *Chaining*: a sentence with both a `elo.3v3.*` key and another Elo key must say "different".
  - *Literals*: "over its starting point" fails anywhere (also in the lede, summary, headline and dek); "twice as fast" / "2× faster" fails unless the sentence is about plant time or the 3v3 agent.
  - *Honesty*: "No agent has played a human or a real CS2 match yet" within the first 120 words of the first section and again in `#toward-real-cs2`.
  - *Captions*: ≤ 100 rendered characters (each `<N>` replaced by its printed text), at least one `<N>`, and a sentence with a fact that ends in a full stop. Every numbered figure has a try line.
  - *Money and hardware*: dollars only through `<N k="compute.cloud.usd" alt /> of cloud GPU`; hardware as "a friend's RTX 2080 Ti" and "a desktop GTX 1660 Ti".
  - *Unknown keys* fail the lint and, independently, the build.

## Alternatives
- **Numbers typed into the prose, reviewed by hand:** cheapest to write, and the first re-export makes prose and figure disagree with nothing to catch it.
- **A remark plugin that rewrites numbers at build:** it would have to guess which number is which; keys are explicit.
- **An LLM or classifier for overclaiming:** not reproducible in CI and not explainable in a failing test. A word list with a negation window is crude, but it fails loudly and a reviewer can read every rule.
- **Stamps as literal strings:** simpler to read in the MDX, and they drift from the fact's `measuredOn` on the next sync.
- **Exempting the credits' dataset ids and licences by name:** a list that grows with every citation; code spans mark identifiers once, by markup.

## Consequences
- A re-sync of `facts.json` updates prose, captions, stamps and figures together; a deleted key fails the build.
- A new number in the copy needs a key first. Missing keys are listed in the copy lane's report and requested from the notes repo; until then the sentence leaves the number out.
- The lint is conservative: a negation more than six words before the verb fails a sentence that is in fact honest, and the copy is rephrased. Number words ("five attackers", "twice as wide") are not caught; they are reserved for definitional counts, and the fresh read in the PR checklist covers the rest.
- `$$` maths is outside the digit rule: its constants (1, 10, 400) are definitions, not measurements. Inline `$…$` maths is not used in the article, because its digits would count as prose.

## Sources
- Spec: `packages/specs/specs/10-tactical-arena-article.md` § P10-17, OD-4.
- ADR 0054 (facts sync), ADR 0052 (article variant and structural lint).
- HTML `<data>` element: https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-data-element
- Explorable explanations (numbers the reader can trace): https://worrydream.com/ExplorableExplanations/
