# Market Cross Darts League — website

A static site (plain HTML/CSS/JS, no build step) that reads everything from your
existing results Google Sheet via the Apps Script web app. Free to host on GitHub
Pages.

## 1. Point the site at your data

The site needs one new thing from the Apps Script you already have set up: a
JSON endpoint. That's already added to `Code.gs` (the `?page=api` route) — just
make sure you're running the latest version:

1. In the Apps Script editor, paste in the latest `Code.gs`.
2. **Deploy → Manage deployments → edit (pencil) → New version → Deploy.**
3. Copy the web app URL shown there (ends in `/exec`).
4. Open `assets/data.js` in this folder and replace the `API_URL` placeholder
   with that URL plus `?page=api` on the end, e.g.:

   ```js
   API_URL: 'https://script.google.com/macros/s/AKfycb.../exec?page=api',
   ```

That's the only setup step — every page fetches from this one address.

## 2. Put it on GitHub Pages

1. Create a new **public** GitHub repository (Pages needs public on a free plan,
   unless you're on GitHub Pro/Team/Enterprise).
2. Upload every file in this folder to the repo, keeping the folder structure
   (`assets/`, `social/`, and the `.html` files) — easiest via the GitHub web UI:
   "Add file → Upload files", drag the whole lot in, commit.
3. In the repo: **Settings → Pages → Source → Deploy from a branch → Branch:
   main, folder: / (root) → Save.**
4. GitHub gives you a URL like `https://yourusername.github.io/reponame/` —
   open it and check the home page loads real data.

## 3. Point your domain at it (once you've bought one)

1. Still in **Settings → Pages**, enter your domain under "Custom domain" and
   save — GitHub creates a `CNAME` file in the repo for you.
2. At your domain registrar, add DNS records pointing at GitHub Pages:
   - For an apex domain (`marketcrossdarts.com`): four `A` records pointing at
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   - For `www.marketcrossdarts.com`: a `CNAME` record pointing at
     `yourusername.github.io`.
   - (GitHub's own docs at docs.github.com → Pages → "custom domain" have the
     current, definitive list if this ever changes.)
3. DNS can take anywhere from a few minutes to a few hours to take effect.
   Once it has, tick "Enforce HTTPS" back in the Pages settings.

## Pages in this site

- `index.html` — news, latest results, next fixtures, league table, top 180s/finishes.
- `fixtures.html` + `fixture.html?id=...` — every fixture, filterable by team, click through for the full game-by-game breakdown.
- `players.html` — every player's games played/won (singles, pairs, overall), full 180s and 100+ finish lists.
- `teams.html` + `team.html?name=...` — a team's squad, results and upcoming fixtures.
- `social/results.html`, `social/table.html`, `social/fixtures.html` — Facebook-ready graphics (last week's results / league table / next week's fixtures) with a "Download image" button. Not linked from the main nav — bookmark them directly.

## Notes

- The site only ever shows a fixture's full breakdown once you've **submitted**
  it in the captain portal — nothing half-entered shows publicly.
- Archived players (via the player admin page) drop out of "current squad" on
  the team page, but their past results and stats stay exactly as they were.
- If a page shows a red error banner about not loading league data, it's almost
  always the `API_URL` in `assets/data.js` — double check it's the right `/exec`
  URL with `?page=api` on the end, and that you redeployed a **new version**
  after adding the API code (saving alone doesn't update `/exec`).
- Everyone who visits the site fetches live from your sheet — there's no build
  step to re-run when results change, it's just always current.
