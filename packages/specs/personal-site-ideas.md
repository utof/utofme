# utof.me ideas backlog

These are ideas from the November 2026 brainstorm, ready to pick up individually. The site already has Nib, the five-effect UTOF wordmark, a project catalogue, a garden with backlinks and a graph, `/now`, `/uses`, `/tops`, a colophon, and a site-wide motion control.

## Personal pages

| Idea | First version | Reference |
| --- | --- | --- |
| **`/versions`** | A dated strip of old homepages. Start with screenshots and a sentence per version. Restore a few live versions where the files and assets are available, so their original hovers can still be tried. | [Lynn Fisher’s site archive](https://lynnandtonic.com/archive/) |
| **`/neighbors`** | A hand-picked blogroll with a sentence about each site, a random-neighbor link, and a downloadable animated 88×31 UTOF badge with embed markup. | [Chuck Grimmett’s blogroll](https://cagrimmett.com/blogroll/), [MelonLand Surf Club](https://wiki.melonland.net/surf_club), [Monsieurdoll’s badge](https://monsieurdoll.neocities.org/) |
| **`/desk`** | One dated photo and one line, swapped when there’s a good one. Ideas include the electronics bench, a notebook page, or the aftermath of a recording session. | [Robert Birming’s photo page](https://robertbirming.com/photo/) |
| **`/questions`** | A short list of real open questions. Attach a notebook, experiment, or garden entry when there’s a result, keeping the original question visible. | [Joshua P. Steele’s questions](https://joshuapsteele.com/questions/) |
| **`/guestbook`** | Draw a signature on a tiny pixel grid and leave a line plus an optional site URL. Curate submitted stamps before showing them on the page. | [32-Bit Cafe’s personal web guide](https://32bit.cafe/cyowebsite/), [Internet Phone Book’s voicemail](https://internetphonebook.net/) |
| **An oddly specific shrine** | Pick one genuine obsession. For example, write a small exhibit on game menus with five examples and an explanation of what each gets right. | [Neocities shrine directory](https://neocities.org/browse?tag=shrines) |
| **A printable UTOF zine** | A printable one-sheet foldout with a few project objects, one short experiment, and a URL back to the site. Check the actual fold order on paper. | [The Internet Phone Book](https://internetphonebook.net/) |
| **The bottom drawer** | A handle below the footer opens `/drawer/`. Start with the unused UTOF doodle GIF, a CS2 outtake, one synth patch, and a screenshot. Give each artifact a short note about where it came from. | The site’s object catalogue and the existing local archive |
| **`/radio`** | Build one dial with three stations from real `enth` patches, one scope trace, and an explicit play control. | [enth source](https://github.com/utof/enth) |

## Interactions and easter eggs

- **Feed Nib a logo pixel.** Offer Nib one square. It visibly comes out of UTOF, then Nib spits it back into place. Use a deliberate feed action so the logo link still works normally.
- **Playable project objects.** Open Modified Maxwell’s preview and move a wave emitter. On the gravity project, pull back a dot and release it into orbit. Give each object one gesture and an immediate response.
- **A replay worth rewinding.** Add a jog wheel to one short Tactical Arena clip. Begin at a surprising result, then let the visitor scrub backward to see the play that caused it.
- **Handwriting in the margins.** A small pencil mark next to a figure reveals one real sketch or a crossed-out idea. Use scans where the source exists.
- **A secret in the browser console.** Print a tiny ASCII Nib holding a URL to an artifact such as an early UTOF mark, with its date and story.
- **404.** The rotating, colored block-ASCII version was picked and built. The earlier black-hole concept is an alternate idea where a visitor flicks the broken address into orbit.

## Where to start in the repo

- New standalone pages belong in [the site’s pages directory](../site/src/pages/). The [base layout](../site/src/layouts/_BaseLayout.astro) supplies shared chrome.
- [The catalogue guide](../site/src/components/home/README.md) describes the project objects, layout registry, and section links. [Project entries](../site/src/content/works/) contain the real preview media and descriptions.
- [Nib’s guide](../site/src/lib/pet/README.md) covers gestures, state, and rendering. [The wordmark code](../site/src/components/UtofWordmark.astro) and [motion preference](../site/src/lib/motion.ts) are shared.
- Check `_local/dynamic-identity/` for existing doodle artwork and GIFs and `_local/tactical-arena-cs2/selection/` for clip candidates. These are local archive paths. Pick the artifacts before moving anything into published assets.
- [The 404 route](../site/src/pages/404.astro), [ASCII painter](../site/src/lib/not-found-art.ts), and [motion controller](../site/src/lib/not-found-motion.ts) hold the current error-page implementation. [Brik’s ASCII gallery](https://brik.space/gallery/ascii) has the visual reference.

For another round of research, browse [PersonalSit.es](https://personalsit.es/), [Slash Pages](https://slashpages.net/), [32-Bit Cafe](https://32bit.cafe/cyowebsite/), and [Ye Olde Blogroll](https://blogroll.org/).
