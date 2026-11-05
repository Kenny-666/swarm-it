# Publishing Swarmline to the Chrome Web Store

Everything in this folder is ready. These are the steps only you can do (accounts, payment, review). Allow about an hour, then a few days for Google's review.

## 0. Before you start

- [x] Support email set to **imperfxt@gmail.com** (shown on the website and privacy policy). To change it later:
      ```sh
      npm run configure -- --email new@example.com
      ```
- [ ] Run the full check. It must say **READY** (this also rebuilds the five store screenshots from real moments of a build):
      ```sh
      npm install
      npm run assets && npm run package && npm run preflight
      ```

## 1. Put the code and website on GitHub (for the privacy policy URL)

The store requires a public privacy policy page, and the site in `site/` provides it.

1. Create a **public** repository named **`swarmline`** on github.com (account `Tauquirshayaan`). Don't add a README or license; this folder already has them.
2. From this folder:
   ```sh
   git remote add origin https://github.com/Tauquirshayaan/swarmline.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open the **Actions** tab and wait for **Website** to go green (re-run it once if it ran before step 3).
5. Check these three pages load:
   - https://tauquirshayaan.github.io/swarmline/
   - https://tauquirshayaan.github.io/swarmline/privacy.html
   - https://tauquirshayaan.github.io/swarmline/support.html

## 2. Register as a Chrome Web Store developer (once)

1. Go to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) and sign in with the Google account you want to publish under.
2. Accept the developer agreement and pay the one-time registration fee.
3. In **Account**, set the **publisher name** and **contact email** (use imperfxt@gmail.com), and verify the email (Google sends a link). Submission isn't possible until the contact email is verified.

## 3. Create the item

1. **Items → New item → upload `dist/swarmline-1.0.0.zip`**.
2. Fill in each tab using [`store/LISTING.md`](store/LISTING.md), which has every value ready to paste:
   - **Store listing:** description, category (Developer Tools), language, the store icon, five screenshots (in order), small promo tile and marquee tile, homepage and support URLs.
   - **Privacy:** the single purpose text, the two permission justifications, "No" to remote code, no data types collected, tick the three certifications, and the privacy policy URL.
   - **Distribution:** free, public, all regions.
3. Press **Submit for review**. Review usually takes a few days; you'll get an email.

## 4. After it's approved

1. Copy the extension's store address (it looks like `https://chromewebstore.google.com/detail/swarmline/<id>`).
2. Point the website's **Add to Chrome** buttons at it and publish:
   ```sh
   npm run configure -- --store-url https://chromewebstore.google.com/detail/swarmline/<id>
   git commit -am "Link the store listing" && git push
   ```

## Shipping an update later

1. Make the change, then bump `"version"` in `extension/manifest.json` (for example `1.0.1`) and in `package.json`.
2. `npm test && npm run test:ext && npm run assets && npm run package && npm run preflight`
3. Dashboard → your item → **Package → Upload new package** → `dist/swarmline-<version>.zip` → **Submit for review**.

## Common rejection reasons (already handled)

| Reason | How Swarmline avoids it |
| --- | --- |
| Excessive permissions | Only `activeTab` and `scripting`; no host permissions, no always-on content scripts |
| Missing or vague single purpose | One clear purpose, stated in the listing and the manifest summary |
| No privacy policy / mismatched data disclosures | Public policy page; the code makes no network calls and stores nothing (checked by `npm run preflight`) |
| Remote code | All code is bundled; preflight checks for `eval`, `new Function` and remote scripts |
| Misleading or copied branding | Original name, icon, artwork and animation; screenshots use a fictional demo site |
| Keyword stuffing | The description is plain prose with no keyword lists |
