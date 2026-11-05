# Swarmline

**Watch a swarm build any website, live, in your browser.**

![Swarmline building a page](store/marquee-1400x560.png)

Swarmline is a Chrome extension. Click it on any page and the page is wiped to a blank design canvas, with rulers. A swarm of multiplayer cursors then rebuilds it, live, the way designers work in a design tool: rectangles drawn with a crosshair, text typed with an I-beam and snapped to guides, lines drawn with the pen tool, repeated components alt-dragged as copies and then edited, images placed. When it's done, **Go live** fades back to the real page, and until then the swarm follows your mouse.

**Credits.** Swarmline runs on the **Swarm Rebuild** engine by **Dhvanil Patel** ([swarm-cursors](https://github.com/DhvanilPatel/swarm-cursors)), a tribute to **[Swarm](https://califa.github.io/swarm-site/)** by **[Joel Califa](https://joelcalifa.com)**, whose animation engine it adapts. Used with permission. See [NOTICE.md](NOTICE.md).

**Website:** https://tauquirshayaan.github.io/swarmline/ · **Privacy:** [PRIVACY.md](PRIVACY.md) · **License:** [LICENSE](LICENSE) (MIT for Swarmline's own files; the engine stays its authors', see NOTICE)

## Install (development)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the [`extension/`](extension) folder (the one with `manifest.json`; not `dist/`).
3. Pin Swarmline from the puzzle-piece menu.

## Use

| | |
| --- | --- |
| **Alt+Shift+L** or the toolbar button | Start (again to stop) |
| **Touring** / **T** | Auto-scroll while the swarm builds (on by default) |
| **1× / 2× / 3×** | Build speed |
| **Sound** / **M** | Turn the build's sound on or off |
| **H** / eye button | Hide the controls for a clean screen recording (H brings them back) |
| Drag the bar | Move the controls anywhere; double-click the bar to put it back |
| **Go live** | Fade back to the real page when the build is done |
| **Replay** | Wipe and rebuild again |
| **Esc** / **✕** | Exit (the page is restored exactly) |

Turn the tour off to scroll yourself: the swarm keeps building what you scroll to.

## How it works

- [`background.js`](extension/background.js): on a click it checks for visible video, canvas or iframes, takes one screenshot of the visible tab so those pixels can be shown during the rebuild, then injects the engine. It also runs `settle.js` in the page's own world when the engine asks.
- [`settle.js`](extension/settle.js): finishes scroll-reveal animations (GSAP ScrollTrigger and similar) before the page is read, and describes looping ones so the rebuild can keep them moving.
- [`swarmline.js`](extension/swarmline.js): the engine. It scrolls the page once so lazy content loads, captures the page into a model (boxes, text, media, lines, repeated components, guides), blanks it, and runs the cursor swarm in a closed shadow root over the page.

Everything runs on your device. Nothing is sent anywhere or stored.

## Project layout

| Path | What it is |
| --- | --- |
| `extension/` | The extension: `manifest.json` (MV3, `activeTab` + `scripting` only), `background.js`, `swarmline.js`, `settle.js`, `icons/` |
| `site/` | The public website: homepage, privacy policy, support (deployed to GitHub Pages) |
| `store/` | Store listing copy ([`LISTING.md`](store/LISTING.md)), icon, screenshots, promo tiles |
| `demo/index.html` | Self-contained demo page (a fictional studio) used for testing and store screenshots |
| `scripts/` | `make-assets.mjs` (graphics), `package.mjs` (store zip), `preflight.mjs` (pre-submission checks), `configure.mjs`, `build-site.mjs` |
| `tests/` | `smoke.mjs` (runs it on a page with Tour; screenshots, timings) and `extension.mjs` (the real extension) |
| `PUBLISHING.md` | Step-by-step: from this folder to a live Web Store listing |

## Development

Needs Node.js 20+ and Chrome.

```sh
npm install
npm run check       # syntax check
npm run lint        # ESLint
npm test            # smoke test on the demo page
npm run test:site   # smoke test on a heavy real site
npm run test:ext    # real extension test
npm run assets      # icons, screenshots, promo tiles, site images
npm run package     # dist/swarmline-<version>.zip
npm run preflight   # every check the store submission needs
```

## Limits

- Chrome doesn't allow extensions on `chrome://` pages, the Web Store or the PDF viewer; the button shows a × there.
- Very long pages are captured up to a limit; the rest appears when you go live.
