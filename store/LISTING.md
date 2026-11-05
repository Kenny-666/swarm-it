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
| **Summary** (from the manifest, 113 / 132 characters) | One click and a swarm builds any website live: boxes traced, text typed, images scanned in, then it’s live again. |
| **Category** | Developer Tools |
| **Language** | English |

### Description

Paste this as-is:

```
One click and any website becomes a blank canvas. Then a swarm builds it back, live, right in front of you.

Swarmline sends a swarm of cursors across the page, working the way designers do in a design tool, in reading order:

• Boxes, cards and sections are dragged out with a crosshair, with a live size readout and selection handles, then fill in for real
• Dividers are drawn with the pen tool, click by click
• Rulers slide in, red alignment guides are pulled out, and text snaps onto them
• Cards, list rows and other repeated parts are built once, then Alt-dragged as copies into place, with the spacing measured, and only what differs is retyped
• Text boxes are dragged out and typed letter by letter; big headlines grow into size
• Image and video frames are dragged out, then the picture scans into place
• Buttons, icons and form fields pop in where they belong
• When the page is finished, the swarm follows your own mouse pointer until you exit

Everything appears in place on the real page, in the site's own colours and fonts. Nothing is copied or redrawn, so the finished page is exactly the live site, with its animations, video and links all working.

Auto-tour is on from the start: Swarmline glides down the page screen by screen, centring each one before the swarm builds it, and moves on the moment a screen is finished. Press T to turn it off and scroll yourself. Choose 1×, 2× or 3× speed, or press Finish to show the whole page at once.

Great for:
• Screen recordings, reels and launch videos of your own website
• Showing clients how a page is put together
• Design and front-end demos and walkthroughs
• Teaching layout and visual hierarchy

Private by design: Swarmline runs only on the tab you start it on, sends nothing anywhere and stores nothing. When you exit, the page is exactly as it was.

Shortcuts: Alt+Shift+L start or stop · T auto-tour · F finish · M sound · H hide or show the controls (for clean recordings) · Esc exit. Drag the control bar to move it anywhere.

Credits: the cursor motion and build style follow Swarm Rebuild by Dhvanil Patel, a tribute to Swarm by Joel Califa. Used with permission.
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
Swarmline animates the current web page being built: it temporarily hides the page's elements and brings them back one by one with a swarm animation (tracing boxes, typing text, revealing images) until the live page is fully shown again.
```

**Permission justifications:**

| Permission | Justification (paste) |
| --- | --- |
| `activeTab` | Lets Swarmline run on the tab where the user clicks the toolbar button or presses the shortcut, and only then. It has no access to any other tab or site. |
| `scripting` | Injects Swarmline's bundled script (swarmline.js) into that tab to play the build animation over the page. |

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
