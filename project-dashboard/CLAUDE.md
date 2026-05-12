# Project Dashboard — Safran Events Platform

## Purpose
Browser-based app displaying all Claude Code projects in the playground folder, their development status, and quick links.

## Status
Planned — Phase 2

## Data Dependencies
- Reads: `../projects.json` (root-level manifest)

## Key Files
- `index.html` — single-file standalone app (HTML + CSS + JS)

## Tech Stack
- Pure HTML + CSS + JavaScript
- No build tools, no dependencies
- Reads projects.json via fetch() from local filesystem

## Functional Requirements
- Project cards: name, description, status badge, last updated, tech stack, folder path
- Status badges: Active (green), In Progress (amber), Planned (gray), Blocked (red)
- Filter by status
- One-click to open project folder (file:// link)
- Auto-refresh every 60 seconds
