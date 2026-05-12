/**
 * research-agent.js  v1.0.0
 * Primary intelligence-gathering module for the Safran Show Intelligence Suite.
 * Researches tradeshows across 9 field categories, scores confidence, merges
 * findings into events.json, and hands off to changelog + SharePoint agents.
 *
 * Usage:
 *   node research-agent.js --eventId PXT26
 *   node research-agent.js --eventId PXT26 --dry-run
 *   node research-agent.js --eventId PXT26 --force-overwrite
 *   node research-agent.js --batch
 *   node research-agent.js --batch --dry-run
 *
 * Env vars:
 *   ANTHROPIC_API_KEY  — required for live extraction (skipped in dry-run)
 *   BRAVE_API_KEY      — preferred search provider
 *   SERPER_API_KEY     — fallback search provider
 *   (neither set)      — mock search mode (always used in --dry-run)
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');

// ─── Paths ────────────────────────────────────────────────────────────────────
const SHARED_DATA = path.resolve(__dirname, '../_shared/data');
const SHARED_ROOT = path.resolve(__dirname, '../_shared');
const MASTER_FILE = path.join(SHARED_DATA, 'master-events.json');
const CONFIG_FILE = path.join(SHARED_ROOT, 'config.json');

// ─── Intelligence dotpath → CSV column (for proposal layer) ──────────────────
const INTEL_TO_CSV = {
  'venue.street':               'Event Location: Street',
  'venue.city':                 'Event Location: City',
  'venue.state':                'Event Location: State',
  'venue.country':              'Event Location: Country/Region',
  'venue.name':                 'Venue',
  'booth.size':                 'Booth Size',
  'booth.number':               'Booth%23',
  'booth.registrationDeadline': 'Registration Deadline',
  'identity.officialWebsite':   'Event Website',
  'identity.organizerName':     'Organizing Company',
  'identity.tagline':           'Main Event Subject',
};
const ADDR_INTEL_FIELDS = new Set([
  'venue.street', 'venue.city', 'venue.state', 'venue.country',
]);

const AGENT_VERSION = '1.0.0';

// ─── All fields the agent attempts to populate (used for intelligenceScore) ───
const TRACKED_FIELDS = [
  // ── Category 9: Core Event Details (runs first) ──────────────────────────
  'show.startDate',           'show.endDate',
  'venue.street',             'venue.city',              'venue.state',   'venue.country',  'venue.name',
  'booth.size',               'booth.number',            'booth.registrationDeadline',
  // ── Categories 1–8 ───────────────────────────────────────────────────────
  'identity.officialWebsite', 'identity.organizerName', 'identity.editionNumber', 'identity.hashtags',
  'dates.setupStart',         'dates.teardownEnd',       'dates.fullAddress',      'dates.gpsLat', 'dates.gpsLng',
  'booth.earlyBirdDeadline',  'booth.standardDeadline',  'booth.paymentDue',       'booth.designDeadline',
  'booth.cancellationPolicy', 'booth.boothSizes',        'booth.prospectusPdfUrl',
  'sponsorship.deadline',     'sponsorship.tierNames',   'sponsorship.tierPricing',
  'sponsorship.tierBenefits', 'sponsorship.logoSpecUrl', 'sponsorship.prospectusPdfUrl',
  'housing.deadline',         'housing.blockName',       'housing.portalUrl',      'housing.hotelOptions',
  'attendance.expectedAttendees', 'attendance.expectedExhibitors',
  'attendance.priorYearAttendees', 'attendance.targetAudience',
  'contacts.exhibitsManager',       'contacts.exhibitsManagerEmail',
  'contacts.sponsorshipContact',    'contacts.sponsorshipContactEmail', 'contacts.pressContact',
  'opportunities.speakingAvailable', 'opportunities.speakingDeadline',
  'opportunities.awardsPrograms',    'opportunities.coLocatedEvents',
];

// ─── 9 Research categories (Category 9 runs first — core event details) ──────
const SEARCH_CATEGORIES = [
  {
    id: 9, name: 'Core Event Details',
    queries: (n, y) => [
      `"${n}" ${y} show dates open close venue address`,
      `"${n}" ${y} exhibitor registration deadline booth size`,
      `"${n}" ${y} floor plan exhibitor list booth number`,
    ],
    fields: [
      'show.startDate', 'show.endDate',
      'venue.street', 'venue.city', 'venue.state', 'venue.country', 'venue.name',
      'booth.size', 'booth.number', 'booth.registrationDeadline',
    ],
    schema: ['show', 'venue', 'booth'],
    instruction: [
      'Extract core event details. Dates MUST be YYYY-MM-DD.',
      'State: 2-letter abbreviation for US (e.g. "NV", "CA"); province/region for non-US.',
      'Country: full name — "United States" not "US" or "USA", "Germany" not "DE".',
      'Venue Name: facility name only — no address, no city. E.g. "Las Vegas Convention Center".',
      'Street: street number + street name only — no city, no state. E.g. "3333 Las Vegas Blvd South".',
      'Booth Size: dimensions only ("10 x 10"), smallest standard size first.',
      'Booth Number: ONLY if found on an official published floor plan or exhibitor list. Otherwise null.',
      'Registration Deadline: final deadline for exhibitor application/booth registration. YYYY-MM-DD.',
      'Address reasoning: If the venue name is identified in search results but no street address is explicitly stated,',
      '  use your knowledge of well-known venues (major convention centers, hotels, exhibition halls) to infer',
      '  street, city, state, and country. Only do this for venues you confidently recognize by name.',
      '  Do NOT guess or fabricate addresses for venues you do not recognize. Set to null if uncertain.',
      'Return ONLY valid JSON:',
      '{ "show":  { "startDate": string|null, "endDate": string|null },',
      '  "venue": { "street": string|null, "city": string|null, "state": string|null, "country": string|null, "name": string|null },',
      '  "booth": { "size": string|null, "number": string|null, "registrationDeadline": string|null } }',
    ].join('\n'),
  },
  {
    id: 1, name: 'Show Identity',
    queries:  (n, y) => [`"${n}" official website ${y}`, `"${n}" ${y} organizer edition`],
    fields:   ['identity.officialWebsite', 'identity.organizerName', 'identity.editionNumber', 'identity.hashtags'],
    schema:   'identity',
    instruction: [
      'Extract the following fields from the search results about this tradeshow/conference.',
      'Return ONLY valid JSON with this exact shape — set any field you cannot confirm to null:',
      '{ "identity": { "officialWebsite": string|null, "organizerName": string|null,',
      '                "editionNumber": string|null, "hashtags": string[]|null } }',
    ].join('\n'),
  },
  {
    id: 2, name: 'Dates and Location',
    queries:  (n, y) => [`"${n}" ${y} show dates setup teardown`, `"${n}" ${y} venue full address`],
    fields:   ['dates.setupStart', 'dates.teardownEnd', 'dates.fullAddress', 'dates.gpsLat', 'dates.gpsLng'],
    schema:   'dates',
    instruction: [
      'Extract the following fields. All dates MUST be YYYY-MM-DD format. Numbers only for GPS.',
      'Return ONLY valid JSON:',
      '{ "dates": { "setupStart": string|null, "teardownEnd": string|null,',
      '             "fullAddress": string|null, "gpsLat": number|null, "gpsLng": number|null } }',
    ].join('\n'),
  },
  {
    id: 3, name: 'Booth and Exhibit',
    queries:  (n, y) => [`"${n}" ${y} exhibitor prospectus`, `"${n}" ${y} booth pricing application deadline`, `"${n}" ${y} exhibit space`],
    fields:   ['booth.earlyBirdDeadline', 'booth.standardDeadline', 'booth.paymentDue', 'booth.designDeadline', 'booth.cancellationPolicy', 'booth.boothSizes', 'booth.prospectusPdfUrl'],
    schema:   'booth',
    instruction: [
      'Extract exhibitor/booth details. Dates MUST be YYYY-MM-DD. Prices as numbers only (no $ sign).',
      'Return ONLY valid JSON:',
      '{ "booth": { "earlyBirdDeadline": string|null, "standardDeadline": string|null,',
      '             "paymentDue": string|null, "designDeadline": string|null,',
      '             "cancellationPolicy": string|null,',
      '             "boothSizes": [{"size": string, "price": number, "currency": string}]|null,',
      '             "prospectusPdfUrl": string|null } }',
    ].join('\n'),
  },
  {
    id: 4, name: 'Sponsorship',
    queries:  (n, y) => [`"${n}" ${y} sponsorship opportunities packages`, `"${n}" ${y} sponsorship prospectus`],
    fields:   ['sponsorship.deadline', 'sponsorship.tierNames', 'sponsorship.tierPricing', 'sponsorship.tierBenefits', 'sponsorship.logoSpecUrl', 'sponsorship.prospectusPdfUrl'],
    schema:   'sponsorship',
    instruction: [
      'Extract sponsorship package details. Dates MUST be YYYY-MM-DD. Prices as numbers only.',
      'Return ONLY valid JSON:',
      '{ "sponsorship": { "deadline": string|null, "tierNames": string[]|null,',
      '                   "tierPricing": number[]|null,',
      '                   "tierBenefits": {"tierName": string[]}|null,',
      '                   "logoSpecUrl": string|null, "prospectusPdfUrl": string|null } }',
    ].join('\n'),
  },
  {
    id: 5, name: 'Housing',
    queries:  (n, y) => [`"${n}" ${y} official hotel block housing bureau`, `"${n}" ${y} attendee housing reservation`],
    fields:   ['housing.deadline', 'housing.blockName', 'housing.portalUrl', 'housing.hotelOptions'],
    schema:   'housing',
    instruction: [
      'Extract housing/hotel block details. Dates MUST be YYYY-MM-DD. Room rates as numbers.',
      'Return ONLY valid JSON:',
      '{ "housing": { "deadline": string|null, "blockName": string|null,',
      '               "portalUrl": string|null,',
      '               "hotelOptions": [{"hotelName": string, "nightlyRate": number, "currency": string, "distanceKm": number}]|null } }',
    ].join('\n'),
  },
  {
    id: 6, name: 'Attendance',
    queries:  (n, y) => [`"${n}" ${y} expected attendance exhibitors`, `"${n}" ${parseInt(y, 10) - 1} recap attendance figures`],
    fields:   ['attendance.expectedAttendees', 'attendance.expectedExhibitors', 'attendance.priorYearAttendees', 'attendance.targetAudience'],
    schema:   'attendance',
    instruction: [
      'Extract attendance statistics. Numbers only (no commas or text).',
      'Return ONLY valid JSON:',
      '{ "attendance": { "expectedAttendees": number|null, "expectedExhibitors": number|null,',
      '                  "priorYearAttendees": number|null, "targetAudience": string|null } }',
    ].join('\n'),
  },
  {
    id: 7, name: 'Contacts',
    queries:  (n, y) => [`"${n}" exhibit sales contact email phone`, `"${n}" sponsorship contact email`],
    fields:   ['contacts.exhibitsManager', 'contacts.exhibitsManagerEmail', 'contacts.sponsorshipContact', 'contacts.sponsorshipContactEmail', 'contacts.pressContact'],
    schema:   'contacts',
    instruction: [
      'Extract organizer contact details.',
      'Return ONLY valid JSON:',
      '{ "contacts": { "exhibitsManager": string|null, "exhibitsManagerEmail": string|null,',
      '                "sponsorshipContact": string|null, "sponsorshipContactEmail": string|null,',
      '                "pressContact": string|null } }',
    ].join('\n'),
  },
  {
    id: 8, name: 'Opportunities',
    queries:  (n, y) => [`"${n}" ${y} speaking opportunities call for speakers`, `"${n}" ${y} awards program agenda co-located`],
    fields:   ['opportunities.speakingAvailable', 'opportunities.speakingDeadline', 'opportunities.awardsPrograms', 'opportunities.coLocatedEvents'],
    schema:   'opportunities',
    instruction: [
      'Extract speaking, awards, and co-located event details. Dates MUST be YYYY-MM-DD.',
      'Return ONLY valid JSON:',
      '{ "opportunities": { "speakingAvailable": boolean|null, "speakingDeadline": string|null,',
      '                     "awardsPrograms": [{"name": string, "deadline": string}]|null,',
      '                     "coLocatedEvents": string[]|null } }',
    ].join('\n'),
  },
];

const REGION_SEARCH_HINTS = {
  'Americas': { querySuffix: 'USA exhibitor', sourceNotes: ['TSNN.com', 'ExhibitorMagazine.com', 'SEMA', 'CES', 'trade association .org sites'] },
  'EMEA':     { querySuffix: 'exhibitor Europe', sourceNotes: ['UFI.org', 'EMECA.eu', 'Messe Frankfurt', '.co.uk/.de/.fr sites'] },
  'APAC':     { querySuffix: 'exhibitor Asia Pacific', sourceNotes: ['UFI Asia', 'Reed Exhibitions Asia', 'Singapore MICE', '.com.au/.co.jp sites'] },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: INPUT PARSING
// ═══════════════════════════════════════════════════════════════════════════════

function parseArgs(argv) {
  const args = {
    eventId:        null,
    batch:          false,
    dryRun:         false,
    forceOverwrite: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--eventId'       && argv[i + 1]) { args.eventId        = argv[++i]; continue; }
    if (a === '--batch')                         { args.batch          = true;      continue; }
    if (a === '--dry-run')                       { args.dryRun         = true;      continue; }
    if (a === '--force-overwrite')               { args.forceOverwrite = true;      continue; }
    if (a === '--region' && argv[i + 1])         { args.region         = argv[++i]; continue; }
  }

  if (!args.eventId && !args.batch) {
    console.error('[research-agent] ERROR: --eventId <code> or --batch is required.');
    console.error('  Example: node research-agent.js --eventId PXT26 --dry-run');
    process.exit(1);
  }

  return args;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: CONFIG + EVENTS LOADING
// ═══════════════════════════════════════════════════════════════════════════════

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  return JSON.parse(raw);
}

function loadEvents() {
  const raw = fs.readFileSync(MASTER_FILE, 'utf8');
  return JSON.parse(raw);
}

function findEvent(eventsData, eventId) {
  const id = eventId.toUpperCase();
  const event = eventsData.events.find(
    e => (e.code || '').toUpperCase() === id
  );
  if (!event) {
    const available = eventsData.events.map(e => e.code).filter(Boolean).sort().join(', ');
    console.error(`[research-agent] ERROR: Event ID "${eventId}" not found in master-events.json.`);
    console.error(`[research-agent] Available event codes: ${available}`);
    process.exit(1);
  }
  return event;
}

function getEventYear(event) {
  const sd = event.sharepoint?.['Start Date'] || event.startDate;
  return sd ? sd.slice(0, 4) : String(new Date().getFullYear());
}

function getEventName(event) {
  // Strip "NEW: " prefix that some events have, and trailing year cruft
  const title = event.sharepoint?.['Title'] || event.title || event.code;
  return title
    .replace(/^NEW:\s*/i, '')
    .replace(/\s+\d{4}$/, '')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: SEARCH EXECUTION  (Brave → Serper → Mock fallback)
// ═══════════════════════════════════════════════════════════════════════════════

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('Search timeout')); });
  });
}

// ─── URL Verification ─────────────────────────────────────────────────────────
/**
 * Verify that a URL is reachable and return the final destination after any redirect.
 * Falls back to domain root on 4xx/5xx, then to search-query sentinel on total failure.
 *
 * Returns:
 *   { valid, finalUrl, fallbackType, status, note, wasRedirect, pageTitle }
 *   - valid:        true  → URL (or redirect target) returned 2xx/3xx
 *   - fallbackType: null | 'domain-root' | 'search-query'
 *   - note:         set when fallbackType === 'domain-root'
 */
async function verifyUrl(url, _isDomainRetry = false) {
  return new Promise(resolve => {
    if (!url) return resolve({ valid: false, finalUrl: null, fallbackType: 'search-query', status: null, note: null, wasRedirect: false });
    let parsed;
    try { parsed = new URL(url); } catch {
      return resolve({ valid: false, finalUrl: null, fallbackType: 'search-query', status: null, note: null, wasRedirect: false });
    }
    const lib     = parsed.protocol === 'https:' ? https : http;
    const port    = parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
    const options = {
      hostname: parsed.hostname, port,
      path:     (parsed.pathname || '/') + (parsed.search || ''),
      method:   'HEAD',
      headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; SafranResearchAgent/1.0)' },
    };

    const fallbackToDomain = () => {
      if (_isDomainRetry) return resolve({ valid: false, finalUrl: null, fallbackType: 'search-query', status: null, note: null, wasRedirect: false });
      let domainRoot;
      try { const p = new URL(url); domainRoot = `${p.protocol}//${p.hostname}`; } catch {
        return resolve({ valid: false, finalUrl: null, fallbackType: 'search-query', status: null, note: null, wasRedirect: false });
      }
      if (domainRoot === url) return resolve({ valid: false, finalUrl: null, fallbackType: 'search-query', status: null, note: null, wasRedirect: false });
      verifyUrl(domainRoot, true).then(r => {
        if (r.valid) resolve({ valid: false, finalUrl: domainRoot, fallbackType: 'domain-root', status: null, note: 'Specific page not verified — source domain confirmed only.', wasRedirect: false });
        else         resolve({ valid: false, finalUrl: null, fallbackType: 'search-query', status: null, note: null, wasRedirect: false });
      });
    };

    const req = lib.request(options, res => {
      res.resume(); // drain so socket is released
      const status = res.statusCode;
      if (status >= 200 && status < 400) {
        // Follow redirect: record Location as the finalUrl the manager will see
        if ([301, 302, 307, 308].includes(status) && res.headers.location) {
          let loc = res.headers.location;
          if (!loc.startsWith('http')) loc = `${parsed.protocol}//${parsed.hostname}${loc.startsWith('/') ? '' : '/'}${loc}`;
          return resolve({ valid: true, finalUrl: loc, fallbackType: null, status, note: null, wasRedirect: true });
        }
        return resolve({ valid: true, finalUrl: url, fallbackType: null, status, note: null, wasRedirect: false });
      }
      fallbackToDomain();
    });
    req.on('error', fallbackToDomain);
    req.setTimeout(8000, () => req.destroy());
    req.end();
  });
}

/**
 * Fetch the <title> tag from an HTML page server-side for caching in the proposal record.
 * Returns null if unavailable, too slow, or content is not HTML.
 * Reads at most 8 KB to avoid loading full pages.
 */
async function fetchPageTitle(url) {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    let parsed;
    try { parsed = new URL(url); } catch { return resolve(null); }
    const lib     = parsed.protocol === 'https:' ? https : http;
    const port    = parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
    const options = {
      hostname: parsed.hostname, port,
      path:     (parsed.pathname || '/') + (parsed.search || ''),
      method:   'GET',
      headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; SafranResearchAgent/1.0)', 'Accept': 'text/html' },
    };
    const req = lib.request(options, res => {
      if ((res.statusCode || 0) >= 400) { res.resume(); return resolve(null); }
      let data = '';
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 8192) req.destroy();
      });
      res.on('end', () => {
        const m = data.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
        resolve(m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 80) : null);
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(6000, () => req.destroy());
    req.end();
  });
}

// ─── Official Website Fetching ────────────────────────────────────────────────
/**
 * Fetch the full HTML of a page (up to 256 KB) for field extraction.
 * Follows a single redirect. Returns null on any error.
 */
async function fetchFullPage(url) {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    let parsed;
    try { parsed = new URL(url); } catch { return resolve(null); }
    const lib  = parsed.protocol === 'https:' ? https : http;
    const port = parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
    const options = {
      hostname: parsed.hostname, port,
      path:     (parsed.pathname || '/') + (parsed.search || ''),
      method:   'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SafranResearchAgent/1.0)',
        'Accept':     'text/html,application/xhtml+xml',
      },
    };
    const req = lib.request(options, res => {
      const status = res.statusCode || 0;
      if (status >= 400) { res.resume(); return resolve(null); }
      // Follow one redirect
      if ([301, 302, 307, 308].includes(status) && res.headers.location) {
        res.resume();
        let loc = res.headers.location;
        if (!loc.startsWith('http')) {
          loc = `${parsed.protocol}//${parsed.hostname}${loc.startsWith('/') ? '' : '/'}${loc}`;
        }
        return fetchFullPage(loc).then(resolve);
      }
      let data = '';
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 262144) req.destroy(); // 256 KB cap
      });
      res.on('end', () => resolve(data || null));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => req.destroy());
    req.end();
  });
}

/**
 * Convert HTML to plain readable text, preserving block structure and footer content.
 * Strips scripts/styles, converts block tags to newlines, decodes common entities.
 */
function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<(?:p|div|section|article|header|footer|nav|h[1-6]|li|tr|br)[^>]*>/gi, '\n')
    .replace(/<\/(?:p|div|section|article|header|footer|nav|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/gi, ' ').replace(/&#?\w+;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, 50000); // 50 KB text cap sent to Claude
}

/**
 * Parse anchor tags from HTML and return a scored list of same-domain subpage links
 * that are relevant to specific field categories (booth, sponsorship, housing, etc.).
 */
function findSubpageLinks(html, baseUrl) {
  if (!html || !baseUrl) return [];
  let base;
  try { base = new URL(baseUrl); } catch { return []; }

  const links = [];
  const seen  = new Set([base.pathname]);
  const re    = /<a[^>]+href=["']([^"'#\s]+)["'][^>]*>([^<]{1,80})/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1].trim();
    const text = m[2].trim().replace(/\s+/g, ' ');
    if (!href || /^(mailto:|tel:|javascript:)/.test(href)) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname !== base.hostname) continue;
      if (seen.has(resolved.pathname)) continue;
      seen.add(resolved.pathname);
      href = resolved.toString();
    } catch { continue; }

    let score = 0;
    const combined = (text + ' ' + href).toLowerCase();
    const cats = [];
    if (/exhib|booth|floor.plan/.test(combined))      { score += 10; cats.push('booth', 'venue'); }
    if (/sponsor/.test(combined))                      { score += 10; cats.push('sponsorship'); }
    if (/hotel|hous|accommodat|sleep/.test(combined))  { score += 10; cats.push('housing'); }
    if (/venue|location|direction|find.us/.test(combined)) { score += 8; cats.push('venue', 'dates'); }
    if (/register|registr|apply|applicat/.test(combined))  { score += 8; cats.push('booth'); }
    if (/attend|visitor|who.should/.test(combined))    { score += 6; cats.push('attendance'); }
    if (/contact/.test(combined))                      { score += 5; cats.push('contacts'); }
    if (/speak|agenda|program|session|award/.test(combined)) { score += 5; cats.push('opportunities'); }
    if (score === 0) continue;
    links.push({ url: href, text, score, categories: cats });
  }
  return links.sort((a, b) => b.score - a.score).slice(0, 8);
}

/**
 * Extract ALL available intelligence fields from a single page of HTML text using Claude.
 * Used for both the main official website page and subpages.
 * Returns an object matching the intelligence schema; all unknown fields are null.
 */
async function extractAllFieldsWithClaude(pageText, event, sourceUrl, dryRun) {
  if (dryRun || !process.env.ANTHROPIC_API_KEY) {
    if (!dryRun) {
      console.warn('[research-agent] WARNING: ANTHROPIC_API_KEY not set — page extraction skipped (will fall through to web searches).');
    }
    return {};
  }
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch {
    console.warn('[research-agent] WARNING: @anthropic-ai/sdk not installed. Page extraction skipped.');
    return {};
  }
  const client    = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  const eventName = getEventName(event);
  const year      = getEventYear(event);

  const prompt = [
    `You are extracting structured data from an official event website page for "${eventName} ${year}".`,
    `Source URL: ${sourceUrl}`,
    ``,
    `PAGE CONTENT (search entire page including HEADER, BODY, SIDEBAR, and FOOTER):`,
    `─────────────────────────────────────────────────────────`,
    pageText.slice(0, 48000),
    `─────────────────────────────────────────────────────────`,
    ``,
    `Extract EVERY field you can find. Pay special attention to:`,
    `- The page FOOTER — event websites frequently place the venue address here as plain text`,
    `- Date banners, hero sections — dates and venue name`,
    `- Any deadline counters or tables — registration, early-bird, sponsorship deadlines`,
    `- Attendance statistics — expected attendees, exhibitor counts`,
    ``,
    `EXTRACTION RULES:`,
    `- Extract ONLY what is explicitly stated on this page. Never guess.`,
    `- Dates must be YYYY-MM-DD. Show dates: startDate = first day of public event (NOT setup); endDate = last day (NOT teardown).`,
    `- State: 2-letter abbreviation for US (e.g. "NV"); province/region name for non-US; null if not applicable.`,
    `- Country: full name — "United States" not "US", "Netherlands" not "NL".`,
    `- Venue name: facility name only — no address, no city appended.`,
    `- Street: street number + street name only — include postal code if stated alongside. No city or country.`,
    `- Numbers: numeric only, no $ signs or commas.`,
    `- Set any field to null if not found on this page.`,
    ``,
    `Return ONLY valid JSON (null for any field not found on this page):`,
    `{`,
    `  "show":   { "startDate": null, "endDate": null },`,
    `  "venue":  { "street": null, "city": null, "state": null, "country": null, "name": null },`,
    `  "booth":  { "size": null, "number": null, "registrationDeadline": null, "earlyBirdDeadline": null,`,
    `              "standardDeadline": null, "paymentDue": null, "designDeadline": null,`,
    `              "cancellationPolicy": null, "boothSizes": null, "prospectusPdfUrl": null },`,
    `  "identity": { "officialWebsite": null, "organizerName": null, "editionNumber": null, "hashtags": null },`,
    `  "dates":  { "setupStart": null, "teardownEnd": null, "fullAddress": null, "gpsLat": null, "gpsLng": null },`,
    `  "sponsorship": { "deadline": null, "tierNames": null, "tierPricing": null, "tierBenefits": null,`,
    `                   "logoSpecUrl": null, "prospectusPdfUrl": null },`,
    `  "housing": { "deadline": null, "blockName": null, "portalUrl": null, "hotelOptions": null },`,
    `  "attendance": { "expectedAttendees": null, "expectedExhibitors": null,`,
    `                  "priorYearAttendees": null, "targetAudience": null },`,
    `  "contacts": { "exhibitsManager": null, "exhibitsManagerEmail": null,`,
    `               "sponsorshipContact": null, "sponsorshipContactEmail": null, "pressContact": null },`,
    `  "opportunities": { "speakingAvailable": null, "speakingDeadline": null,`,
    `                     "awardsPrograms": null, "coLocatedEvents": null }`,
    `}`,
  ].join('\n');

  const msg = await client.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 2048,
    system:     'You are a precise data extraction assistant. Return only valid JSON matching the exact schema provided. No markdown fences, no explanation, no extra keys.',
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = msg.content[0]?.text || '{}';
  try   { return JSON.parse(raw); }
  catch { console.warn('[research-agent] WARNING: Claude response was not valid JSON for page extraction. Skipping.'); return {}; }
}

async function searchBrave(query) {
  const key = process.env.BRAVE_API_KEY;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&search_lang=en`;
  const raw = await httpsGet(url, {
    'Accept':              'application/json',
    'X-Subscription-Token': key,
  });
  const data = JSON.parse(raw);
  return (data.web?.results || []).map(r => `${r.title}\n${r.url}\n${r.description}`).join('\n\n');
}

async function searchSerper(query) {
  const key = process.env.SERPER_API_KEY;
  const body = JSON.stringify({ q: query, num: 5 });
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'google.serper.dev', path: '/search', method: 'POST',
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json', 'Content-Length': body.length } },
      res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          const d = JSON.parse(data);
          const text = (d.organic || []).map(r => `${r.title}\n${r.link}\n${r.snippet}`).join('\n\n');
          resolve(text);
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function generateMockSearchResult(query, event) {
  const name = getEventName(event);
  const year = getEventYear(event);
  const city = event.city || 'TBD';
  const state = event.state ? `, ${event.state}` : '';
  const venue = event.venue || 'Convention Center';
  const startDate = event.startDate || `${year}-06-01`;
  const endDate = event.endDate || `${year}-06-04`;

  return [
    `[MOCK SEARCH RESULT — DRY RUN]`,
    `Query: "${query}"`,
    ``,
    `Result 1: ${name} ${year} — Official Show Website`,
    `https://www.${name.toLowerCase().replace(/\s+/g, '-')}.com/${year}`,
    `${name} returns to ${city}${state} for its annual edition. Join us at ${venue} from ${startDate} to ${endDate}.`,
    `Exhibitor applications now open. Early bird deadline: [date not yet announced].`,
    ``,
    `Result 2: ${name} ${year} Exhibitor & Sponsor Guide`,
    `https://www.${name.toLowerCase().replace(/\s+/g, '-')}.com/${year}/exhibit`,
    `Download the ${year} Exhibitor Prospectus. Booth sizes available: 10x10 ($2,500), 10x20 ($4,800), 20x20 ($9,000).`,
    `Standard application deadline: 60 days before show open. Housing block through official hotel bureau.`,
    ``,
    `Result 3: ${name} Sponsorship Packages ${year}`,
    `https://www.${name.toLowerCase().replace(/\s+/g, '-')}.com/${year}/sponsor`,
    `Platinum ($25,000), Gold ($15,000), Silver ($8,000) sponsorship tiers available.`,
    `Sponsorship commitment deadline: 90 days prior to show. Contact exhibits@${name.toLowerCase().replace(/\s+/g, '')}.com.`,
    ``,
    `[NOTE: This is mock data generated for dry-run mode. No real web search was performed.]`,
  ].join('\n');
}

async function performSearch(query, event, dryRun) {
  if (dryRun) {
    return generateMockSearchResult(query, event);
  }
  if (process.env.BRAVE_API_KEY) {
    return searchBrave(query);
  }
  if (process.env.SERPER_API_KEY) {
    return searchSerper(query);
  }
  // No search API configured — fall back to mock
  console.warn('[research-agent] WARNING: No search API key found (BRAVE_API_KEY or SERPER_API_KEY). Using mock results.');
  return generateMockSearchResult(query, event);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: FIELD EXTRACTION  (Claude API or deterministic mock)
// ═══════════════════════════════════════════════════════════════════════════════

function generateMockExtraction(category, event) {
  const name   = getEventName(event);
  const year   = getEventYear(event);
  const city   = event.city || null;
  const state  = event.state || null;
  const venue  = event.venue || null;
  const slug   = name.toLowerCase().replace(/\s+/g, '-');

  const mockData = {
    9: {
      show: {
        startDate: event.startDate || null,
        endDate:   event.endDate   || null,
      },
      venue: {
        street:  event.street  || null,
        city:    city,
        state:   state,
        country: event.country || null,
        name:    venue,
      },
      booth: {
        size:                 event.boothSize   || '10 x 10',
        number:               event.boothNumber || null,
        registrationDeadline: event.startDate   ? offsetDate(event.startDate, -60) : null,
      },
    },
    1: { identity: {
      officialWebsite: `https://www.${slug}.com/${year}`,
      organizerName:   event.organizingCompany || null,
      editionNumber:   null,
      hashtags:        [`#${slug.replace(/-/g, '')}${year}`],
    }},
    2: { dates: {
      setupStart:  event.startDate ? offsetDate(event.startDate, -2) : null,
      teardownEnd: event.endDate   ? offsetDate(event.endDate,    1) : null,
      fullAddress: venue && city ? `${venue}, ${city}${state ? `, ${state}` : ''}` : null,
      gpsLat:  null,
      gpsLng:  null,
    }},
    3: { booth: {
      earlyBirdDeadline: event.startDate ? offsetDate(event.startDate, -90) : null,
      standardDeadline:  event.startDate ? offsetDate(event.startDate, -60) : null,
      paymentDue:        event.startDate ? offsetDate(event.startDate, -45) : null,
      designDeadline:    event.startDate ? offsetDate(event.startDate, -21) : null,
      cancellationPolicy: '50% refund if cancelled 60+ days before show; no refund within 60 days [MOCK]',
      boothSizes: [
        { size: '10x10', price: 2500, currency: 'USD' },
        { size: '10x20', price: 4800, currency: 'USD' },
        { size: '20x20', price: 9000, currency: 'USD' },
      ],
      prospectusPdfUrl: `https://www.${slug}.com/${year}/exhibitor-prospectus.pdf`,
    }},
    4: { sponsorship: {
      deadline:       event.startDate ? offsetDate(event.startDate, -120) : null,
      tierNames:      ['Platinum', 'Gold', 'Silver'],
      tierPricing:    [25000, 15000, 8000],
      tierBenefits:   {
        Platinum: ['Logo on all materials', 'Keynote speaking slot', '20x20 booth included'],
        Gold:     ['Logo on signage', 'Panel speaking slot', '10x20 booth included'],
        Silver:   ['Logo on website', '10x10 booth included'],
      },
      logoSpecUrl:       null,
      prospectusPdfUrl:  `https://www.${slug}.com/${year}/sponsorship-prospectus.pdf`,
    }},
    5: { housing: {
      deadline:     event.startDate ? offsetDate(event.startDate, -45) : null,
      blockName:    `${name} ${year} Official Hotel Block`,
      portalUrl:    null,
      hotelOptions: null,
    }},
    6: { attendance: {
      expectedAttendees:  null,
      expectedExhibitors: null,
      priorYearAttendees: null,
      targetAudience:     event.subject || null,
    }},
    7: { contacts: {
      exhibitsManager:        null,
      exhibitsManagerEmail:   `exhibits@${slug.replace(/-/g, '')}.com`,
      sponsorshipContact:     null,
      sponsorshipContactEmail: `sponsors@${slug.replace(/-/g, '')}.com`,
      pressContact:           null,
    }},
    8: { opportunities: {
      speakingAvailable: null,
      speakingDeadline:  null,
      awardsPrograms:    null,
      coLocatedEvents:   null,
    }},
  };

  return mockData[category.id] || {};
}

function offsetDate(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function extractWithClaude(category, searchResults, event, dryRun) {
  if (dryRun || !process.env.ANTHROPIC_API_KEY) {
    if (!dryRun) {
      console.warn('[research-agent] WARNING: ANTHROPIC_API_KEY not set. Using mock extraction.');
    }
    return generateMockExtraction(category, event);
  }

  // Lazy-load Anthropic SDK only when actually needed
  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk');
  } catch {
    console.warn('[research-agent] WARNING: @anthropic-ai/sdk not installed. Run: npm install. Using mock extraction.');
    return generateMockExtraction(category, event);
  }

  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  const eventName = getEventName(event);
  const year      = getEventYear(event);

  const userPrompt = [
    `You are extracting structured data about the tradeshow/conference: "${eventName} ${year}"`,
    ``,
    `SEARCH RESULTS:`,
    `─────────────────────────────────────────────────────────`,
    searchResults,
    `─────────────────────────────────────────────────────────`,
    ``,
    category.instruction,
    ``,
    `RULES:`,
    `- Only extract what is explicitly stated in the search results above`,
    `- Never guess or interpolate`,
    `- Dates must be YYYY-MM-DD`,
    `- Numbers must be numeric (no $ signs, no commas)`,
    `- Set any field to null if not found`,
  ].join('\n');

  const msg = await client.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 1024,
    system:     'You are a precise data extraction assistant. Return only valid JSON. No markdown, no explanation.',
    messages:   [{ role: 'user', content: userPrompt }],
  });

  const responseText = msg.content[0]?.text || '{}';
  try {
    return JSON.parse(responseText);
  } catch {
    console.warn(`[research-agent] WARNING: Claude response was not valid JSON for category ${category.id}. Skipping.`);
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: CONFIDENCE SCORING
// ═══════════════════════════════════════════════════════════════════════════════

// Date fields require official site + secondary source for "high" confidence
const DATE_FIELDS = new Set([
  'show.startDate', 'show.endDate',
  'dates.setupStart', 'dates.teardownEnd',
  'booth.earlyBirdDeadline', 'booth.standardDeadline', 'booth.paymentDue', 'booth.designDeadline',
  'booth.registrationDeadline', 'sponsorship.deadline', 'housing.deadline',
  'opportunities.speakingDeadline',
]);

// Address fields: high confidence requires venue/maps source AND official site cross-reference
const ADDR_FIELDS = new Set([
  'venue.street', 'venue.city', 'venue.state', 'venue.country', 'venue.name',
  'dates.fullAddress', 'dates.gpsLat', 'dates.gpsLng',
]);

function scoreConfidence(extracted, officialDomain, sourceUrls, dryRun) {
  const confidence = {};

  for (const field of TRACKED_FIELDS) {
    const [cat, key] = field.split('.');
    const value = extracted[cat]?.[key];

    if (value === null || value === undefined) {
      confidence[field] = null;
      continue;
    }

    if (dryRun) {
      // In mock mode, flag everything as 'low' — mock data is not real sourcing
      confidence[field] = 'low';
      continue;
    }

    const fromOfficialSite = sourceUrls.some(u => officialDomain && u.includes(officialDomain));
    const fromSecondary    = sourceUrls.length > (fromOfficialSite ? 1 : 0);

    if (DATE_FIELDS.has(field)) {
      // Date fields: high = official site + at least one secondary (press release, calendar, prospectus)
      if (fromOfficialSite && fromSecondary) confidence[field] = 'high';
      else if (fromOfficialSite)             confidence[field] = 'medium';
      else if (fromSecondary)                confidence[field] = 'low';
      else                                   confidence[field] = null;

    } else if (ADDR_FIELDS.has(field)) {
      // Address fields: high = venue's own site or mapping service + official site cross-reference
      const fromVenueOrMaps = sourceUrls.some(u =>
        /maps\.google|openstreetmap|maps\.apple|venue|convention-center|exhibition-center|palais|messe/i.test(u)
      );
      if ((fromVenueOrMaps || fromSecondary) && fromOfficialSite) confidence[field] = 'high';
      else if (fromOfficialSite)                                   confidence[field] = 'medium';
      else if (fromSecondary || fromVenueOrMaps)                   confidence[field] = 'low';
      else {
        // Value present but no URL source — may be inferred from a known venue name
        const venueName = extracted?.venue?.name;
        confidence[field] = venueName ? 'low' : null;
      }

    } else {
      // Standard fields: existing two-source logic
      if (fromOfficialSite && fromSecondary) confidence[field] = 'high';
      else if (fromOfficialSite)             confidence[field] = 'medium';
      else if (fromSecondary)                confidence[field] = 'low';
      else                                   confidence[field] = null;
    }
  }

  return confidence;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: DELTA BUILDING
// ═══════════════════════════════════════════════════════════════════════════════

function getNestedValue(obj, dotPath) {
  return dotPath.split('.').reduce((o, k) => o?.[k] ?? null, obj);
}

function setNestedValue(obj, dotPath, value) {
  const keys = dotPath.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => {
    if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    return o[k];
  }, obj);
  target[last] = value;
}

function buildDelta(existingResearch, newIntelligence, confidence) {
  const changedFields    = [];
  const previousValues   = {};
  const newValues        = {};

  for (const field of TRACKED_FIELDS) {
    const newVal = getNestedValue(newIntelligence, field);
    if (newVal === null || newVal === undefined) continue;

    const prevVal = getNestedValue(existingResearch?.intelligence || {}, field);
    const isSame  = JSON.stringify(prevVal) === JSON.stringify(newVal);
    if (isSame) continue;

    changedFields.push(field);
    previousValues[field] = prevVal ?? null;
    newValues[field]      = newVal;
  }

  return { changedFields, previousValues, newValues };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: PROTECTED FIELD CHECK
// ═══════════════════════════════════════════════════════════════════════════════

function applyProtectedFieldCheck(delta, existingResearch, forceOverwrite) {
  const humanVerified = existingResearch?.humanVerified || {};
  const skipped       = [];

  delta.changedFields = delta.changedFields.filter(field => {
    if (humanVerified[field] === true) {
      if (forceOverwrite) {
        console.warn(`[research-agent] ⚠ FORCE-OVERWRITE active: overwriting humanVerified field "${field}"`);
        return true;
      }
      console.warn(`[research-agent] ⚠ Skipping protected field "${field}" (humanVerified: true). Use --force-overwrite to override.`);
      skipped.push(field);
      delete delta.previousValues[field];
      delete delta.newValues[field];
      return false;
    }
    return true;
  });

  return skipped;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: INTELLIGENCE SCORE
// ═══════════════════════════════════════════════════════════════════════════════

function calculateIntelligenceScore(intelligence) {
  let nonNull = 0;
  for (const field of TRACKED_FIELDS) {
    const val = getNestedValue(intelligence, field);
    if (val !== null && val !== undefined) nonNull++;
  }
  return Math.round((nonNull / TRACKED_FIELDS.length) * 100 * 10) / 10;
}

function getMissingFields(intelligence) {
  return TRACKED_FIELDS.filter(f => {
    const v = getNestedValue(intelligence, f);
    return v === null || v === undefined;
  });
}

/**
 * Merge a nested extraction result object into allIntelligence.
 * Optionally track which dot-paths were populated in a Set (for confidence overrides).
 * Only writes non-null values; never overwrites an existing value with null.
 */
function mergeIntoIntelligence(extracted, allIntelligence, trackedSet) {
  for (const [schema, fields] of Object.entries(extracted || {})) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
    if (!allIntelligence[schema]) allIntelligence[schema] = {};
    for (const [key, val] of Object.entries(fields)) {
      if (val !== null && val !== undefined) {
        const dotPath = `${schema}.${key}`;
        // Don't overwrite a value already confirmed from the official website
        if (!trackedSet?.has(dotPath)) {
          allIntelligence[schema][key] = val;
          trackedSet?.add(dotPath);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: EVENTS.JSON WRITE (atomic)
// ═══════════════════════════════════════════════════════════════════════════════

function writeEventsJson(eventsData, dryRun) {
  if (dryRun) {
    console.log('\n[research-agent] [DRY RUN] Would write updated master-events.json (no file changes made).');
    return;
  }
  const tmpFile = MASTER_FILE + '.tmp';
  const output  = { ...eventsData, lastUpdated: new Date().toISOString() };
  fs.writeFileSync(tmpFile, JSON.stringify(output, null, 2), 'utf8');
  try {
    fs.renameSync(tmpFile, MASTER_FILE);
  } catch {
    // On Windows, rename over existing file may fail — unlink then rename
    fs.unlinkSync(MASTER_FILE);
    fs.renameSync(tmpFile, MASTER_FILE);
  }
  console.log('[research-agent] ✓ master-events.json written successfully.');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: SUMMARY PRINTING
// ═══════════════════════════════════════════════════════════════════════════════

function printSummary(event, delta, intelligence, confidence, skippedFields, proposalCount) {
  const name  = getEventName(event);
  const score = calculateIntelligenceScore(intelligence);
  const missing = getMissingFields(intelligence);

  console.log('\n' + '═'.repeat(60));
  console.log(`RESEARCH SUMMARY — ${name} (${event.code})`);
  console.log('═'.repeat(60));
  if (proposalCount !== undefined && proposalCount > 0) {
    console.log(`Agent Proposals Written: ${proposalCount} fields (review in dashboard)`);
  }
  console.log(`Intelligence Score: ${score}% (${TRACKED_FIELDS.length - missing.length}/${TRACKED_FIELDS.length} fields populated)`);
  console.log('');

  if (delta.changedFields.length > 0) {
    console.log(`Fields Updated (${delta.changedFields.length}):`);
    delta.changedFields.forEach(f => {
      const conf = confidence[f] ? ` [${confidence[f]}]` : '';
      const val  = JSON.stringify(delta.newValues[f]);
      const display = val && val.length > 60 ? val.slice(0, 57) + '...' : val;
      console.log(`  ✓ ${f}${conf}: ${display}`);
    });
  } else {
    console.log('Fields Updated: none (no new data found)');
  }

  console.log('');
  if (missing.length > 0) {
    console.log(`Fields Still Missing (${missing.length}):`);
    missing.forEach(f => console.log(`  ✗ ${f}`));
  } else {
    console.log('Fields Still Missing: none — full coverage achieved!');
  }

  if (skippedFields.length > 0) {
    console.log('');
    console.log(`Skipped (humanVerified protection) (${skippedFields.length}):`);
    skippedFields.forEach(f => console.log(`  ⚠ ${f}`));
  }

  const _region      = event.region || null;
  const _regionHints = _region ? REGION_SEARCH_HINTS[_region] : null;
  if (_regionHints) {
    console.log('');
    console.log(`Region-specific sources checked (${_region}):`);
    _regionHints.sourceNotes.forEach(s => console.log(`  • ${s}`));
  }

  console.log('═'.repeat(60) + '\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: SINGLE EVENT RESEARCH PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

async function researchEvent(event, args) {
  const name  = getEventName(event);
  const year  = getEventYear(event);
  const { dryRun, forceOverwrite } = args;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[research-agent] Starting research: ${name} (${event.code}) — ${year}`);
  if (dryRun)         console.log('[research-agent] MODE: DRY RUN — no files will be written');
  if (forceOverwrite) console.warn('[research-agent] ⚠ WARNING: --force-overwrite is ACTIVE — humanVerified fields may be overwritten!');
  console.log(`${'─'.repeat(60)}`);

  const allIntelligence = {};
  const allConfidence   = {};
  const allSourceUrls   = [];
  let   officialDomain  = null;
  let   primarySearchQuery = null; // first query used — fallback label if no URL verifies

  // ── Regional search hints ─────────────────────────────────────────────────
  const region      = args.region || event.region || null;
  const regionHints = region ? REGION_SEARCH_HINTS[region] : null;

  // ── Track fields sourced directly from official website ───────────────────
  const officiallyExtractedFields = new Set(); // dot-paths confirmed from official page
  let   officialWebsiteVerifiedUrl = null;      // the URL we actually fetched and read

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Fetch the official website first (always, before any web search)
  // ══════════════════════════════════════════════════════════════════════════
  const knownWebsiteUrl = event.sharepoint?.['Event Website'] || null;
  if (knownWebsiteUrl && !dryRun) {
    console.log(`\n[research-agent] 🌐 Step 1 — Fetching official website: ${knownWebsiteUrl}`);
    const rawHtml = await fetchFullPage(knownWebsiteUrl);
    if (rawHtml) {
      officialWebsiteVerifiedUrl = knownWebsiteUrl;
      try { officialDomain = new URL(knownWebsiteUrl).hostname.replace(/^www\./, ''); } catch {}
      allSourceUrls.push(knownWebsiteUrl);

      const pageText = htmlToText(rawHtml);
      console.log(`[research-agent]   ✓ Page fetched (${Math.round(pageText.length / 1024)} KB text)`);

      const mainExtracted = await extractAllFieldsWithClaude(pageText, event, knownWebsiteUrl, dryRun);
      mergeIntoIntelligence(mainExtracted, allIntelligence, officiallyExtractedFields);

      if (officiallyExtractedFields.size > 0) {
        console.log(`[research-agent]   ✓ Extracted ${officiallyExtractedFields.size} field(s) from main page:`);
        for (const f of [...officiallyExtractedFields].sort()) {
          const [s, k] = f.split('.');
          console.log(`[research-agent]     · ${f}: ${JSON.stringify(allIntelligence[s]?.[k])}`);
        }
      } else {
        console.log(`[research-agent]   ⚠ No fields extracted from main page (ANTHROPIC_API_KEY may not be set)`);
      }

      // ════════════════════════════════════════════════════════════════════════
      // STEP 2 — Check subpages for fields still null after the main page
      // ════════════════════════════════════════════════════════════════════════
      const missingAfterMain = TRACKED_FIELDS.filter(f => {
        const [cat, key] = f.split('.');
        return allIntelligence[cat]?.[key] == null;
      });

      if (missingAfterMain.length > 0) {
        const subpageLinks  = findSubpageLinks(rawHtml, knownWebsiteUrl);
        const missingCats   = new Set(missingAfterMain.map(f => f.split('.')[0]));
        const relevantLinks = subpageLinks.filter(l => l.categories.some(c => missingCats.has(c)));
        if (relevantLinks.length > 0) {
          console.log(`[research-agent]   → ${missingAfterMain.length} fields still null — checking ${relevantLinks.length} relevant subpage(s)`);
          for (const link of relevantLinks.slice(0, 4)) {
            console.log(`[research-agent]   🔗 Subpage: ${link.url} ("${link.text}")`);
            const subHtml = await fetchFullPage(link.url);
            if (!subHtml) { console.log(`[research-agent]     ✗ Could not fetch`); continue; }
            const subText    = htmlToText(subHtml);
            const subExtracted = await extractAllFieldsWithClaude(subText, event, link.url, dryRun);
            const beforeSize = officiallyExtractedFields.size;
            mergeIntoIntelligence(subExtracted, allIntelligence, officiallyExtractedFields);
            const gained = officiallyExtractedFields.size - beforeSize;
            console.log(`[research-agent]     ✓ +${gained} new field(s) from subpage`);
            if (gained > 0) allSourceUrls.push(link.url);
          }
        }
      }

      // ── Venue address lookup when venue name is known but street is missing ──
      // Per field rules: search for venue's own website or mapping service to find street address.
      // This is Inferred / Medium confidence (not from event page) — NOT added to officiallyExtractedFields.
      if (allIntelligence.venue?.name && !allIntelligence.venue?.street) {
        const venueName  = allIntelligence.venue.name;
        const venueCity  = allIntelligence.venue.city || '';
        const venueQuery = `"${venueName}" ${venueCity} address street`.trim();
        console.log(`[research-agent]   🏢 Venue street not on event site — address lookup: "${venueQuery}"`);
        const venueResult = await performSearch(venueQuery, event, dryRun);
        const venueUrls   = [...venueResult.matchAll(/https?:\/\/[^\s\n"')]+/g)].map(m => m[0]);
        allSourceUrls.push(...venueUrls);
        const addrCat = SEARCH_CATEGORIES.find(c => c.id === 9);
        const addrExtracted = await extractWithClaude(addrCat, venueResult, event, dryRun);
        if (addrExtracted?.venue?.street) {
          if (!allIntelligence.venue) allIntelligence.venue = {};
          allIntelligence.venue.street = addrExtracted.venue.street;
          // intentionally NOT added to officiallyExtractedFields — confidence stays Inferred
          console.log(`[research-agent]     ✓ Venue street: "${addrExtracted.venue.street}" [Inferred — venue lookup, not on event page]`);
        }
      }

    } else {
      console.log(`[research-agent]   ✗ Could not fetch official website — falling through to web searches`);
    }
  } else if (!knownWebsiteUrl) {
    console.log(`[research-agent] ℹ No Event Website URL in record — starting with web searches (Step 3 only)`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 — Web searches only for fields not yet sourced from official website
  // ══════════════════════════════════════════════════════════════════════════
  const coveredCount = officiallyExtractedFields.size;
  if (coveredCount > 0) {
    console.log(`\n[research-agent] Step 3 — Web search phase (${coveredCount} field(s) already sourced from official site — skipping covered categories)`);
  }

  // ── Run search categories for remaining null fields ───────────────────────
  for (const category of SEARCH_CATEGORIES) {
    // Skip entire category if every one of its fields was already sourced from the official website
    const allCovered = category.fields.length > 0 && category.fields.every(f => officiallyExtractedFields.has(f));
    if (allCovered) {
      console.log(`\n[research-agent] Category ${category.id}/${SEARCH_CATEGORIES.length} — ${category.name} (SKIPPED — all fields sourced from official website)`);
      continue;
    }

    let queries = category.queries(name, year);
    if (regionHints) queries = queries.map(q => q + ' ' + regionHints.querySuffix);
    if (!primarySearchQuery && queries.length > 0) primarySearchQuery = queries[0];
    console.log(`\n[research-agent] Category ${category.id}/${SEARCH_CATEGORIES.length} — ${category.name}`);

    let combinedResults = '';
    for (const query of queries) {
      console.log(`  🔍 Searching: "${query}"`);
      const result = await performSearch(query, event, dryRun);
      combinedResults += result + '\n\n';

      // Extract URLs from results for sourcing
      const urls = [...result.matchAll(/https?:\/\/[^\s\n"')]+/g)].map(m => m[0]);
      allSourceUrls.push(...urls);
    }

    // Detect official domain from category 1 results (only if not already set from known website URL)
    if (category.id === 1 && !officialDomain) {
      const officialMatch = combinedResults.match(/https?:\/\/(?:www\.)?([^\/\s]+)/);
      officialDomain = officialMatch?.[1] || null;
      if (officialDomain) console.log(`  🌐 Official domain detected: ${officialDomain}`);
    }

    // Extract structured fields
    const extracted = await extractWithClaude(category, combinedResults, event, dryRun);

    // Merge into allIntelligence (schema may be a string or array of strings)
    const schemas = Array.isArray(category.schema) ? category.schema : [category.schema];
    for (const s of schemas) {
      if (extracted[s]) {
        allIntelligence[s] = { ...(allIntelligence[s] || {}), ...extracted[s] };
      }
    }

    // Count non-null fields for this category
    const catFields  = category.fields;
    const populated  = catFields.filter(f => {
      const [cat, key] = f.split('.');
      return extracted[cat]?.[key] !== null && extracted[cat]?.[key] !== undefined;
    });
    const catConf = dryRun ? 'low (mock)' : (officialDomain ? 'medium' : 'low');
    console.log(`  ✓ Category ${category.id}/${SEARCH_CATEGORIES.length} complete — ${populated.length}/${catFields.length} fields extracted at ${catConf} confidence`);
  }

  // ── Score confidence ──────────────────────────────────────────────────────
  const confidence = scoreConfidence(allIntelligence, officialDomain, [...new Set(allSourceUrls)], dryRun);

  // Override: fields read directly from the official website are highest quality.
  // No secondary source needed when we fetched and read the authoritative page ourselves.
  if (!dryRun) {
    for (const field of officiallyExtractedFields) {
      const [cat, key] = field.split('.');
      if (allIntelligence[cat]?.[key] != null) {
        confidence[field] = 'high';
      }
    }
  }

  // ── Build delta (changed fields only) ────────────────────────────────────
  const existingResearch = event.research || {};
  const delta = buildDelta(existingResearch, allIntelligence, confidence);

  // ── Protected field check ─────────────────────────────────────────────────
  const skipped = applyProtectedFieldCheck(delta, existingResearch, forceOverwrite);

  // ── Merge intelligence into event record ──────────────────────────────────
  const mergedIntelligence = { ...(existingResearch.intelligence || {}) };
  for (const field of delta.changedFields) {
    setNestedValue(mergedIntelligence, field, delta.newValues[field]);
  }

  // ── Update meta ───────────────────────────────────────────────────────────
  const prevVersion = existingResearch.meta?.researchVersion ?? 0;
  const meta = {
    lastResearchedAt:  new Date().toISOString(),
    researchVersion:   prevVersion + 1,
    intelligenceScore: calculateIntelligenceScore(mergedIntelligence),
    sourceUrls:        [...new Set(allSourceUrls)].slice(0, 20),
    agentVersion:      AGENT_VERSION,
  };

  // ── Attach to event record ────────────────────────────────────────────────
  event.research = {
    intelligence:  mergedIntelligence,
    confidence,
    humanVerified: existingResearch.humanVerified || {},
    meta,
  };

  // ── Verify source URL before writing proposals ─────────────────────────────
  // If we already fetched the official website, it's pre-verified — use it as the
  // starting point for verifiedSource (search-result URLs are still verified below
  // as a fallback for proposals that did NOT come from the official website).
  const candidateUrls = [...new Set(allSourceUrls)].slice(0, 8);
  let verifiedSource  = { valid: false, finalUrl: null, fallbackType: 'search-query', note: null, wasRedirect: false, pageTitle: null };

  if (officialWebsiteVerifiedUrl) {
    // We navigated to this URL and confirmed it returned content — it's verified.
    verifiedSource = {
      valid: true, finalUrl: officialWebsiteVerifiedUrl, fallbackType: null,
      status: 200, note: null, wasRedirect: false,
      pageTitle: await fetchPageTitle(officialWebsiteVerifiedUrl),
    };
  }

  if (!dryRun && candidateUrls.length > 0) {
    console.log(`\n[research-agent] 🔗 Verifying source URLs (${candidateUrls.length} candidates)…`);
    for (const candidateUrl of candidateUrls) {
      const v = await verifyUrl(candidateUrl);
      if (v.valid) {
        verifiedSource = { ...v, pageTitle: null };
        verifiedSource.pageTitle = await fetchPageTitle(v.finalUrl);
        const redirect = v.wasRedirect ? ` → ${v.finalUrl}` : '';
        console.log(`[research-agent]   ✓ ${candidateUrl}${redirect}${verifiedSource.pageTitle ? ` "${verifiedSource.pageTitle}"` : ''}`);
        break;
      } else if (v.fallbackType === 'domain-root' && !verifiedSource.finalUrl) {
        // Keep best domain fallback in case no full URL verifies
        verifiedSource = { ...v, pageTitle: null };
        console.log(`[research-agent]   ⚠ ${candidateUrl} → domain root: ${v.finalUrl}`);
      } else {
        console.log(`[research-agent]   ✗ ${candidateUrl} (status ${v.status ?? 'error'})`);
      }
    }
    if (!verifiedSource.valid && !verifiedSource.finalUrl) {
      console.log(`[research-agent]   → No verifiable URL found. Proposals will record search query as source.`);
    }
  }

  // ── Write FIELD_MAP fields as proposals (new 5-layer schema) ─────────────
  if (!event.proposals)  event.proposals  = {};
  if (!event.dismissed)  event.dismissed  = {};
  if (!event.approved)   event.approved   = {};

  let proposalCount = 0;
  const proposedAt  = new Date().toISOString();

  for (const [intelPath, csvCol] of Object.entries(INTEL_TO_CSV)) {
    const value = getNestedValue(mergedIntelligence, intelPath);
    if (value === null || value === undefined || value === '') continue;

    // Skip if already dismissed or approved
    if (event.dismissed[csvCol]) continue;
    if (event.approved[csvCol])  continue;

    // Determine confidence, source provenance, and reasoning based on origin of this field
    let effectiveConf, reasoningMethod, reasoningNote, sourceUrl, sourceVerified, sourceNote, sourceTitleCache, sourceSearchQuery;

    if (officiallyExtractedFields.has(intelPath) && officialWebsiteVerifiedUrl) {
      // ── Sourced directly from the official event website ────────────────────
      // Reading the authoritative source ourselves → always high confidence, Direct method.
      effectiveConf    = 'high';
      reasoningMethod  = 'Direct';
      reasoningNote    = null;
      sourceUrl        = officialWebsiteVerifiedUrl;
      sourceVerified   = true;
      sourceNote       = null;
      sourceTitleCache = verifiedSource.pageTitle || null;
      sourceSearchQuery = null;
    } else {
      // ── Sourced from web search results ─────────────────────────────────────
      effectiveConf = confidence[intelPath] || 'low';
      if (verifiedSource.fallbackType === 'search-query' && effectiveConf !== 'low') {
        effectiveConf = 'low';
      }
      if (effectiveConf === 'high')        reasoningMethod = 'Corroborated';
      else if (effectiveConf === 'medium') reasoningMethod = 'Direct';
      else                                 reasoningMethod = 'Inferred';

      reasoningNote = null;
      if (reasoningMethod === 'Inferred' && ADDR_INTEL_FIELDS.has(intelPath)) {
        reasoningNote = 'Venue address derived from venue name lookup — not explicitly stated on event site.';
      }
      sourceUrl         = verifiedSource.finalUrl || null;
      sourceVerified    = verifiedSource.valid === true;
      sourceNote        = verifiedSource.note   || null;
      sourceTitleCache  = verifiedSource.pageTitle || null;
      sourceSearchQuery = verifiedSource.fallbackType === 'search-query'
        ? (primarySearchQuery || `${name} ${year}`)
        : null;
    }

    event.proposals[csvCol] = {
      value:             String(value).trim(),
      confidence:        effectiveConf,
      reasoningMethod,
      reasoningNote,
      sourceUrl,
      sourceVerified,
      sourceNote,
      sourceTitleCache,
      sourceSearchQuery,
      proposedAt,
    };
    proposalCount++;
  }

  return {
    event,
    delta: {
      ...delta,
      eventId:      event.code,
      eventName:    event.sharepoint?.['Title'] || event.code,
      source:       'research-agent',
      agentVersion: AGENT_VERSION,
      confidence,
      sourceUrls:   meta.sourceUrls,
      dryRun,
    },
    intelligence:   mergedIntelligence,
    confidence,
    skippedFields:  skipped,
    proposalCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: CHANGELOG + SHAREPOINT CALLS
// ═══════════════════════════════════════════════════════════════════════════════

async function callChangelog(delta) {
  try {
    const changelog = require('./changelog-engine');
    const changeSet = await changelog.append(delta);
    console.log(`[research-agent] ✓ Changelog updated — changeSetId: ${changeSet.changeSetId}`);
    return changeSet;
  } catch (err) {
    console.error('[research-agent] ERROR calling changelog-engine:', err.message);
    return null;
  }
}

async function callSharepointTodo(changeSet, delta) {
  if (!changeSet) {
    console.warn('[research-agent] Skipping SharePoint todos — no changeSetId (changelog failed).');
    return;
  }
  try {
    const spTodo = require('./sharepoint-todo');
    await spTodo.process(changeSet, delta);
  } catch (err) {
    console.error('[research-agent] ERROR calling sharepoint-todo:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: BATCH PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

function getBatchTargets(eventsData, staleDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);

  return eventsData.events.filter(e => {
    // Skip past events (meta.urgency in new schema, urgency in old)
    if ((e.meta?.urgency || e.urgency) === 'past') return false;
    const last = e.research?.meta?.lastResearchedAt;
    if (!last) return true;
    return new Date(last) < cutoff;
  });
}

// ─── Flag existing proposals that have never been source-verified ─────────────
/**
 * One-time migration pass: add sourceVerified:false to any proposal record that
 * pre-dates the URL verification system (i.e. lacks the sourceVerified field).
 * Returns the number of proposals flagged.
 */
function flagExistingProposals(eventsData) {
  let count = 0;
  for (const event of eventsData.events) {
    if (!event.proposals) continue;
    for (const prop of Object.values(event.proposals)) {
      if (prop.sourceVerified === undefined) {
        prop.sourceVerified    = false;
        prop.sourceNote        = prop.sourceNote        ?? null;
        prop.sourceTitleCache  = prop.sourceTitleCache  ?? null;
        prop.sourceSearchQuery = prop.sourceSearchQuery ?? null;
        count++;
      }
    }
  }
  return count;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const args      = parseArgs(process.argv.slice(2));
  const config    = loadConfig();
  const staleDays = config.researchAgent?.staleDays ?? 14;

  console.log('[research-agent] Safran Show Intelligence Agent v' + AGENT_VERSION);
  console.log('[research-agent] Loading master-events.json...');

  const eventsData = loadEvents();
  console.log(`[research-agent] Loaded ${eventsData.events.length} events.`);

  // One-time migration: flag legacy proposals that predate URL verification
  if (!args.dryRun) {
    const flagged = flagExistingProposals(eventsData);
    if (flagged > 0) {
      writeEventsJson(eventsData, false);
      console.log(`[research-agent] Flagged ${flagged} existing proposals with sourceVerified:false (one-time migration)`);
    }
  }

  let targets = [];

  if (args.batch) {
    if (!config.researchAgent?.batchEnabled) {
      console.error('[research-agent] ERROR: batchEnabled is false in config.json. Set to true to allow batch mode.');
      process.exit(1);
    }
    targets = getBatchTargets(eventsData, staleDays);
    if (args.region) {
      targets = targets.filter(e => (e.meta?.region || e.region) === args.region);
      console.log(`[research-agent] BATCH REGION FILTER: ${args.region} — ${targets.length} events`);
    }
    console.log(`[research-agent] BATCH MODE: ${targets.length} events need research (stale threshold: ${staleDays} days)`);
    if (targets.length === 0) {
      console.log('[research-agent] Nothing to do — all active events are up to date.');
      return;
    }
  } else {
    targets = [findEvent(eventsData, args.eventId)];
  }

  let processedCount = 0;
  let errorCount     = 0;

  for (const event of targets) {
    try {
      const result = await researchEvent(event, args);
      const { delta, intelligence, confidence, skippedFields, proposalCount } = result;

      // Write to master-events.json (mutates event object in eventsData.events in-place)
      writeEventsJson(eventsData, args.dryRun);

      // Print summary
      printSummary(event, delta, intelligence, confidence, skippedFields, proposalCount);

      // Downstream agents
      const changeSet = await callChangelog(delta);
      await callSharepointTodo(changeSet, delta);

      processedCount++;
    } catch (err) {
      console.error(`[research-agent] ERROR processing ${event.code}: ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
      errorCount++;
    }
  }

  console.log(`\n[research-agent] Done. Processed: ${processedCount}, Errors: ${errorCount}`);
}

main().catch(err => {
  console.error('[research-agent] Fatal error:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
