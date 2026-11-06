# Swarmline

**Watch a swarm build any website, live, in your browser.**

![Swarmline building a page](store/marquee-1400x560.png)

Swarmline is a Chrome extension. Click it on any page and the page becomes a blank canvas in its own colours. A swarm of cursors then builds it back in reading order, the way designers work in a design tool: a crosshair drags out each box (with handles and a live size badge) before the real one fills in; text boxes are dragged out and typed beside a parked I-beam, and big headings grow into size; dividers are drawn with the pen tool; rulers slide in while red alignment guides are pulled out, and text is dragged onto them until it snaps; image frames are dragged out and the picture scans in. Repeated components (cards in a grid, rows in a list, nav links, tabs, tags, icons) are built once, then Alt-dragged as copies with the gap measured; each copy lands showing the original's words, which are double-clicked, selected and retyped, and a different image or colour is swapped in with a click. Spare cursors wander, slip off-screen when they're not needed and come back when work appears, and when the page is done they orbit your own mouse pointer until you exit. Builds have a soft mallet soundtrack (M turns it off).

**Credits.** Swarmline's cursor motion and build style follow **Swarm Rebuild** by **Dhvanil Patel** ([swarm-cursors](https://github.com/DhvanilPatel/swarm-cursors)), a tribute to **[Swarm](https://califa.github.io/swarm-site/)** by **[Joel Califa](https://joelcalifa.com)**. Those parts are adapted with permission; see [NOTICE.md](NOTICE.md).

Everything appears in place on the real page, so the result is always exactly the live site: its fonts, GSAP and CSS animations, video, canvases and links keep working throughout.

**Website:** https://imperfec-t.github.io/swarmline/ · **Privacy:** [PRIVACY.md](PRIVACY.md) · **License:** [LICENSE](LICENSE) (MIT for Swarmline's own code; the adapted parts stay their authors', see NOTICE)

## Install (development)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the [`extension/`](extension) folder (the one with `manifest.json`; not `dist/`).
3. Pin Swarmline from the puzzle-piece menu.

## Use

| | |
| --- | --- |
| **Alt+Shift+L** or the toolbar button | Start (again to stop) |
| **Auto-tour** / **T** | Glide through the page screen by screen (on by default; T turns it off) |
| **1× / 2× / 3×** | Build speed |
| **Finish** / **F** | Show the finished page now |
| **H** / eye button | Hide the controls for a clean screen recording (H brings them back) |
| Drag the bar | Move the controls anywhere; double-click the bar to put it back |
| **Sound** / **M** | Turn the build's sound on or off |
| **Esc** / **✕** | Exit (the page is restored exactly) |

Turn the tour off to scroll yourself: the swarm builds whatever comes to rest on screen. With *prefers-reduced-motion* it builds at 3× with a smaller swarm, and the tour jumps instead of gliding.

## How it works

[`swarmline.js`](extension/swarmline.js) is one dependency-free content script:

1. **Blank canvas.** The page fades to its own background colour. A small stylesheet hides every element (`visibility: hidden`, so the layout never moves) except the ones the swarm has put back, which carry a marker attribute. The page keeps running underneath.
2. **Scan.** When the page comes to rest, the visible part of the DOM (including open shadow roots) is read into *units*: boxes (anything that paints a background, border or shadow), text blocks (their real line boxes and letter positions, with split-text letters merged back into lines), media, form controls and icon-font glyphs.
3. **Build.** Units start in reading order, each with a crew of one to four nibs from the swarm. A crew traces a box's outline with a live size badge, then the real box fades in; text is typed by clipping the real element to the letters written so far (`clip-path: path(…)`) with a caret in the crew's colour; images and canvases scan in with a clip animation while the crew rides the scan line. A child waits for the box it sits in.
4. **Sweep.** When everything on screen is built, anything still hidden there (wrapper backgrounds, decoration) comes in top to bottom behind a light line that the idle swarm rides.
5. **Tour and finish.** Auto-tour eases to the next screen once the page is still. At the end the stylesheet and markers are removed, the page is fully interactive again, the swarm follows your mouse pointer, and the HUD shows a summary with **Replay**.

The swarm, outlines, badges and caret are drawn on a transparent `<canvas>` in a closed shadow root above the page. Exiting at any point (or any error) removes everything Swarmline added.

## Project layout

| Path | What it is |
| --- | --- |
| `extension/` | The extension: `manifest.json` (MV3, `activeTab` + `scripting` only), `background.js`, `swarmline.js`, `icons/` |
| `site/` | The public website: homepage, privacy policy, support (deployed to GitHub Pages) |
| `store/` | Store listing copy ([`LISTING.md`](store/LISTING.md)), icon, screenshots, promo tiles |
| `demo/index.html` | Self-contained demo page (a fictional studio) used for testing and store screenshots |
| `scripts/` | `make-assets.mjs` (graphics), `package.mjs` (store zip), `preflight.mjs` (pre-submission checks), `set-email.mjs` |
| `tests/` | `smoke.mjs` (runs it on a page with Auto-tour; frames, timings, frame rate) and `extension.mjs` (the real extension) |
| `PUBLISHING.md` | Step-by-step: from this folder to a live Web Store listing |

## Development

Needs Node.js 20+ and Chrome.

```sh
npm install
npm run check       # syntax check
npm run lint        # ESLint
npm test            # smoke test on the demo page
npm run test:site   # smoke test on a heavy real site (GSAP, Lenis, marquees)
npm run test:ext    # real extension test
npm run assets      # icons, screenshots, promo tiles, site images
npm run package     # dist/swarmline-<version>.zip
npm run preflight   # every check the store submission needs
```

## Publishing

See [PUBLISHING.md](PUBLISHING.md).

## Limits

- Chrome doesn't allow extensions on `chrome://` pages, the Web Store or the PDF viewer; the button shows a × there.
- The page can't be clicked while it's being built (so you can't hit a link you can't see); it's fully interactive again when the build finishes.
- Past about 3,000 elements the page is built in coarser pieces (the end-of-screen sweep still brings everything back).
