# RankIt

RankIt is a private, browser-only decision workspace for personal choices.

Enter one set of options, rank those options through several methods, then compare what stayed stable and what changed. The goal is not just to produce a list, but to understand which choices are robust versus method-dependent.

## What It Does

- Set up a decision with a title, options, and optional notes.
- Start from decision templates or a blank list.
- Rank the same options with multiple methods:
  - Pairwise Ranking
  - Drag to Rank
  - Tier List
  - Budget Allocation
  - Tournament Bracket
  - Smart Sort
  - Vote Off The Island
- Review a Decision Summary with likely top choice, robust choices, method-sensitive choices, confidence, charts, and detailed method results.
- Add optional method reflections and a final decision note.
- Export results as CSV.
- Export/import a full project as JSON.
- Share a result-focused link.

## Privacy

RankIt runs entirely in the browser. There are no accounts, no backend, and no cloud sync. Project data is stored in local storage unless you export it, import it, or create a share link.

## Running Locally

Open `index.html` directly in a browser, or serve the folder with any static file server.

Example:

```bash
python3 -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/index.html
```

## Publishing

This is a static site. Deploy the repository contents to any static host, such as GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

The app depends on two CDN-hosted libraries:

- Lucide icons, pinned in `index.html`
- Chart.js, pinned in `index.html`

## Development Checks

```bash
git diff --check
node --check script.js
node --check template.js
```
