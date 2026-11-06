# Publishing Swarmline

Everything to upload is already built and checked. This guide covers the parts only you can do: accounts, the fee and the review. It takes about an hour, then Google usually reviews in a few days.

## Where everything is

All paths are inside `H:\swarm design\swarmline`.

| What | Where | Used for |
| --- | --- | --- |
| **The extension package** | `dist\swarmline-1.0.0.zip` | Upload to the Chrome Web Store (built by `npm run package`) |
| **Listing text, ready to paste** | `store\LISTING.md` | Every field of the store dashboard: description, privacy answers, URLs |
| Store icon | `store\store-icon-128.png` | Store listing → Store icon |
| Screenshots 1–5 | `store\screenshot-1.png` … `screenshot-5.png` | Store listing → Screenshots (upload in order) |
| Small promo tile | `store\promo-440x280.png` | Store listing → Small promo tile |
| Marquee promo tile | `store\marquee-1400x560.png` | Store listing → Marquee promo tile |
| Website (home, privacy, support) | `site\` (built copy in `dist\site\`) | Published to GitHub Pages automatically when you push |
| Privacy policy | `PRIVACY.md`, and the web page `site\privacy.html` | The store's privacy policy URL points at the web page |
| Extension source | `extension\` (`manifest.json`, `background.js`, `swarmline.js`, `icons\`) | What's inside the zip |
| Demo pages | `demo\showcase.html` (screenshots), `demo\index.html` (tests) | Quillwave, a fictional SaaS product the screenshots are taken from, and a fictional studio site the tests run on |
| Build and check scripts | `scripts\` | `assets`, `package`, `site`, `configure`, `preflight` |
| Tests | `tests\` | `npm test`, `npm run test:ext` |
| Credits and licence | `NOTICE.md`, `LICENSE` | Credits Swarm Rebuild (Dhvanil Patel) and Swarm (Joel Califa) |
| Website settings | `site.config.json` | Support email, store link, repo and site URLs (change them with `npm run configure`) |
| Pages deploy | `.github\workflows\pages.yml` | Builds and publishes the website on every push |

Not uploaded anywhere: `node_modules\` (tools for building and testing) and `store\raw\` (raw captures used to make the screenshots, ignored by git).

## Your details (already filled in everywhere)

| | |
| --- | --- |
| Publisher name | imperfxt |
| Account type | Non-trader |
| Contact and support email | imperfxt@gmail.com |
| GitHub | imperfec-t, repo `swarmline` |
| Homepage | https://imperfec-t.github.io/swarmline/ |
| Support page | https://imperfec-t.github.io/swarmline/support.html |
| Privacy policy | https://imperfec-t.github.io/swarmline/privacy.html |

## Step 0: final check (2 minutes)

In a terminal in this folder:

```sh
npm install
npm run assets && npm run package && npm run preflight
```

It must end with **READY: 0 failing**. One warning ("storeUrl not set yet") is expected until the store link exists in step 5. `npm run assets` regenerates the five screenshots from real moments of a build, so run it again whenever the look changes.

## Step 1: put the code on GitHub (10 minutes)

The store needs a public privacy policy page, and the website in `site\` provides it.

1. Sign in to github.com as **imperfec-t**. Click **+ → New repository**.
2. Repository name: **`swarmline`**. Set it to **Public**. Leave "Add a README", ".gitignore" and "license" **unticked**, because this folder already has them. Click **Create repository**.
3. In a terminal in this folder:
   ```sh
   git remote add origin https://github.com/imperfec-t/swarmline.git
   git push -u origin main
   ```
   The first push opens a browser window to sign in to GitHub. Approve it.

## Step 2: turn on the website (5 minutes)

1. On the repo page: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Open the **Actions** tab. Wait for the **Website** run to turn green (about a minute). If it ran and failed before you changed the setting, click it and choose **Re-run all jobs**.
3. Open these three pages and check they load:
   - https://imperfec-t.github.io/swarmline/
   - https://imperfec-t.github.io/swarmline/privacy.html
   - https://imperfec-t.github.io/swarmline/support.html

Don't submit to the store until the privacy page loads. Reviewers open it.

## Step 3: developer account (once, 10 minutes)

1. Turn on **2-Step Verification** for the Google account you'll publish with (myaccount.google.com → Security). The Chrome Web Store requires it.
2. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) and sign in.
3. Accept the developer agreement and pay the one-time registration fee.
4. **Account** page:
   - **Publisher name:** `imperfxt`
   - **Trader / non-trader:** choose **non-trader**. You can change this later if you add paid features.
   - **Contact email:** `imperfxt@gmail.com`, then click the verification link Google emails you. You can't submit until it's verified.
   - Leave the physical address empty unless the form requires it. As a non-trader it isn't shown on the listing.

## Step 4: create the listing (20 minutes)

1. Dashboard → **Items → + New item** → upload **`dist\swarmline-1.0.0.zip`**.
2. Fill in each tab. Every value is in **`store\LISTING.md`**, so copy and paste from there:

   **Store listing tab**
   - **Description:** paste the block under "Description".
   - **Category:** Developer Tools. **Language:** English.
   - **Store icon:** `store\store-icon-128.png`
   - **Screenshots:** `store\screenshot-1.png` to `screenshot-5.png`, **in that order**.
   - **Small promo tile:** `store\promo-440x280.png`. **Marquee promo tile:** `store\marquee-1400x560.png`.
   - **Homepage URL** and **Support URL:** as in the table above. Leave **Official URL** empty.
   - **Mature content:** No.

   **Privacy tab**
   - **Single purpose:** paste from LISTING.md.
   - **Permission justifications:** paste the two lines for `activeTab` and `scripting`. There are no host permissions to justify.
   - **Remote code:** "No, I am not using remote code".
   - **Data usage:** tick **no** data types, then tick all **three** certifications.
   - **Privacy policy URL:** https://imperfec-t.github.io/swarmline/privacy.html

   **Distribution tab**
   - **Payments:** Free. **Visibility:** Public. **Regions:** All regions.

   **Test instructions tab** (if shown)
   - "No account or setup needed. Open any website, click the Swarmline toolbar button (or press Alt+Shift+L), and watch it build. Press F to finish, Esc to exit."

3. Click **Save draft**, then **Submit for review**. You can untick "Publish automatically after approval" if you want to press Publish yourself.

Review usually takes a few days, sometimes longer for a new developer account. Google emails you the result.

## Step 5: after approval (5 minutes)

1. Copy the store address. It looks like `https://chromewebstore.google.com/detail/swarmline/<id>`.
2. Point the website's **Add to Chrome** buttons at it:
   ```sh
   npm run configure -- --store-url https://chromewebstore.google.com/detail/swarmline/<id>
   git commit -am "Link the store listing"
   git push
   ```
   The website updates by itself within a minute.

## Shipping an update later

1. Make the change, then raise `"version"` in both `extension\manifest.json` and `package.json` (for example to `1.0.1`).
2. Run:
   ```sh
   npm test && npm run test:ext && npm run assets && npm run package && npm run preflight
   ```
3. Dashboard → your item → **Package → Upload new package** → `dist\swarmline-<version>.zip` → **Submit for review**. If the screenshots changed, replace them on the Store listing tab as well.
4. `git commit -am "1.0.1"` and `git push`.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| "Couldn't find manifest" on upload | Upload the zip from `dist\` as it is. Don't unzip it or zip the folder yourself. |
| Can't submit: email not verified | Account page → resend the verification email to imperfxt@gmail.com. |
| Privacy page shows 404 | Settings → Pages must say "GitHub Actions". Then re-run the Website workflow in the Actions tab. |
| `git push` is rejected | The repo was created with a README. Delete the repo, create it again empty, and push again. |
| Rejected for permissions or privacy | Reply in the dashboard quoting LISTING.md: Swarmline only uses `activeTab` and `scripting`, collects nothing and has no remote code. |

## Common rejection reasons (already handled)

| Reason | How Swarmline avoids it |
| --- | --- |
| Excessive permissions | Only `activeTab` and `scripting`; no host permissions, no always-on content scripts |
| Missing or vague single purpose | One clear purpose, stated in the listing and the manifest summary |
| No privacy policy / mismatched data disclosures | Public policy page that matches the code: nothing is collected, no servers are contacted (checked by `npm run preflight`) |
| Remote code | All code is bundled; preflight checks for `eval`, `new Function` and remote scripts |
| Misleading or copied branding | Original name, icon and artwork, and credits in NOTICE.md; screenshots use a fictional demo site |
| Keyword stuffing | The description is plain prose with no keyword lists |
