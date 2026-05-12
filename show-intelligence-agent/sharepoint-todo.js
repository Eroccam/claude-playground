/**
 * sharepoint-todo.js  v1.0.0
 * Receives a changeSet (from changelog-engine) and the originating delta,
 * maps each changed field to a SharePoint page via sharepoint-page-map.json,
 * builds a structured to-do set, and appends it to _shared/data/sharepoint-todos.json.
 *
 * If sharepoint-page-map.json does not exist in show-intelligence-agent/,
 * it is created automatically with a default mapping template.
 *
 * Usage (module):
 *   const spTodo = require('./sharepoint-todo');
 *   await spTodo.process(changeSet, delta);
 *
 * Usage (CLI):
 *   node sharepoint-todo.js --changeset '{"changeSetId":"clog-...","eventId":"PXT26",...}' --delta '{...}'
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SHARED_DATA   = path.resolve(__dirname, '../_shared/data');
const TODOS_FILE    = path.join(SHARED_DATA, 'sharepoint-todos.json');
const PAGE_MAP_FILE = path.join(__dirname, 'sharepoint-page-map.json');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: RECEIVE CHANGESET + DELTA
// changeSet shape (from changelog-engine output):
//   { changeSetId, timestamp, eventId, eventName, triggeredBy, agentVersion,
//     sourceUrls, changes[{ field, previousValue, newValue, confidence }], noOp }
// delta shape (from research-agent):
//   { changedFields, previousValues, newValues, confidence, sourceUrls, dryRun, ... }
// ═══════════════════════════════════════════════════════════════════════════════

function validateChangeSet(changeSet) {
  if (!changeSet || typeof changeSet !== 'object') {
    throw new Error('sharepoint-todo: changeSet must be an object');
  }
  if (!changeSet.changeSetId) {
    throw new Error('sharepoint-todo: changeSet.changeSetId is required');
  }
  if (!changeSet.eventId) {
    throw new Error('sharepoint-todo: changeSet.eventId is required');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: LOAD/CREATE SHAREPOINT PAGE MAP
// Reads sharepoint-page-map.json from show-intelligence-agent/ directory.
// If the file does not exist, creates it with a default mapping template
// covering all 8 research field categories.
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_PAGE_MAP = {
  _description: 'Maps research field categories to SharePoint page paths. Edit spPath values to match your SharePoint instance.',
  _baseUrl:     'https://your-tenant.sharepoint.com/sites/SafranEvents',
  _instructions:'Replace "your-tenant" with your actual SharePoint tenant name.',
  identity:     { spPath: '/sites/SafranEvents/SitePages/Event-Overview.aspx',  section: 'Show Identity',       description: 'Official website, organizer name, edition number, hashtags' },
  dates:        { spPath: '/sites/SafranEvents/SitePages/Event-Logistics.aspx', section: 'Key Dates',           description: 'Setup/teardown dates, venue address, GPS coordinates' },
  booth:        { spPath: '/sites/SafranEvents/SitePages/Action-Items.aspx',    section: 'Booth & Exhibit',      description: 'Booth deadlines, pricing, cancellation policy, prospectus PDF' },
  sponsorship:  { spPath: '/sites/SafranEvents/SitePages/Sponsorship.aspx',     section: 'Packages & Pricing',  description: 'Sponsorship tiers, pricing, benefits, logo specs' },
  housing:      { spPath: '/sites/SafranEvents/SitePages/Event-Logistics.aspx', section: 'Housing & Hotels',    description: 'Hotel block name, housing deadline, booking portal' },
  attendance:   { spPath: '/sites/SafranEvents/SitePages/Event-Overview.aspx',  section: 'Attendance & Audience', description: 'Attendee/exhibitor counts, prior year, target audience' },
  contacts:     { spPath: '/sites/SafranEvents/SitePages/Contacts.aspx',        section: 'Organizer Contacts',  description: 'Exhibits manager, sponsorship contact, press contact' },
  opportunities:{ spPath: '/sites/SafranEvents/SitePages/Action-Items.aspx',    section: 'Speaking & Awards',   description: 'Speaking opportunities, awards programs, co-located events' },
};

function loadPageMap() {
  if (!fs.existsSync(PAGE_MAP_FILE)) {
    console.log('[sharepoint-todo] sharepoint-page-map.json not found — creating default template...');
    fs.writeFileSync(PAGE_MAP_FILE, JSON.stringify(DEFAULT_PAGE_MAP, null, 2), 'utf8');
    console.log('[sharepoint-todo] ✓ Created sharepoint-page-map.json — customize spPath values for your SharePoint instance.');
  }
  try {
    return JSON.parse(fs.readFileSync(PAGE_MAP_FILE, 'utf8'));
  } catch (err) {
    console.error('[sharepoint-todo] ERROR reading sharepoint-page-map.json:', err.message);
    return DEFAULT_PAGE_MAP;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: MAP FIELDS TO SP PAGES
// Each changed field has a dotted path like "booth.earlyBirdDeadline".
// The first segment (e.g. "booth") is the category key into pageMap.
// Returns { spPath, section } for the field, falling back to 'identity' page.
// ═══════════════════════════════════════════════════════════════════════════════

function mapFieldToSP(fieldPath, pageMap) {
  const category = fieldPath.split('.')[0];
  const mapping  = pageMap[category];
  if (!mapping || mapping.spPath === undefined) {
    return {
      spPath:  pageMap.identity?.spPath  || '/sites/SafranEvents/SitePages/Event-Overview.aspx',
      section: pageMap.identity?.section || 'General Info',
    };
  }
  return { spPath: mapping.spPath, section: mapping.section };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: DETERMINE ACTION TYPE
// action = 'update' if confidence is 'high'    — data is reliable, just update SP
// action = 'review' if confidence is 'medium'  — found on official site, double-check
// action = 'verify' if confidence is 'low'     — secondary source only, verify before use
// action = 'verify' if confidence is null      — not confirmed from any source
// ═══════════════════════════════════════════════════════════════════════════════

function confidenceToAction(confidence) {
  if (confidence === 'high')   return 'update';
  if (confidence === 'medium') return 'review';
  return 'verify';
}

function buildTaskDescription(field, action, newValue, spPage, section, eventName) {
  const fieldLabel = field.replace(/\./g, ' → ');
  const valDisplay = (() => {
    if (newValue === null || newValue === undefined) return '(null)';
    if (typeof newValue === 'object') return JSON.stringify(newValue).slice(0, 80);
    return String(newValue).slice(0, 80);
  })();

  const actionVerb = {
    update: 'Update',
    review: 'Review and update',
    verify: 'Verify from source, then update',
  }[action] || 'Update';

  return `${actionVerb} "${fieldLabel}" on SharePoint ${section} page for ${eventName}. New value: ${valDisplay}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: BUILD TASK LIST
// For each changed field in changeSet.changes, create one task object.
// If changeSet.noOp is true, create a single no-op log task.
// ═══════════════════════════════════════════════════════════════════════════════

function buildTaskSetId(changeSetId) {
  return changeSetId.replace('clog-', 'todo-');
}

function buildTaskList(changeSet, pageMap, delta) {
  const eventName   = changeSet.eventName || changeSet.eventId;
  const sourceUrls  = delta?.sourceUrls || changeSet.sourceUrls || [];

  if (changeSet.noOp) {
    return [{
      taskId:        `task-${changeSet.changeSetId}-noop`,
      category:      'meta',
      action:        'verify',
      description:   `Research run for ${eventName} produced no new field changes. Verify data is current in SharePoint.`,
      spPage:        pageMap.identity?.spPath || '/sites/SafranEvents/SitePages/Event-Overview.aspx',
      spSection:     'General Info',
      fieldToUpdate: null,
      newValue:      null,
      sourceUrl:     sourceUrls[0] || null,
      complete:      false,
    }];
  }

  return changeSet.changes.map((change, idx) => {
    const { spPath, section } = mapFieldToSP(change.field, pageMap);
    const action = confidenceToAction(change.confidence);
    const category = change.field.split('.')[0];

    // Use the most relevant source URL (prefer official site)
    const primarySource = sourceUrls.find(u => u.includes('.org') || u.includes('.com')) || sourceUrls[0] || null;

    return {
      taskId:        `task-${changeSet.changeSetId}-${String(idx + 1).padStart(3, '0')}`,
      category,
      action,
      description:   buildTaskDescription(change.field, action, change.newValue, spPath, section, eventName),
      spPage:        spPath,
      spSection:     section,
      fieldToUpdate: change.field,
      newValue:      change.newValue,
      sourceUrl:     primarySource,
      complete:      false,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: APPEND TO SHAREPOINT-TODOS.JSON
// 1. Read existing sharepoint-todos.json (initialize [] if empty/missing)
// 2. Build the to-do set wrapper with metadata
// 3. Push and atomic-write
// ═══════════════════════════════════════════════════════════════════════════════

function readTodos() {
  try {
    const raw = fs.readFileSync(TODOS_FILE, 'utf8').trim();
    if (!raw || raw === '') return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTodos(entries) {
  const tmpFile = TODOS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(entries, null, 2), 'utf8');
  try {
    fs.renameSync(tmpFile, TODOS_FILE);
  } catch {
    fs.unlinkSync(TODOS_FILE);
    fs.renameSync(tmpFile, TODOS_FILE);
  }
}

function appendTodos(todoSet, dryRun) {
  if (dryRun) {
    console.log('[sharepoint-todo] [DRY RUN] to-do set that would be written:');
    console.log(JSON.stringify(todoSet, null, 2));
    return;
  }

  const existing = readTodos();
  existing.push(todoSet);
  writeTodos(existing);

  const taskCount = todoSet.tasks.length;
  const noun      = taskCount === 1 ? 'task' : 'tasks';
  console.log(`[sharepoint-todo] ✓ ${taskCount} ${noun} queued for event: ${todoSet.eventId} (set: ${todoSet.taskSetId})`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

async function process(changeSet, delta) {
  validateChangeSet(changeSet);

  const pageMap = loadPageMap();
  const tasks   = buildTaskList(changeSet, pageMap, delta);
  const dryRun  = delta?.dryRun || false;

  const todoSet = {
    taskSetId:    buildTaskSetId(changeSet.changeSetId),
    changeSetId:  changeSet.changeSetId,
    eventId:      changeSet.eventId,
    eventName:    changeSet.eventName || changeSet.eventId,
    createdAt:    new Date().toISOString(),
    status:       'pending',
    completedBy:  null,
    completedAt:  null,
    tasks,
  };

  appendTodos(todoSet, dryRun);
  return todoSet;
}

module.exports = { process };

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

if (require.main === module) {
  const csIdx    = process.argv.indexOf('--changeset');
  const deltaIdx = process.argv.indexOf('--delta');

  if (csIdx === -1 || !process.argv[csIdx + 1]) {
    console.error('[sharepoint-todo] Usage: node sharepoint-todo.js --changeset \'{ ... }\' [--delta \'{ ... }\']');
    process.exit(1);
  }

  let changeSet, delta = null;
  try {
    changeSet = JSON.parse(process.argv[csIdx + 1]);
  } catch {
    console.error('[sharepoint-todo] ERROR: --changeset value is not valid JSON');
    process.exit(1);
  }
  if (deltaIdx !== -1 && process.argv[deltaIdx + 1]) {
    try {
      delta = JSON.parse(process.argv[deltaIdx + 1]);
    } catch {
      console.warn('[sharepoint-todo] WARNING: --delta value is not valid JSON — proceeding without it');
    }
  }

  process(changeSet, delta).then(todoSet => {
    console.log(`[sharepoint-todo] Done. taskSetId: ${todoSet.taskSetId}`);
  }).catch(err => {
    console.error('[sharepoint-todo] Error:', err.message);
    process.exit(1);
  });
}
