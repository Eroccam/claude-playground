/**
 * research-agent.js  v2.0.0
 * Layer 3 — Orchestrating entry point.
 * Coordinates page fetching (fetcher.js) and Claude extraction (claude-engine.js)
 * across 5 research phases to populate event proposals in master-events.json.
 *
 * Usage:
 *   node research-agent.js --eventId smse26
 *   node research-agent.js --eventId smse26 --dry-run
 *   node research-agent.js --batch
 *   node research-agent.js --batch --dry-run
 *   node research-agent.js --eventId smse26 --force-overwrite
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
// Node 18+ has built-in fetch globally
const cheerio = require('cheerio');

const fetcher      = require('./fetcher');
const claudeEngine = require('./claude-engine');
const changelog    = require('./changelog-engine');
const spTodo       = require('./sharepoint-todo');

// ─── Paths ────────────────────────────────────────────────────────────────────
const SHARED_ROOT   = path.resolve(__dirname, '../_shared');
const SHARED_DATA   = path.join(SHARED_ROOT, 'data');
const MASTER_FILE   = path.join(SHARED_DATA, 'master-events.json');
const CONFIG_FILE   = path.join(SHARED_ROOT, 'config.json');
const STATUS_FILE   = path.join(SHARED_DATA, 'research-status.json');

const AGENT_VERSION = '2.0.0';

// ─── Target fields — what this agent researches ───────────────────────────────
// Each entry: name (dotpath for research.intelligence), csvCol, description, searchHint
const TARGET_FIELDS = [
  { name: 'startDate',            path: 'show.startDate',            csvCol: 'Start Date',                       description: 'Exact opening day of the public event (NOT setup day). Format YYYY-MM-DD.' },
  { name: 'endDate',              path: 'show.endDate',              csvCol: 'End Date',                         description: 'Exact closing day of the public event (last show day, NOT teardown). Format YYYY-MM-DD.' },
  { name: 'street',               path: 'venue.street',              csvCol: 'Event Location: Street',           description: 'Street number and street name only. No city, state, or country. E.g. "3333 Las Vegas Blvd South" or "Europaplein 24".' },
  { name: 'city',                 path: 'venue.city',                csvCol: 'Event Location: City',             description: 'City name only.' },
  { name: 'state',                path: 'venue.state',               csvCol: 'Event Location: State',            description: 'For US events: two-letter abbreviation (e.g. "NV", "CA"). For non-US: province or region name, or null.' },
  { name: 'country',              path: 'venue.country',             csvCol: 'Event Location: Country/Region',  description: 'Full country name. E.g. "United States" not "US". "Netherlands" not "NL".' },
  { name: 'venueName',            path: 'venue.name',                csvCol: 'Venue',                            description: 'Proper name of the facility only. No address or city. E.g. "RAI Amsterdam Convention Centre".' },
  { name: 'boothSize',            path: 'booth.size',                csvCol: 'Booth Size',                       description: 'Dimensions only, e.g. "10 x 10". Smallest standard available size first.' },
  { name: 'boothNumber',          path: 'booth.number',              csvCol: 'Booth#',                           description: "Safran's assigned booth number — only if on an official published floor plan or exhibitor list. Often null." },
  { name: 'registrationDeadline', path: 'booth.registrationDeadline', csvCol: 'Registration Deadline',          description: 'Final deadline for exhibitor registration / booth application. Format YYYY-MM-DD.' },
];

// CSV col → field descriptor lookup
const CSV_COL_MAP = {};
TARGET_FIELDS.forEach(f => { CSV_COL_MAP[f.csvCol] = f; });

// ─── Intel dotpath helper ──────────────────────────────────────────────────────
// path: "show.startDate" → nested read/write
function getIntelPath(master, dotpath) {
  const parts = dotpath.split('.');
  let obj = master?.research?.intelligence;
  if (!obj) return undefined;
  for (const p of parts) {
    if (obj == null) return undefined;
    obj = obj[p];
  }
  return obj;
}

function setIntelPath(master, dotpath, value) {
  const parts = dotpath.split('.');
  if (!master.research)             master.research = {};
  if (!master.research.intelligence) master.research.intelligence = {};
  let obj = master.research.intelligence;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
}

// ─── Config & data load ───────────────────────────────────────────────────────
function loadConfig() {
  const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  const cfg = JSON.parse(raw);
  if (!cfg.anthropicApiKey || !cfg.anthropicApiKey.startsWith('sk-')) {
    throw new Error('anthropicApiKey missing or invalid in _shared/config.json');
  }
  return cfg;
}

function loadMasterEvents() {
  const raw  = fs.readFileSync(MASTER_FILE, 'utf8');
  const data = JSON.parse(raw);
  return { data, events: data.events || data };
}

function saveMasterEvents(data) {
  const tmp = MASTER_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, MASTER_FILE);
  } catch {
    fs.unlinkSync(MASTER_FILE);
    fs.renameSync(tmp, MASTER_FILE);
  }
}

// ─── Status file ──────────────────────────────────────────────────────────────
function writeStatus(status) {
  const tmp = STATUS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  try { fs.renameSync(tmp, STATUS_FILE); } catch { try { fs.unlinkSync(STATUS_FILE); fs.renameSync(tmp, STATUS_FILE); } catch {} }
}

// ─── Getters: current values from event record ────────────────────────────────
function getSharepointValue(master, csvCol) {
  return master?.sharepoint?.[csvCol] ?? null;
}

function getApprovedOrEditedValue(master, csvCol) {
  return master?.approved?.[csvCol]?.value
      ?? master?.dashboardEdits?.[csvCol]?.value
      ?? null;
}

function isFieldAlreadyApproved(master, csvCol) {
  return !!(master?.approved?.[csvCol] || master?.dismissed?.[csvCol]);
}

// ─── Event Website from sharepoint layer ──────────────────────────────────────
function getEventWebsite(master) {
  return master?.sharepoint?.['Event Website']
      || master?.approved?.['Event Website']?.value
      || master?.dashboardEdits?.['Event Website']?.value
      || null;
}

function getEventName(master) {
  return master?.sharepoint?.['Title'] || master?.code || 'Unknown Event';
}

// ─── Field descriptor for extractFromPage ─────────────────────────────────────
function buildFieldDescriptors(master, fieldNames) {
  return fieldNames.map(name => {
    const tf  = TARGET_FIELDS.find(f => f.name === name);
    const cur = getSharepointValue(master, tf.csvCol) || getApprovedOrEditedValue(master, tf.csvCol);
    return { name, description: tf.description, currentValue: cur || null };
  });
}

// ─── Web search via DuckDuckGo ────────────────────────────────────────────────
async function webSearch(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), 15_000);
    const res        = await fetch(url, {
      signal:  controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SafranResearchBot/2.0)', 'Accept': 'text/html' },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const html = await res.text();
    const $    = cheerio.load(html);
    const urls = [];
    $('a.result__url, .result__extras__url, a[href*="duckduckgo.com/l/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      // DDG wraps links — extract the uddg param
      const m = href.match(/uddg=([^&]+)/);
      if (m) {
        try { urls.push(decodeURIComponent(m[1])); } catch {}
      }
    });
    // Also try direct result links
    $('h2.result__title a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.startsWith('http')) urls.push(href);
    });
    return [...new Set(urls)].filter(u => u.startsWith('http')).slice(0, 5);
  } catch {
    return [];
  }
}

// ─── Console output helpers ───────────────────────────────────────────────────
function log(msg)  { console.log(`[research-agent] ${msg}`); }
function warn(msg) { console.warn(`[research-agent] ⚠ ${msg}`); }

// ─── Collect which fields are still null ──────────────────────────────────────
function nullFields(findings) {
  return TARGET_FIELDS
    .filter(f => !findings[f.name] || findings[f.name].value === null || findings[f.name].value === '')
    .map(f => f.name);
}

// ─── Build event context ──────────────────────────────────────────────────────
function buildEventContext(master) {
  return {
    eventName:    getEventName(master),
    eventCode:    master.code,
    eventWebsite: getEventWebsite(master),
    region:       master?.meta?.region || master?.sharepoint?.['Region'] || '',
  };
}

// ─── Merge findings into findings map ─────────────────────────────────────────
function mergeFindings(findings, extracted, sourceUrl, sourcePageTitle) {
  if (!extracted || !extracted.fields) return;
  TARGET_FIELDS.forEach(tf => {
    if (findings[tf.name]?.value) return; // already found
    const f = extracted.fields[tf.name];
    if (f && f.value !== null && f.value !== '') {
      findings[tf.name] = {
        value:           f.value,
        confidence:      f.confidence || 'medium',
        reasoningMethod: f.reasoningMethod || 'direct',
        reasoning:       f.reasoning || null,
        sourceUrl:       sourceUrl || null,
        sourcePageTitle: sourcePageTitle || null,
        sourceVerified:  true,
      };
      log(`  Found: ${tf.name} = "${f.value}" (${f.confidence}, ${f.reasoningMethod})`);
    }
  });
}

// ─── Main per-event research flow ─────────────────────────────────────────────
async function researchEvent(master, opts = {}) {
  const { dryRun, forceOverwrite } = opts;
  const ctx     = buildEventContext(master);
  const eventId = master.code;

  // Track findings: { [fieldName]: { value, confidence, reasoningMethod, reasoning, sourceUrl, sourcePageTitle, sourceVerified } }
  const findings       = {};
  const visitedUrls    = new Set();
  const searchQueries  = {};   // fieldName → [queries]
  const pagesVisited   = [];

  // Skip fields already approved/dismissed (unless forceOverwrite)
  const skipFields = new Set();
  TARGET_FIELDS.forEach(f => {
    if (!forceOverwrite && isFieldAlreadyApproved(master, f.csvCol)) {
      skipFields.add(f.name);
    }
  });
  const activeFields = TARGET_FIELDS.filter(f => !skipFields.has(f.name)).map(f => f.name);
  if (activeFields.length === 0) {
    log(`${eventId}: All fields already approved — nothing to research.`);
    return { findings, pagesVisited, searchQueries };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PHASE 1 — Official website
  // ────────────────────────────────────────────────────────────────────────────
  writeStatus({ currentAction: 'Loading event record', eventName: ctx.eventName, eventId });

  const website = ctx.eventWebsite;
  let suggestedSubpages = [];

  if (website) {
    const domain = new URL(website).hostname;
    writeStatus({ currentAction: `Fetching official website — ${domain}`, currentUrl: website, eventName: ctx.eventName, eventId });
    log(`Phase 1 — fetching official website: ${website}`);

    const page = await fetcher.fetchPage(website);

    if (!page.success) {
      warn(`Could not fetch official website: ${page.error}`);
      writeStatus({ currentAction: `Website unreachable — ${page.error}`, eventName: ctx.eventName, eventId });
    } else {
      visitedUrls.add(page.finalUrl);
      pagesVisited.push({ url: page.finalUrl, title: page.pageTitle, phase: 'official-website' });
      writeStatus({ currentAction: `Reading page — ${page.pageTitle}`, currentUrl: page.finalUrl, eventName: ctx.eventName, eventId });

      const needed = activeFields.filter(n => !findings[n]?.value);
      const descriptors = buildFieldDescriptors(master, needed);
      const extracted = await claudeEngine.extractFromPage(page, descriptors, ctx);

      mergeFindings(findings, extracted, page.finalUrl, page.pageTitle);
      suggestedSubpages = extracted.suggestedSubpages || [];

      const foundN = needed.filter(n => findings[n]?.value).length;
      const stillN = needed.length - foundN;
      writeStatus({ currentAction: `Official website complete — ${foundN} fields found, ${stillN} still needed`, eventName: ctx.eventName, eventId });
      log(`Phase 1 complete — ${foundN} found, ${stillN} still needed`);
    }
  } else {
    log(`Phase 1 — no Event Website URL in record, skipping`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PHASE 2 — Subpage navigation
  // ────────────────────────────────────────────────────────────────────────────
  const stillNeeded1 = nullFields(findings).filter(n => activeFields.includes(n));

  if (stillNeeded1.length > 0 && suggestedSubpages.length > 0 && website) {
    log(`Phase 2 — subpage navigation (${stillNeeded1.length} fields still needed)`);
    const baseDomain = new URL(website).hostname.replace(/^www\./, '');

    // Filter same-domain, deduplicate
    const subpagesToVisit = suggestedSubpages
      .filter(sp => {
        if (!sp.url) return false;
        try {
          const subDomain = new URL(sp.url).hostname.replace(/^www\./, '');
          return subDomain === baseDomain || subDomain.endsWith('.' + baseDomain) || baseDomain.endsWith('.' + subDomain);
        } catch { return false; }
      })
      .filter(sp => !visitedUrls.has(sp.url))
      .slice(0, 6);

    for (const sp of subpagesToVisit) {
      const stillNow = nullFields(findings).filter(n => activeFields.includes(n));
      if (stillNow.length === 0) { log(`  All fields found — stopping subpage navigation`); break; }

      const urlPath = sp.url.split('/').slice(3).join('/').slice(0, 50);
      writeStatus({ currentAction: `Navigating to subpage — ${urlPath}`, currentUrl: sp.url, eventName: ctx.eventName, eventId });
      log(`  Fetching subpage: ${sp.url} (expected: ${sp.reason})`);

      const page = await fetcher.fetchPage(sp.url);
      if (!page.success) { warn(`  Subpage fetch failed: ${page.error}`); continue; }

      visitedUrls.add(page.finalUrl);
      pagesVisited.push({ url: page.finalUrl, title: page.pageTitle, phase: 'subpage' });

      const descriptors = buildFieldDescriptors(master, stillNow);
      const extracted   = await claudeEngine.extractFromPage(page, descriptors, ctx);
      mergeFindings(findings, extracted, page.finalUrl, page.pageTitle);
    }

    const foundAfter2 = TARGET_FIELDS.filter(f => activeFields.includes(f.name) && findings[f.name]?.value).length;
    writeStatus({ currentAction: `Subpage navigation complete — ${foundAfter2} total fields found`, eventName: ctx.eventName, eventId });
    log(`Phase 2 complete — ${foundAfter2} total fields found`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PHASE 3 — Web search fallback
  // ────────────────────────────────────────────────────────────────────────────
  const stillNeeded2 = nullFields(findings).filter(n => activeFields.includes(n));
  const year = new Date().getFullYear();

  if (stillNeeded2.length > 0) {
    log(`Phase 3 — web search fallback (${stillNeeded2.length} fields still null)`);

    const searchHints = {
      startDate:            `${ctx.eventName} ${year} show dates open`,
      endDate:              `${ctx.eventName} ${year} show dates close`,
      street:               `${ctx.eventName} ${year} venue street address`,
      city:                 `${ctx.eventName} ${year} venue location city`,
      state:                `${ctx.eventName} ${year} venue state province`,
      country:              `${ctx.eventName} ${year} venue country`,
      venueName:            `${ctx.eventName} ${year} venue convention center`,
      boothSize:            `${ctx.eventName} ${year} booth size exhibitor space`,
      boothNumber:          `${ctx.eventName} ${year} exhibitor list floor plan booth number`,
      registrationDeadline: `${ctx.eventName} ${year} exhibitor registration deadline`,
    };

    for (const fieldName of stillNeeded2) {
      const query = searchHints[fieldName] || `${ctx.eventName} ${year} ${fieldName}`;
      if (!searchQueries[fieldName]) searchQueries[fieldName] = [];
      searchQueries[fieldName].push(query);

      writeStatus({ currentAction: `Web search: ${query}`, eventName: ctx.eventName, eventId });
      log(`  Searching: "${query}"`);

      const resultUrls = await webSearch(query);
      let foundInSearch = false;

      for (const resultUrl of resultUrls.slice(0, 3)) {
        if (visitedUrls.has(resultUrl)) continue;
        const verified = await fetcher.verifyUrl(resultUrl);
        if (!verified.isLive) continue;

        const page = await fetcher.fetchPage(resultUrl);
        if (!page.success) continue;

        visitedUrls.add(page.finalUrl);
        pagesVisited.push({ url: page.finalUrl, title: page.pageTitle, phase: 'web-search' });

        const descriptors = buildFieldDescriptors(master, [fieldName]);
        const extracted   = await claudeEngine.extractFromPage(page, descriptors, ctx);
        mergeFindings(findings, extracted, page.finalUrl, page.pageTitle);

        if (findings[fieldName]?.value) { foundInSearch = true; break; }
      }
      if (!foundInSearch) log(`  "${fieldName}" not found in web search`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PHASE 4 — Venue address inference via Claude knowledge
  // ────────────────────────────────────────────────────────────────────────────
  const streetStillNull  = !findings.street?.value;
  const venueNameKnown   = findings.venueName?.value || getSharepointValue(master, 'Venue');
  const cityKnown        = findings.city?.value      || getSharepointValue(master, 'Event Location: City');
  const countryKnown     = findings.country?.value   || getSharepointValue(master, 'Event Location: Country/Region');

  if (streetStillNull && venueNameKnown && cityKnown && activeFields.includes('street')) {
    writeStatus({ currentAction: `Inferring venue address from Claude knowledge — ${venueNameKnown}`, eventName: ctx.eventName, eventId });
    log(`Phase 4 — inferring venue address for "${venueNameKnown}" in ${cityKnown}, ${countryKnown || ''}`);

    const inferred = await claudeEngine.inferVenueAddress(venueNameKnown, cityKnown, countryKnown || '');
    if (inferred.street) {
      findings.street = {
        value:           inferred.street,
        confidence:      inferred.confidence === 'high' ? 'medium' : 'low', // downgrade: no page source
        reasoningMethod: 'inferred',
        reasoning:       inferred.reasoning || 'Street address sourced from Claude knowledge of venue, not stated on event page.',
        sourceUrl:       null,
        sourcePageTitle: null,
        sourceVerified:  false,
      };
      log(`  Inferred street: "${inferred.street}" (${findings.street.confidence})`);
      writeStatus({ currentAction: `Venue street: "${inferred.street}"`, eventName: ctx.eventName, eventId });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PHASE 5 — Build proposals & write
  // ────────────────────────────────────────────────────────────────────────────
  const proposals   = {};
  const changedFields   = [];
  const previousValues  = {};
  const newValues       = {};
  const confidence      = {};
  const allSourceUrls   = [...new Set(Object.values(findings).filter(f => f?.sourceUrl).map(f => f.sourceUrl))];

  TARGET_FIELDS.forEach(tf => {
    if (skipFields.has(tf.name)) return;

    const found = findings[tf.name];
    const prevSP = getSharepointValue(master, tf.csvCol);

    if (found?.value) {
      proposals[tf.csvCol] = {
        value:           found.value,
        confidence:      found.confidence,
        reasoningMethod: found.reasoningMethod,
        reasoning:       found.reasoning || null,
        sourceUrl:       found.sourceUrl || null,
        sourcePageTitle: found.sourcePageTitle || null,
        sourceVerified:  found.sourceVerified ?? true,
        proposedAt:      new Date().toISOString(),
      };
      changedFields.push(tf.name);
      previousValues[tf.name]  = prevSP || null;
      newValues[tf.name]       = found.value;
      confidence[tf.name]      = found.confidence;
    } else {
      // Null result — record search history
      proposals[tf.csvCol] = {
        value:                  null,
        searchQueriesAttempted: searchQueries[tf.name] || [],
        pagesVisited:           pagesVisited.length,
        note:                   `Not found after searching ${pagesVisited.length} page(s) and ${(searchQueries[tf.name] || []).length} query(s)`,
        proposedAt:             new Date().toISOString(),
      };
    }
  });

  // DRY RUN — print and exit
  if (dryRun) {
    printDryRunSummary(master, findings, pagesVisited, searchQueries);
    return { findings, pagesVisited, searchQueries, dryRun: true };
  }

  // Write to master-events.json
  writeStatus({ currentAction: 'Writing proposals to master-events.json', eventName: ctx.eventName, eventId });
  log('Phase 5 — writing proposals to master-events.json');

  const { data, events } = loadMasterEvents();
  const idx = events.findIndex(e => e.code === eventId);
  if (idx === -1) throw new Error(`Event ${eventId} not found in master-events.json during write`);

  const ev = events[idx];
  if (!ev.proposals) ev.proposals = {};

  Object.entries(proposals).forEach(([csvCol, proposal]) => {
    // Don't overwrite if already approved/dismissed (unless forceOverwrite)
    if (!forceOverwrite && (ev.approved?.[csvCol] || ev.dismissed?.[csvCol])) return;
    ev.proposals[csvCol] = proposal;
  });

  // Update meta
  if (!ev.meta) ev.meta = {};
  ev.meta.lastResearchedAt  = new Date().toISOString();
  ev.meta.researchVersion   = 2;

  // Intelligence score: % of target fields that now have a value
  const filled = TARGET_FIELDS.filter(f => {
    return ev.proposals?.[f.csvCol]?.value || ev.approved?.[f.csvCol]?.value || ev.sharepoint?.[f.csvCol];
  }).length;
  ev.meta.intelligenceScore = Math.round((filled / TARGET_FIELDS.length) * 100);

  const writable = Array.isArray(data.events) ? data : { ...data, events };
  if (Array.isArray(data.events)) writable.events = events;
  else Object.assign(writable, events); // flat array case
  writable.lastUpdated = new Date().toISOString();

  saveMasterEvents(writable);
  writeStatus({ currentAction: 'Changelog updated', eventName: ctx.eventName, eventId });
  log('master-events.json written');

  // Call changelog-engine
  if (changedFields.length > 0) {
    const delta = {
      eventId,
      eventName:    ctx.eventName,
      source:       'research-agent',
      agentVersion: AGENT_VERSION,
      changedFields,
      previousValues,
      newValues,
      confidence,
      sourceUrls:   allSourceUrls,
      dryRun:       false,
    };
    try {
      const changeSet = await changelog.append(delta);
      log(`Changelog updated — changeSetId: ${changeSet.changeSetId}`);
      // Call sharepoint-todo
      try {
        await spTodo.process(changeSet, delta);
      } catch (e) {
        warn(`sharepoint-todo error (non-fatal): ${e.message}`);
      }
    } catch (e) {
      warn(`changelog error (non-fatal): ${e.message}`);
    }
  }

  writeStatus({
    isComplete:    true,
    currentAction: 'Research complete',
    eventName:     ctx.eventName,
    eventId,
    summary: {
      fieldsFound:      changedFields.length,
      fieldsNull:       TARGET_FIELDS.length - changedFields.length - skipFields.size,
      fieldsInferred:   Object.values(findings).filter(f => f?.reasoningMethod === 'inferred').length,
      proposalsWritten: changedFields.length,
    },
  });

  printSummary(master, findings, pagesVisited, searchQueries);
  return { findings, pagesVisited, searchQueries, dryRun: false };
}

// ─── Console output ───────────────────────────────────────────────────────────
function printSummary(master, findings, pagesVisited, searchQueries) {
  const name = getEventName(master);
  const found  = TARGET_FIELDS.filter(f => findings[f.name]?.value);
  const nullFs = TARGET_FIELDS.filter(f => !findings[f.name]?.value);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`RESEARCH COMPLETE: ${name}`);
  console.log(`Fields Found: ${found.length}    Fields Null: ${nullFs.length}`);
  console.log(`Pages Visited: ${pagesVisited.length}`);
  console.log('─'.repeat(60));
  console.log('FIELD RESULTS:');
  TARGET_FIELDS.forEach(f => {
    const r = findings[f.name];
    if (r?.value) {
      const domain = r.sourceUrl ? (new URL(r.sourceUrl).hostname || '') : 'inferred';
      console.log(`  ${f.name.padEnd(22)} ${String(r.value).slice(0, 40).padEnd(42)} ${r.confidence.padEnd(8)} ${r.reasoningMethod.padEnd(10)} ${domain}`);
    }
  });
  if (nullFs.length > 0) {
    console.log('\nNULL FIELDS:');
    nullFs.forEach(f => {
      const qs = (searchQueries[f.name] || []).join(', ') || '(none)';
      console.log(`  ${f.name.padEnd(22)} Searched: ${qs}`);
    });
  }
  console.log('═'.repeat(60) + '\n');
}

function printDryRunSummary(master, findings, pagesVisited, searchQueries) {
  console.log('\n[DRY RUN — no writes performed]');
  printSummary(master, findings, pagesVisited, searchQueries);
  console.log('DETAILED PROPOSALS (dry-run):');
  TARGET_FIELDS.forEach(f => {
    const r = findings[f.name];
    if (r?.value) {
      console.log(`\n  ${f.name}:`);
      console.log(`    value:     ${r.value}`);
      console.log(`    confidence: ${r.confidence}`);
      console.log(`    method:    ${r.reasoningMethod}`);
      if (r.reasoning) console.log(`    reasoning: ${r.reasoning}`);
      console.log(`    source:    ${r.sourceUrl || 'inferred'}`);
      console.log(`    title:     ${r.sourcePageTitle || 'N/A'}`);
    }
  });
}

// ─── Stale events for batch mode ──────────────────────────────────────────────
function isStaleEvent(master, staleDays = 14) {
  const last = master?.meta?.lastResearchedAt;
  if (!last) return true;
  const daysSince = (Date.now() - new Date(last).getTime()) / 86_400_000;
  return daysSince >= staleDays;
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const getArg = flag => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : null;
  };
  const hasFlag = flag => argv.includes(flag);

  const eventId      = getArg('--eventId');
  const batch        = hasFlag('--batch');
  const dryRun       = hasFlag('--dry-run');
  const forceOverwrite = hasFlag('--force-overwrite');

  if (!eventId && !batch) {
    console.error('[research-agent] Usage: node research-agent.js --eventId <code> [--dry-run] [--force-overwrite]');
    console.error('[research-agent]        node research-agent.js --batch [--dry-run]');
    process.exit(1);
  }

  // Validate API key on startup
  loadConfig();
  log(`Starting research agent v${AGENT_VERSION}${dryRun ? ' (DRY RUN)' : ''}${forceOverwrite ? ' (FORCE OVERWRITE)' : ''}`);

  const { events } = loadMasterEvents();

  if (batch) {
    const stale = events.filter(e => isStaleEvent(e));
    log(`Batch mode — ${stale.length} stale events to research (of ${events.length} total)`);
    for (const master of stale) {
      log(`\n--- Starting batch item: ${master.code} (${getEventName(master)}) ---`);
      try {
        await researchEvent(master, { dryRun, forceOverwrite });
      } catch (err) {
        warn(`Error researching ${master.code}: ${err.message}`);
      }
      if (!dryRun) {
        // Reload events for next iteration (in case writes updated)
        const fresh = loadMasterEvents();
        const idx   = fresh.events.findIndex(e => e.code === master.code);
        if (idx !== -1) Object.assign(master, fresh.events[idx]);
      }
      // 5-second pause between batch events
      if (!dryRun) await new Promise(r => setTimeout(r, 5_000));
    }
    log('Batch complete.');
    return;
  }

  // Single event
  const master = events.find(e => e.code === eventId || e.code === eventId.toUpperCase() || e.code.toLowerCase() === eventId.toLowerCase());
  if (!master) {
    console.error(`[research-agent] Event not found: ${eventId}`);
    process.exit(1);
  }

  try {
    await researchEvent(master, { dryRun, forceOverwrite });
  } catch (err) {
    console.error(`[research-agent] Fatal error: ${err.message}`);
    writeStatus({ isComplete: true, error: err.message, eventId, eventName: getEventName(master) });
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[research-agent] Unhandled error:', err);
  process.exit(1);
});
