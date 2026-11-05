# Chrome Web Store listing: Draftline

Copy for the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). Everything here matches what the extension actually does.

## Store listing tab

**Name** (from the manifest): Draftline – Blueprint Page Builder

**Summary** (132 characters max, from the manifest):
Watch any web page draw itself as a blueprint: outlined, measured and revealed, then live again.

**Category:** Developer Tools *(alternative: Fun)*

**Language:** English

**Description:**

> Draftline turns any web page into a living blueprint, then draws it back, one element at a time.
>
> Click the toolbar button (or press Alt+Shift+D) and the page is covered by a blueprint sheet with a drafting grid and rulers. Draftline then works through the page in reading order:
>
> • Boxes and cards are outlined with precise strokes, corner marks and size labels
> • Headlines and paragraphs are written in, line by line
> • Images and video scan in over classic wireframe placeholders
> • Dimension lines and guides follow the element being drafted
> • Each finished sheet sweeps open to show the real page underneath
>
> Turn on Auto-tour and Draftline glides down the page sheet by sheet, centring each one before drawing it. Choose 1×, 2× or 3× speed, or press Finish to lift the blueprint at any time.
>
> Because Draftline reveals the real page, not a copy, everything you see at the end is the live site: its fonts, animations, video, canvases, scroll effects and links all keep working.
>
> Great for:
> • Design and front-end walkthroughs, demos and screen recordings
> • Showing clients how a page is put together
> • Teaching layout, spacing and visual hierarchy
> • Making a launch video of your own site
>
> Private by design: Draftline only runs on the tab you click it on, never sends anything anywhere, and stores nothing.
>
> Shortcuts: Alt+Shift+D start · T auto-tour · F finish · Esc exit.

**Graphics** (all in this folder):

| Asset | File | Size |
| --- | --- | --- |
| Store icon | `store-icon-128.png` | 128×128 (96px artwork, transparent margin) |
| Screenshots | `screenshot-1.png`, `screenshot-2.png`, `screenshot-3.png` | 1280×800 |
| Small promo tile | `promo-440x280.png` | 440×280 |
| Marquee promo tile | `marquee-1400x560.png` | 1400×560 |

The screenshots show Draftline drawing `demo/index.html`, a page for a fictional studio, so no real company's site or branding appears in the listing. Regenerate everything with `npm run assets`.

## Privacy practices tab

**Single purpose:**
Draftline draws the current web page as an animated blueprint, revealing its elements one by one until the live page is shown again.

**Permission justifications:**

- `activeTab`: Lets Draftline run on the tab the user clicks the toolbar button on (or presses the shortcut in), and only then. Draftline has no access to any other tab or site.
- `scripting`: Injects Draftline's bundled script (`draftline.js`) into that tab to draw the blueprint overlay and its animation.

**Host permissions:** none.

**Remote code:** No. All code is bundled in the package; nothing is downloaded or evaluated at runtime.

**Data usage:** Draftline does not collect or transmit any user data. Tick none of the data-type boxes, then certify:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** publish [`PRIVACY.md`](../PRIVACY.md) somewhere public (for example the repository on GitHub, or GitHub Pages) and paste its URL.

## Distribution tab

Public · all regions · free.
