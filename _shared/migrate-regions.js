#!/usr/bin/env node
// migrate-regions.js
// One-time migration: USA→Americas, add subRegion + regionalTags to all events,
// add userProfile block to config.json.
// Run AFTER manually backing up _shared/data/events.json.

'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.join(__dirname, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// ── Region mapping ──────────────────────────────────────────────────────────
const REGION_MAP = {
  USA:  { region: 'Americas', subRegion: 'US & Canada' },
  EMEA: { region: 'EMEA',     subRegion: null },
  APAC: { region: 'APAC',     subRegion: null },
};

// ── Atomic write (tmp + rename, with Windows fallback) ──────────────────────
function atomicWrite(filePath, content) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    fs.unlinkSync(filePath);
    fs.renameSync(tmp, filePath);
  }
}

// ── Migrate events.json ─────────────────────────────────────────────────────
console.log('[migrate-regions] Reading events.json...');
const eventsRaw  = fs.readFileSync(EVENTS_FILE, 'utf8');
const eventsData = JSON.parse(eventsRaw);
const events     = eventsData.events || [];

let migratedCount = 0;

for (const ev of events) {
  const mapping = REGION_MAP[ev.region];
  if (mapping) {
    if (ev.region === 'USA') migratedCount++;
    ev.region    = mapping.region;
    ev.subRegion = mapping.subRegion;
  } else {
    // Unknown region — preserve region, set subRegion null
    if (!Object.prototype.hasOwnProperty.call(ev, 'subRegion')) {
      ev.subRegion = null;
    }
  }
  // Add regionalTags if absent
  if (!Object.prototype.hasOwnProperty.call(ev, 'regionalTags')) {
    ev.regionalTags = [];
  }
}

eventsData.lastUpdated = new Date().toISOString();

console.log(`[migrate-regions] Writing updated events.json...`);
atomicWrite(EVENTS_FILE, JSON.stringify(eventsData, null, 2));
console.log(`[migrate-regions] ✓ Migrated ${migratedCount} events USA→Americas. ${events.length} events now have subRegion + regionalTags fields.`);

// ── Migrate config.json ─────────────────────────────────────────────────────
console.log('[migrate-regions] Reading config.json...');
const configRaw = fs.readFileSync(CONFIG_FILE, 'utf8');
const config    = JSON.parse(configRaw);

if (!config.userProfile) {
  config.userProfile = {
    name:              'Americas Tradeshow Manager',
    title:             'US Tradeshow Manager',
    primaryRegion:     'US & Canada',
    primaryTopRegion:  'Americas',
    secondaryRegions:  ['Latin America & Caribbean'],
    defaultView:       'my-region',
  };
  console.log('[migrate-regions] Writing updated config.json with userProfile block...');
  atomicWrite(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log('[migrate-regions] ✓ config.json updated with userProfile.');
} else {
  console.log('[migrate-regions] config.json already has userProfile — skipping.');
}

console.log('[migrate-regions] Migration complete.');
