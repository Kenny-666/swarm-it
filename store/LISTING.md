# Chrome Web Store listing: Swarm It!

Everything to paste into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), field by field. It matches what the extension actually does. See [`PUBLISHING.md`](../PUBLISHING.md) for the order to do things in.

---

## Package

Upload `dist/swarmline-1.0.1.zip` (build it with `npm run package`).

## Store listing tab

### Product details

| Field | Value |
| --- | --- |
| **Title** (from the manifest) | Swarm It! – Watch Any Website Build Itself |
| **Summary** (from the manifest) | 一键启动，鼠标指针群实时搭建任意网站：绘制方框、输入文字、复制组件，随后即可直接使用。 |
| **Category** | Developer Tools |
| **Language** | English |

### Description

Paste this as-is:

```
One click and any website becomes a blank canvas. Then a swarm of cursors builds it back, live, right in front of you, the way designers work in a design tool.

How the swarm builds a page:
• Every box, card and section is dragged out with a crosshair, with a live size readout and selection handles, then fills in for real
• Text boxes are dragged out and typed letter by letter beside a parked I-beam, big headlines included; some headings start small and grow into size
• As a box is dragged out, its edges sometimes run across the screen as guide lines; rulers slide in, red alignment guides are pulled out, and text is nudged onto them until it snaps
• Dividers are drawn with the pen tool, click by click
• Image frames are dragged out as placeholders with a picture icon, then the picture scans into place
• Repeated parts are built once and then duplicated: cards, list rows, nav links and icons are Alt-dragged as copies with the spacing measured, and each copy is edited, its words selected and retyped, a different image or colour swapped in
• When the page is done it's fully live again, and the swarm follows your own mouse pointer until you exit

Everything appears in place on the real page, in the site's own colours and fonts, so the finished page is exactly the live site, with its animations, video and links all working.

Made for recording:
• Auto-tour is on from the start: the page scrolls in one smooth glide as it's built, slowing for each section and speeding up once it's done (T turns it off so you can scroll yourself)
• The toolbar shows the live crew: the site's icon, the avatars of the agents at work and how many there are, rising and falling with each section
• Choose 1×, 2× or 3× speed, or press Finish to show the whole page at once
• Press H to hide the controls for a clean take, or drag the control bar anywhere
• A soft, generated soundtrack plays along (M turns it off)

Great for:
• Screen recordings, reels and launch videos of your own website
• Showing clients how a page is put together
• Design and front-end demos and walkthroughs
• Teaching layout and visual hierarchy

Private by design: Swarm It! runs only on the tab you start it on and sends nothing anywhere. It stores only your local animation preferences; when you exit, the page is exactly as it was.

Shortcuts: Alt+Shift+L start or stop · T auto-tour · F finish · M sound · H hide or show the controls · Esc exit.

Inspired by Swarm by Joel Califa and Swarm Rebuild by Dhvanil Patel.
```

### Graphic assets (all in `store/`)

| Field | File | Size |
| --- | --- | --- |
| Store icon | `store-icon-128.png` | 128×128 (96 px artwork, transparent margin) |
| Screenshot 1 | `screenshot-1.png`: “Every box drawn by hand” | 1280×800 |
| Screenshot 2 | `screenshot-2.png`: “Build one. Duplicate the rest.” | 1280×800 |
| Screenshot 3 | `screenshot-3.png`: “Then change the details” | 1280×800 |
| Screenshot 4 | `screenshot-4.png`: “Typed, then snapped into place” | 1280×800 |
| Screenshot 5 | `screenshot-5.png`: “Live again in seconds” | 1280×800 |
| Small promo tile | `promo-440x280.png` | 440×280 |
| Marquee promo tile | `marquee-1400x560.png` | 1400×560 |
| Promo video | optional: a YouTube link to a screen recording of Swarmline on your own site | |

Upload the screenshots in that order. Each is a real moment of Swarmline building `demo/showcase.html` (Quillwave, a fictional SaaS product, so no real company's site or branding appears), captured the instant it happens and framed with a caption. Regenerate everything with `npm run assets`.

### Additional fields

| Field | Value |
| --- | --- |
| Official URL | (leave empty unless you verify a domain in Search Console) |
| Homepage URL | https://imperfec-t.github.io/swarmline/ |
| Support URL | https://imperfec-t.github.io/swarmline/support.html |
| Mature content | No |

## Privacy practices tab

**Single purpose description:**

```
Swarmline plays an animation of the current web page being built by a swarm of cursors: it temporarily hides the page's elements and brings them back one by one (drawing boxes, typing text, duplicating repeated parts) until the live page is fully shown again.
```

**Permission justifications:**

| Permission | Justification (paste) |
| --- | --- |
| `activeTab` | Lets Swarmline run on the tab where the user clicks the toolbar button or presses the shortcut, and only then. It has no access to any other tab or site. |
| `scripting` | Injects Swarmline's bundled script (swarmline.js) into that tab to play the build animation over the page. |
| `storage` | Saves only local preferences for control visibility, auto-tour, speed, sound and the first-use shortcut hint. It does not store website content or personal data. |

**Host permissions:** none requested.

**Are you using remote code?** No, I am not using remote code. (All code is in the package; nothing is downloaded or evaluated at runtime.)

**Data usage:** tick none of the data types (Swarmline collects nothing), then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://imperfec-t.github.io/swarmline/privacy.html

## Distribution tab

| Field | Value |
| --- | --- |
| Payments | Free of charge |
| Visibility | Public |
| Regions | All regions |
