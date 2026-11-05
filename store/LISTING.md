# Chrome Web Store listing: Swarmline

Everything to paste into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), field by field. It matches what the extension actually does. See [`PUBLISHING.md`](../PUBLISHING.md) for the order to do things in.

---

## Package

Upload `dist/swarmline-1.0.0.zip` (build it with `npm run package`).

## Store listing tab

### Product details

| Field | Value |
| --- | --- |
| **Title** (from the manifest) | Swarmline – Watch Any Website Build Itself |
| **Summary** (from the manifest) | One click and a swarm of cursors rebuilds any website, live: boxes drawn, text typed, copies dragged, then it goes live. |
| **Category** | Developer Tools |
| **Language** | English |

### Description

Paste this as-is:

```
One click and any website is wiped to a blank design canvas. Then a swarm of multiplayer cursors rebuilds it, live, right in front of you.

The cursors work the way designers do in a design tool:

• Rectangles are drawn with a crosshair, with live size readouts and selection handles
• Text is typed letter by letter and snapped to alignment guides
• Lines and dividers are drawn with the pen tool
• Repeated parts (cards, rows, icons) are built once, then Alt-dragged as copies, with the spacing measured, and edited
• Images are placed into their frames, and the page's own animations keep moving
• When the build is done, press Go live to fade back to the real page; until then the swarm follows your mouse

Touring is on from the start, so the page scrolls along as it's built. Press T to turn it off and scroll yourself. Choose 1×, 2× or 3× speed, and turn the build's sound on or off.

Credits: Swarmline runs on the Swarm Rebuild engine by Dhvanil Patel, a tribute to Swarm by Joel Califa. Used with permission.

Great for:
• Screen recordings, reels and launch videos of your own website
• Showing clients how a page is put together
• Design and front-end demos and walkthroughs
• Teaching layout and visual hierarchy

Private by design: Swarmline runs only on the tab you start it on, sends nothing anywhere and stores nothing. When you exit, the page is exactly as it was.

Shortcuts: Alt+Shift+L start or stop · T tour · M sound · H hide or show the controls (for clean recordings) · Esc exit. Drag the control bar to move it anywhere.
```

### Graphic assets (all in `store/`)

| Field | File | Size |
| --- | --- | --- |
| Store icon | `store-icon-128.png` | 128×128 (96 px artwork, transparent margin) |
| Screenshots (upload all four, in order) | `screenshot-1.png` … `screenshot-4.png` | 1280×800 |
| Small promo tile | `promo-440x280.png` | 440×280 |
| Marquee promo tile | `marquee-1400x560.png` | 1400×560 |
| Promo video | optional: a YouTube link to a screen recording of Swarmline on your own site | |

The screenshots show Swarmline building `demo/index.html`, a page for a fictional studio, so no real company's site or branding appears in the listing. Regenerate everything with `npm run assets`.

### Additional fields

| Field | Value |
| --- | --- |
| Official URL | (leave empty unless you verify a domain in Search Console) |
| Homepage URL | https://tauquirshayaan.github.io/swarmline/ |
| Support URL | https://tauquirshayaan.github.io/swarmline/support.html |
| Mature content | No |

## Privacy practices tab

**Single purpose description:**

```
Swarmline plays an animation of the current web page being rebuilt by a swarm of cursors (drawing boxes, typing text, placing images), then fades back to the live page.
```

**Permission justifications:**

| Permission | Justification (paste) |
| --- | --- |
| `activeTab` | Lets Swarmline run on the tab where the user clicks the toolbar button or presses the shortcut, and only then. When that tab shows video, canvas or embedded frames, it takes one screenshot of the visible tab, used only on the device to show those pixels during the animation. It has no access to any other tab or site. |
| `scripting` | Injects Swarmline's bundled scripts (swarmline.js, and settle.js in the page's own world to finish the page's scroll animations) and a temporary style into that tab to play the build animation. |

**Host permissions:** none requested.

**Are you using remote code?** No, I am not using remote code. (All code is in the package; nothing is downloaded or evaluated at runtime.)

**Data usage:** tick none of the data types (Swarmline collects nothing), then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://tauquirshayaan.github.io/swarmline/privacy.html

## Distribution tab

| Field | Value |
| --- | --- |
| Payments | Free of charge |
| Visibility | Public |
| Regions | All regions |
