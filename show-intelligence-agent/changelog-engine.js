/**
 * changelog-engine.js  v1.0.0
 * Receives a delta object from any agent, builds a structured changeSet,
 * and appends it atomically to _shared/data/changelog.json.
 *
 * Usage (module):
 *   const changelog = require('./changelog-engine');
 *   const changeSet = await changelog.append(delta);
 *   // changeSet.changeSetId → e.g. "clog-20260221-143022"
 *
 * Usage (CLI):
 *   node changelog-engine.js --delta '{"eventId":"PXT26",...}'
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SHARED_DATA    = path.resolve(__dirname, '../_shared/data');
const CHANGELOG_FILE = path.join(SHARED_DATA, 'changelog.json');
const AGENT_VERSION  = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: RECEIVE DELTA OBJECT
// Expected delta shape (from research-agent or any other caller):
//   {
//     eventId:        string,           — event code e.g. "PXT26"
//     eventName:      string,           — full event title
//     source:         string,           — 'research-agent' | 'manual' | 'import'
//     agentVersion:   string,
//     changedFields:  string[],         — dotted paths: ['booth.earlyBirdDeadline', ...]
//     previousValues: { [field]: any },
//     newValues:      { [field]: any },
//     confidence:     { [field]: 'high'|'medium'|'low'|null },
//     sourceUrls:     string[],
//     dryRun:         boolean,
//   }
// ═══════════════════════════════════════════════════════════════════════════════

function validateDelta(delta) {
  if (!delta || typeof delta !== 'object') {
    throw new Error('changelog-engine: delta must be an object');
  }
  if (!delta.eventId) {
    throw new Error('changelog-engine: delta.eventId is required');
  }
  if (!delta.source) {
    throw new Error('changelog-engine: delta.source is required (e.g. "research-agent")');
  }
  if (!Array.isArray(delta.changedFields)) {
    throw new Error('changelog-engine: delta.changedFields must be an array');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: BUILD CHANGESET RECORD
// Produces a canonical record with:
//   changeSetId  — format: clog-YYYYMMDD-HHMMSS
//   timestamp    — ISO 8601
//   triggeredBy  — agent name (delta.source)
//   sourceUrls   — array of URLs used as evidence
//   changes[]    — per-field: field, previousValue, newValue, confidence, humanVerified
//   noOp         — true if changedFields is empty
// ═══════════════════════════════════════════════════════════════════════════════

function buildChangeSetId() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `clog-${date}-${time}`;
}

function buildChangeSet(delta) {
  const changeSetId = buildChangeSetId();

  const changes = (delta.changedFields || []).map(field => ({
    field,
    previousValue: delta.previousValues?.[field] ?? null,
    newValue:      delta.newValues?.[field]       ?? null,
    confidence:    delta.confidence?.[field]      ?? null,
    humanVerified: false,   // agents never write humanVerified: true — that is manual only
  }));

  return {
    changeSetId,
    timestamp:    new Date().toISOString(),
    eventId:      delta.eventId,
    eventName:    delta.eventName  || null,
    triggeredBy:  delta.source     || 'unknown',
    agentVersion: delta.agentVersion || AGENT_VERSION,
    sourceUrls:   delta.sourceUrls   || [],
    changes,
    noOp:         changes.length === 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: APPEND TO CHANGELOG.JSON
// 1. Read existing changelog.json (initialize as [] if missing or empty)
// 2. Push new changeSet
// 3. Write atomically: write to .tmp, then rename
// 4. If dryRun: print to console only, skip write
// Returns: changeSet (always — even in dry-run)
// ═══════════════════════════════════════════════════════════════════════════════

function readChangelog() {
  try {
    const raw = fs.readFileSync(CHANGELOG_FILE, 'utf8').trim();
    if (!raw || raw === '') return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeChangelog(entries) {
  const tmpFile = CHANGELOG_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(entries, null, 2), 'utf8');
  try {
    fs.renameSync(tmpFile, CHANGELOG_FILE);
  } catch {
    fs.unlinkSync(CHANGELOG_FILE);
    fs.renameSync(tmpFile, CHANGELOG_FILE);
  }
}

function appendToChangelog(changeSet, dryRun) {
  if (dryRun) {
    console.log('[changelog-engine] [DRY RUN] changeSet that would be written:');
    console.log(JSON.stringify(changeSet, null, 2));
    return changeSet;
  }

  const existing = readChangelog();
  existing.push(changeSet);
  writeChangelog(existing);

  const noun = changeSet.noOp ? 'no-op entry' : `${changeSet.changes.length} change(s)`;
  console.log(`[changelog-engine] ✓ Appended ${noun} — changeSetId: ${changeSet.changeSetId}`);
  return changeSet;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

async function append(delta) {
  validateDelta(delta);
  const changeSet = buildChangeSet(delta);
  appendToChangelog(changeSet, delta.dryRun);
  return changeSet;
}

module.exports = { append };

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

if (require.main === module) {
  const idx = process.argv.indexOf('--delta');
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error('[changelog-engine] Usage: node changelog-engine.js --delta \'{ ... }\'');
    process.exit(1);
  }
  let delta;
  try {
    delta = JSON.parse(process.argv[idx + 1]);
  } catch {
    console.error('[changelog-engine] ERROR: --delta value is not valid JSON');
    process.exit(1);
  }
  append(delta).then(cs => {
    console.log('[changelog-engine] Done. changeSetId:', cs.changeSetId);
  }).catch(err => {
    console.error('[changelog-engine] Error:', err.message);
    process.exit(1);
  });
}
