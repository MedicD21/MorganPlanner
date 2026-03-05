# GoodNotes Planner Generator

A React + Vite app for generating a printable digital planner layout for GoodNotes.

The app builds monthly/weekly spreads, planning pages, and dedicated notes pages, with in-app navigation and export-ready links.

## Features

- Monthly + weekly spread in one view
- Planning spread (`to do today`, `this week`, `to do this month`)
- Dedicated notes spread with ruled left page + dot-grid right page
- Month tabs and week tabs for navigation
- Link from month/weekly spread to planning page
- `NOTES` tab links to notes spread
- Export current spread or full-year output

## Stack

- React 19
- TypeScript
- Vite
- CSS layout tuned for iPad-friendly 4:3 spreads

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Open the local URL shown by Vite.

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## Exporting for GoodNotes

Use Chromium browsers (Chrome/Edge) for best print-to-PDF hyperlink behavior.

1. Open the planner in browser.
2. Click `Export Current Spread` or `Export Full Year`.
3. In print dialog choose `Save as PDF`.
4. Keep scale at 100%, disable headers/footers, keep background graphics on.
5. Import PDF into GoodNotes.

Tip: in GoodNotes, links are easiest to trigger in read-only mode.

Confirmed in this project: exported planner links work in GoodNotes.

## Screenshots and GIF

### Month + Week Spread

![Month and week spread](docs/media/month-week-spread.png)

### Planning Spread

![Planning spread](docs/media/planning-spread.png)

### Notes Spread

![Notes spread](docs/media/notes-spread.png)

### Navigation Demo

![Navigation demo](docs/media/navigation-demo.gif)

## Known Limitations

- Hyperlink behavior depends on the PDF engine used during export. Chrome/Edge are recommended.
- GoodNotes does not provide true single-window facing pages; split view with two windows is the workaround.
- iPad page ratio is tuned for 4:3 layouts, but final appearance can vary slightly based on print settings and margins.

## Deploy to GitHub Pages

This project deploys from **one branch** (`main`) using GitHub Actions.

### One-time setup in GitHub

1. Repo `Settings` -> `Pages`
2. Source: `GitHub Actions`

After that, every push to `main` triggers `.github/workflows/deploy-pages.yml` and publishes `dist`.

Site URL pattern:

```text
https://<github-username>.github.io/<repo-name>/
```

## Scripts

- `npm run dev` - start dev server
- `npm run build` - type-check + production build
- `npm run preview` - preview production build locally
- `npm run lint` - run ESLint
- GitHub Actions deploys on every push to `main`

## Key Files

- `src/App.tsx` - app shell + writing toolbar state
- `src/planner/MonthlyView.tsx` - planner page layouts and navigation links
- `src/planner/generateCalendar.ts` - calendar/week generation logic
- `src/planner/InkLayer.tsx` - canvas ink + symbols + local persistence
- `src/App.css` - planner layout + toolbar UI
