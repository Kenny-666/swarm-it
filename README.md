# Swarmline

**Watch a swarm draw any web page as a blueprint.**

![Swarmline drawing a page](store/marquee-1400x560.png)

Swarmline is a Chrome extension. Click it on any page and a blueprint sheet with a drafting grid and rulers covers the page. A swarm of glowing pen-nibs then drafts the elements in reading order: they trace each box with corner marks and size labels, write text in line by line, and scan images in over wireframe placeholders. As each sheet finishes it sweeps open onto the real page underneath. With Auto-tour on, Swarmline glides down the page sheet by sheet until the blueprint lifts away.

Because it reveals the real page rather than rebuilding a copy, the result is always exactly the live site: fonts, scroll effects, GSAP and CSS animations, video, canvases and links keep working throughout.

## Install (development)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the [`extension/`](extension) folder.
3. Pin Swarmline from the puzzle-piece menu.

## Use

| | |
| --- | --- |
| **Alt+Shift+L** or the toolbar button | Start (again to exit) |
| **Auto-tour** / **T** | Glide through the page sheet by sheet |
| **1× / 2× / 3×** | Drafting speed |
| **Finish** / **F** | Lift the blueprint now |
| **Esc** / **✕** | Exit |

You can also scroll yourself: Swarmline drafts whatever comes to rest on screen. With *prefers-reduced-motion* it drafts at 3× and the tour jumps instead of gliding.

## How it works

[`swarmline.js`](extension/swarmline.js) is one dependency-free content script:

1. **Sheet.** A full-screen `<canvas>` inside a closed shadow root covers the page: sheet colour, a 10/50 px drafting grid that scrolls with the page, and rulers.
2. **Scan.** When the page comes to rest, the visible part of the DOM (including open shadow roots) is turned into *units*: boxes (anything that paints a background, border or shadow), text blocks (their actual line boxes, with split-text letters merged back into lines), media, form controls and icon-font glyphs.
3. **Draft.** Units start in reading order, a few at a time, each with a crew of one to three nibs from the swarm; work waits briefly for its nib to arrive, and the nib then rides the head of the stroke, the text cursor or the image scan line. A child waits for its parent's outline, and a box fills only after its children are done. Each unit's progress punches an opening in the sheet (`destination-out`) shaped like that element (rounded corners, the line being written, a scan line moving down an image), and outlines, labels, cursors, guides and dimensions are drawn on top.
4. **Sweep.** When everything on screen is drafted, the rest of the screen (backgrounds, decoration, anything that isn't an element of its own) sweeps open.
5. **Tour and finish.** Auto-tour eases to the next sheet once the page is still. At the bottom, with every sheet open, the blueprint fades away and the HUD shows a summary with **Replay**.

Positions are read live every frame, so sticky headers, scroll-linked animations, carousels and inner-scrolling app layouts stay lined up.

## Project layout

| Path | What it is |
| --- | --- |
| `extension/` | The extension: `manifest.json` (MV3, `activeTab` + `scripting` only), `background.js`, `swarmline.js`, `icons/` |
| `demo/index.html` | Self-contained demo page (a fictional studio) used for testing and store screenshots |
| `store/` | Store listing copy, icon, screenshots and promo tiles |
| `scripts/make-assets.mjs` | Renders the icons, screenshots and promo tiles |
| `scripts/package.mjs` | Builds `dist/swarmline-<version>.zip` for the Web Store |
| `tests/smoke.mjs` | Runs Swarmline on a page with Auto-tour; frames, timings and frame rate in `tests/out/` |
| `tests/extension.mjs` | Loads the real unpacked extension and checks start, Finish, Esc and toggle |

## Development

Needs Node.js 20+ and Chrome.

```sh
npm install
npm run check      # syntax check
npm run lint       # ESLint
npm test           # smoke test on the demo page
npm run test:site  # smoke test on a heavy real site (GSAP, Lenis, marquees)
npm run test:ext   # real extension test
npm run assets     # icons, screenshots, promo tiles
npm run package    # dist/swarmline-<version>.zip
```

## Publishing

1. `npm run assets && npm run package`.
2. In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), create a new item and upload `dist/swarmline-1.0.0.zip`.
3. Fill in the listing from [`store/LISTING.md`](store/LISTING.md), upload the images in `store/`, and link a public copy of [`PRIVACY.md`](PRIVACY.md) (add your contact details to it first).

## Limits

- Chrome doesn't allow extensions on `chrome://` pages, the Web Store or the PDF viewer; the button shows a × there.
- The page can't be clicked while it's being drafted (so you can't hit a link you can't see); it's fully interactive again once the blueprint lifts.
- Pages longer than about 3,000 elements are drafted in coarser pieces past that point (the sheet sweep still reveals everything).
