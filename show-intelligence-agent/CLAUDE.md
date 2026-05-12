# Show Intelligence Agent — Architecture Guide (v2.0)

## Overview
Three-layer research pipeline that fetches event websites, extracts structured data via the Claude API, and writes proposals to master-events.json.

```
research-agent.js  (Layer 3 — orchestrator + CLI)
      ↓ calls
claude-engine.js   (Layer 2 — Claude API reasoning)
      ↑ receives page data from
fetcher.js         (Layer 1 — URL fetch + HTML parse)
```

## How Research Works

### Phase 1 — Official Website
The agent reads the `Event Website` field from the event's SharePoint layer. If present, it fetches that URL using `fetcher.js`. The HTML is cleaned (scripts/styles/SVG removed), then body text, headings, footer text, and navigation links are extracted. The full page content is sent to Claude with all 10 target fields to extract. The footer is sent separately because many event sites embed the venue address there.

### Phase 2 — Subpage Navigation
Claude returns `suggestedSubpages` — navigation links it believes contain missing data. The agent filters to same-domain URLs only (never follows external links), deduplicates against already-visited URLs, and fetches up to 6 subpages. Each subpage is sent to Claude asking only for the fields still null. Stops early if all fields are found.

### Phase 3 — Web Search Fallback
For fields still null after Phases 1–2, the agent constructs targeted search queries and uses DuckDuckGo HTML search to find result URLs. Each result URL is verified live then fetched and sent to Claude. One query per null field.

### Phase 4 — Venue Address Inference
If `street` is still null but `venueName` and `city` are known, Claude is asked to recall the venue address from its training knowledge. Results are marked `inferred` and downgraded to `medium` or `low` confidence (since there's no verified source page).

### Phase 5 — Build and Write Proposals
For each found field: writes a proposal record to `master-events.json` `proposals` layer with `value`, `confidence`, `reasoningMethod`, `sourceUrl`, `sourcePageTitle`, `sourceVerified`, `proposedAt`. For null fields: records `searchQueriesAttempted`, `pagesVisited`, and a descriptive note. Then calls `changelog-engine.js` and `sharepoint-todo.js`.

## Target Fields (10)
| Name | maps to CSV column | notes |
|------|-------------------|-------|
| startDate | Start Date | YYYY-MM-DD, opening day only |
| endDate | End Date | YYYY-MM-DD, last show day |
| street | Event Location: Street | number + name only, no city |
| city | Event Location: City | city name only |
| state | Event Location: State | 2-letter for US, null for non-US |
| country | Event Location: Country/Region | full name, not abbreviation |
| venueName | Venue | facility name only, no address |
| boothSize | Booth Size | dimensions only, e.g. "10 x 10" |
| boothNumber | Booth# | only if on official floor plan |
| registrationDeadline | Registration Deadline | YYYY-MM-DD |

## What Good Output Looks Like

```
RESEARCH COMPLETE: SmallSat Europe 2026
Fields Found: 7    Fields Null: 3
Pages Visited: 3
─────────────────────────────────────────────────────
FIELD RESULTS:
  startDate              2026-05-26    high    direct    smallsateurope.com
  endDate                2026-05-28    high    direct    smallsateurope.com
  street                 Europaplein 24   high  direct  smallsateurope.com
  city                   Amsterdam     high    direct    smallsateurope.com
  country                Netherlands   high    direct    smallsateurope.com
  venueName              RAI Amsterdam Convention Centre   high  direct
  boothNumber            410           high    direct    smallsateurope.com/sponsor-type/exhibitors/

NULL FIELDS:
  state                  Searched: SMALLSAT EUROPE 2026 venue state province
  boothSize              Searched: (none)
  registrationDeadline   Searched: SMALLSAT EUROPE 2026 exhibitor registration deadline
```

The first action logged is always `Phase 1 — fetching official website: [url]`. Fields found from the homepage all share `sourceUrl: https://[eventdomain]/`. Fields found on subpages show the subpage URL as source.

## Module API

### fetcher.js
```js
const { fetchPage, verifyUrl } = require('./fetcher');

// Returns { success, url, finalUrl, statusCode, pageTitle, bodyText,
//           navigationLinks, footerText, truncated, characterCount }
const page = await fetchPage('https://example.com/');

// Returns { isLive, finalUrl, statusCode, pageTitle }
const check = await verifyUrl('https://example.com/');
```

### claude-engine.js
```js
const { extractFromPage, inferVenueAddress } = require('./claude-engine');

// pageData from fetchPage(); fieldsNeeded = [{name, description, currentValue}]
// Returns { fields: { [name]: {value, confidence, reasoningMethod, reasoning, sourceConfirmed} },
//           suggestedSubpages, pageAssessment }
const result = await extractFromPage(pageData, fieldsNeeded, eventContext);

// Returns { street, confidence, reasoning }
const addr = await inferVenueAddress('RAI Amsterdam', 'Amsterdam', 'Netherlands');
```

### research-agent.js (CLI)
```bash
# Research one event
node research-agent.js --eventId SMSE26
node research-agent.js --eventId smse26 --dry-run
node research-agent.js --eventId SMSE26 --force-overwrite

# Batch (all stale events)
node research-agent.js --batch
node research-agent.js --batch --dry-run
```

## Files
| File | Purpose |
|------|---------|
| `fetcher.js` | URL fetch + HTML parse (Layer 1) |
| `claude-engine.js` | Claude API extraction + venue inference (Layer 2) |
| `research-agent.js` | Orchestrator + CLI entry point (Layer 3) |
| `research-agent-v1-archived.js` | Previous version (search-based, Brave/Serper) |
| `changelog-engine.js` | Audit trail writer |
| `sharepoint-todo.js` | SP task queue writer |
| `orchestrator.js` | Route CLI operations to agents |
| `deadline-monitor.js` | Deadline alert scanner |
| `email-composer.js` | AI email drafting |

## Confidence Rules
- `high`: found on official event website (Phase 1 or 2) and field is unambiguous
- `medium`: found via web search (Phase 3) or inferred from venue knowledge
- `low`: inferred with uncertainty or from unreliable source
- Venue address inference (Phase 4): always `medium` at best (no source page)

## Protected Fields
Fields where `master.approved[csvCol]` or `master.dismissed[csvCol]` exist are skipped unless `--force-overwrite` is set.

## Dependencies
- `@anthropic-ai/sdk` — Claude API
- `cheerio` — HTML parsing
- Node 18+ built-in `fetch` — HTTP requests (no node-fetch needed)
- `changelog-engine`, `sharepoint-todo` — sibling modules (no external deps)
