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

## Agent Integration

Future agents (research, deadline tracking) can write directly to `_shared/data/events.json`.
The dashboard will reflect their changes on the next browser refresh — no manual steps required.
