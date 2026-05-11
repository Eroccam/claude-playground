# Shared Data Layer — Safran Events Platform

## Purpose
Central data store for all Safran events apps and agents.

## Key Files
- `data/master-events.json` — master event list (source of truth, 5-layer schema)
- `data/contacts.json` — contacts linked to events
- `data/deadlines.json` — standalone deadline registry
- `schemas/event.schema.json` — JSON Schema for event validation
- `utils/dateHelpers.js` — shared date comparison utilities
- `utils/emailTemplates.js` — reusable email draft templates

## master-events.json Schema (5 layers per event)
Each event has: `code`, `sharepoint` (CSV columns), `proposals` (agent suggestions pending review),
`approved` (accepted proposals), `dashboardEdits` (inline edits), `dismissed`, `meta`, `research`.

Field resolution priority: `approved[col].value` > `dashboardEdits[col].value` > `sharepoint[col]`

## Rules
- Never write directly to master-events.json without going through serve.js API endpoints
- CSV upload (POST /api/master-events/merge-csv) is the canonical write path for sharepoint layer
- Agent findings write to `proposals` layer only — never directly to sharepoint layer
- Always use atomic write (.tmp + renameSync) pattern for all file writes

## Data Path (used by all sibling projects)
Base: `C:\Coding\claude-playground\_shared\`

## Region Taxonomy (CR-008, 2026-02-23)
Four top-level regions: Americas, EMEA, APAC, Global.
- Americas → sub-regions: "US & Canada", "Latin America & Caribbean"
- EMEA     → sub-regions: "Western Europe", "Eastern Europe", "Middle East", "Africa"
- APAC     → sub-regions: "Asia Pacific", "Australia & New Zealand"
- Global   → no sub-regions

### Event fields added by migrate-regions.js
- `region`: now uses top-level keys (Americas/EMEA/APAC/Global); old "USA" values migrated → "Americas"
- `subRegion`: e.g. "US & Canada" for former USA events; null for EMEA/APAC
- `regionalTags`: array, default []

### config.json
Contains `userProfile` block: primaryRegion="US & Canada", primaryTopRegion="Americas"
