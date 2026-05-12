# Event Tracker — Safran Events Platform

## Purpose
Calendar and timeline viewer for the Safran events platform. Read-only consumer of master-events.json.

## Status
Planned — Phase 4

## Data Dependencies
- Reads from: `../_shared/data/master-events.json` (read-only consumer)
- Writes: none (read-only)
- Reads from: `../_shared/data/contacts.json`
- Validates against: `../_shared/schemas/event.schema.json`

## Key Files
- `index.html` — main UI
- `server.js` — optional Node.js backend for file writes

## Tech Stack
- React (via CDN) or plain HTML/JS
- LocalStorage for unsaved draft state
- Node.js backend script for file writes (optional)

## Functional Requirements
- List view with inline search and sort
- Add / Edit / Delete events via modal form
- Form validates against schema before saving
- Deadline sub-management per event
- Contact sub-management per event
- Change log: last 20 edits with timestamp and field changed
