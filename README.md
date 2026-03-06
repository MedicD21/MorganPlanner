# OnPurpose Planner App

A React + Vite planner app for iPad/web with handwriting-first interactions.

The app includes monthly/weekly spreads, planning pages, and notes pages with in-app hash navigation and persistent ink.

## Features

- Monthly + weekly spread in one view
- Planning spread (`to do today`, `this week`, `to do this month`)
- Dedicated notes spread with ruled left page + dot-grid right page
- Month tabs and week tabs for navigation
- Link from month/weekly spread to planning page
- `NOTES` tab links to notes spread
- Canvas ink engine with local per-page persistence
- Pencil/touch input support with pressure + tilt-aware drawing

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

## Data Persistence

Ink, symbols, fills, images, and sticky notes are saved in `localStorage` per planner page id.

- Data persists across refreshes on the same device/browser profile.
- Clearing site data (or uninstalling app data on iOS) removes stored ink.

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

- Ink persistence is currently local-device only (no cloud sync yet).
- Large local ink histories can increase memory/storage usage over time.
- Facing-page book mode is not native in single-webview contexts; spreads are presented as full-width views.

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
