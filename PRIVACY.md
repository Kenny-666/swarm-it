# Privacy policy: Swarmline

_Last updated: November 6, 2026 · version 1.0.0_

Swarmline is a Chrome extension that plays an animation of the current web page being built by a swarm. It does not collect, store, sell or share any personal data.

- **It only runs when you ask.** Swarmline uses Chrome's `activeTab` permission, so it can access only the tab where you click its toolbar button or press its shortcut, and only at that moment. It has no access to your other tabs, your browsing history, or any site you haven't started it on.
- **Everything happens on your device.** To play the animation, Swarmline scrolls the page once so lazy-loaded content appears, reads the page in your browser (where elements are, their text, sizes, colours and images) and rebuilds it as an animation over the page. If the visible part of the page has video, canvas or embedded frames, Swarmline takes one screenshot of the visible tab so those pixels can be shown during the animation. All of this is used only for the animation, stays in that tab's memory, and is discarded when the animation ends, when you exit, or when you leave the page. The page is always left exactly as it was.
- **No network requests.** Swarmline doesn't contact any server, doesn't use analytics or tracking, and doesn't load remote code.
- **No storage.** Nothing is saved to cookies, `localStorage`, `chrome.storage` or anywhere else.
- **No accounts, no ads, no selling of data.**

## Permissions

| Permission | Why it's needed |
| --- | --- |
| `activeTab` | Run on the tab you started Swarmline on, and only that tab, and take the one screenshot of it described above. |
| `scripting` | Add Swarmline's bundled animation scripts (and a temporary style) to that tab. |

## Children

Swarmline doesn't collect information from anyone, including children.

## Changes

If this policy changes, the new version will be published at the same address with a new date.

## Contact

Questions about privacy: see the contact details on the [support page](https://tauquirshayaan.github.io/swarmline/support.html).
