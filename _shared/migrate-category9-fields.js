/**
 * migrate-category9-fields.js
 * Adds null placeholder fields for Category 9 (Core Event Details) to events.json.
 *
 * What it does:
 *   1. Adds `street: null` at the top level of ALL events (matches existing city/state/country).
 *   2. For events that already have research.intelligence: adds null placeholders for
 *      show.startDate, show.endDate, venue.*, booth.size, booth.number, booth.registrationDeadline
 *      WITHOUT overwriting any non-null values.
 *
 * Safe to re-run: only adds fields that are missing; never overwrites.
 *
 * Usage: node _shared/migrate-category9-fields.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const EVENTS_FILE = path.join(__dirname, 'data', 'events.json');

// Top-level field to add to every event
const TOP_LEVEL_NEW_FIELD = 'street';

// Intelligence sub-fields to null-initialize on events that already have research.intelligence
// Format: { schema: { field: null, ... } }
const INTEL_DEFAULTS = {
  show: {
    startDate: null,
    endDate:   null,
  },
  venue: {
    street:  null,
    city:    null,
    state:   null,
    country: null,
    name:    null,
  },
  booth: {
    size:                 null,
    number:               null,
    registrationDeadline: null,
  },
};

function setIfAbsent(target, key, defaultVal) {
  if (target[key] === undefined || target[key] === null) {
    target[key] = defaultVal;
    return true;
  }
  return false; // already has a value — do not overwrite
}

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    // Windows: rename over existing file may fail — unlink then rename
    fs.unlinkSync(filePath);
    fs.renameSync(tmp, filePath);
  }
}

function main() {
  console.log('[migrate-category9] Reading events.json...');
  const raw        = fs.readFileSync(EVENTS_FILE, 'utf8');
  const eventsData = JSON.parse(raw);

  let topLevelAdded    = 0;
  let intelSchemaAdded = 0;
  let intelFieldAdded  = 0;
  let skippedNonNull   = 0;
  let researchedEvents = 0;

  for (const event of eventsData.events) {
    // 1. Add `street: null` at top level if not present
    if (!(TOP_LEVEL_NEW_FIELD in event)) {
      event[TOP_LEVEL_NEW_FIELD] = null;
      topLevelAdded++;
    }

    // 2. Add intelligence placeholders only for events that already have research.intelligence
    const intel = event.research?.intelligence;
    if (!intel) continue;

    researchedEvents++;

    for (const [schema, fields] of Object.entries(INTEL_DEFAULTS)) {
      if (!intel[schema]) {
        intel[schema] = {};
        intelSchemaAdded++;
      }
      for (const [field, defaultVal] of Object.entries(fields)) {
        if (intel[schema][field] !== undefined && intel[schema][field] !== null) {
          skippedNonNull++;
        } else if (!(field in intel[schema])) {
          intel[schema][field] = defaultVal;
          intelFieldAdded++;
        }
        // If already null: leave it (no change needed)
      }
    }
  }

  eventsData.lastUpdated = new Date().toISOString();

  console.log('[migrate-category9] Writing events.json (atomic)...');
  atomicWrite(EVENTS_FILE, eventsData);

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  MIGRATION COMPLETE — Category 9 Fields');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Total events processed:          ${eventsData.events.length}`);
  console.log(`  Top-level 'street' field added:  ${topLevelAdded}`);
  console.log(`  Events with existing research:   ${researchedEvents}`);
  console.log(`  New intelligence schemas added:  ${intelSchemaAdded}`);
  console.log(`  New null intelligence fields:    ${intelFieldAdded}`);
  console.log(`  Non-null fields preserved:       ${skippedNonNull}`);
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('  Fields added to research.intelligence:');
  for (const [schema, fields] of Object.entries(INTEL_DEFAULTS)) {
    console.log(`    ${schema}: { ${Object.keys(fields).join(', ')} }`);
  }
  console.log('');
  console.log('  Run: node research-agent.js --eventId <code> --dry-run');
  console.log('       to verify Category 9 searches are included.');
  console.log('═══════════════════════════════════════════════');
}

main();
