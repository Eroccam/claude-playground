# Safran Event Dashboard — 2026

Internal events management dashboard for 168 global tradeshows and industry events.

## Quick Start

```
node serve.js
```

Then open **http://localhost:3000** in your browser.

## First-Time Setup

1. Copy your CSV export from SharePoint into `_shared/data/Events_List.csv`
2. From the project root, run the parser to generate `events.json`:
   ```
   node _shared/parse-events.js
   ```
3. Start the server and open the dashboard:
   ```
   node event-dashboard/serve.js
   ```

## Updating Event Data

Whenever you export a new CSV from SharePoint:

1. Replace `_shared/data/Events_List.csv` with the new export
2. Run `node _shared/parse-events.js` from the project root
3. Refresh the browser — the dashboard reloads `events.json` automatically

## File Structure

```
claude-playground/
├── _shared/
│   ├── data/
│   │   ├── Events_List.csv     ← Copy your SharePoint CSV here
│   │   └── events.json         ← Generated — source of truth for dashboard
│   └── parse-events.js         ← Converts CSV → events.json
└── event-dashboard/
    ├── index.html              ← The full dashboard (open this)
    ├── serve.js                ← Local HTTP server
    └── README.md               ← This file
```

## Production Deployment (Render)

The app is hosted on **Render** (render.com), deployed automatically from GitHub.

**How it works:**
1. Code changes are made locally and committed to git
2. `git push origin main` pushes to GitHub (`Eroccam/claude-playground`)
3. Render detects the push and automatically redeploys the live site
4. No manual deploy steps needed — every push to `main` updates production

**Entry point:** `package.json` at the repo root defines `"start": "node event-dashboard/serve.js"` — this is what Render runs.

**Environment variables** (set in Render's dashboard, not in the repo):
- `ANTHROPIC_API_KEY` — required for the research agent (`/api/research/stream`)

**Data persistence note:** `_shared/data/master-events.json` is served from the deployed repo snapshot. Writes made through the live app (edits, approvals, CSV uploads) do not persist across redeploys — commit updated data files to git before deploying if you want changes preserved.

To find the live URL: log in to render.com → your service → the URL is shown at the top of the service page.

## Agent Integration

Future agents (research, deadline tracking) can write directly to `_shared/data/events.json`.
The dashboard will reflect their changes on the next browser refresh — no manual steps required.
