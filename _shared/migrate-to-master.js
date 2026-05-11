/**
 * migrate-to-master.js
 * One-time migration: events.json → master-events.json (5-layer schema)
 * Run: node _shared/migrate-to-master.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SHARED_DATA = path.resolve(__dirname, 'data');
const EVENTS_FILE = path.join(SHARED_DATA, 'events.json');
const MASTER_FILE = path.join(SHARED_DATA, 'master-events.json');

// ─── Flat field → CSV column ──────────────────────────────────────────────────
const FLAT_TO_CSV = {
  title:                'Title',
  code:                 'Event Code',
  rank:                 'Event Rank',
  attendanceRecord:     'Attendance Record',
  startDate:            'Start Date',
  endDate:              'End Date',
  region:               'Region',
  locationKnown:        'Location',
  eventType:            'Event Type',
  street:               'Event Location: Street',
  city:                 'Event Location: City',
  state:                'Event Location: State',
  country:              'Event Location: Country/Region',
  venue:                'Venue',
  website:              'Event Website',
  boothSize:            'Booth Size',
  boothNumber:          'Booth%23',
  status:               'Status',
  sector:               'Sector',
  organizingCompany:    'Organizing Company',
  businessLines:        'Business Lines',
  showCaptain:          'Show Captain',
  shipByDate:           'Ship By Date',
  registrationDeadline: 'Registration Deadline',
  mockupsModels:        'Mockups/Models',
  actionStatus:         'Action Status',
  subject:              'Main Event Subject',
  notes:                'Notes',
  daysUntilStart:       'Days until Start',
  staffAssigned:        'Staff_Assigned',
};

// ─── Intelligence dotpath → CSV column ───────────────────────────────────────
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

// Address fields that get a reasoning note when Inferred
const ADDR_INTEL_FIELDS = new Set([
  'venue.street', 'venue.city', 'venue.state', 'venue.country',
]);

function getNestedValue(obj, dotPath) {
  return dotPath.split('.').reduce((o, k) => (o != null ? o[k] : null), obj) ?? null;
}

function serialize(val) {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) return JSON.stringify(val);
  return String(val);
}

function calcUrgency(days) {
  if (days === null || days === undefined || days === '') return 'no-date';
  const d = parseInt(days, 10);
  if (isNaN(d)) return 'no-date';
  if (d < 0)   return 'past';
  if (d <= 14) return 'critical';
  if (d <= 30) return 'soon';
  if (d <= 90) return 'upcoming';
  return 'future';
}

function deriveStatusGroup(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('go') || s.includes('confirmed')) return 'go';
  if (s.includes('planning'))  return 'planning';
  if (s.includes('pending'))   return 'pending';
  if (s.includes('tbc'))       return 'tbc';
  if (s.includes('cancel'))    return 'cancelled';
  return 'other';
}

function migrate() {
  console.log('[migrate] Reading events.json...');
  const rawData    = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
  const uploadedAt = rawData.lastUpdated || new Date().toISOString();

  let withResearch = 0, withProposals = 0, withApproved = 0;

  const masterEvents = rawData.events.map(ev => {

    // ── sharepoint layer ──────────────────────────────────────────────────────
    const sharepoint = { _uploadedAt: uploadedAt };

    for (const [flatKey, csvCol] of Object.entries(FLAT_TO_CSV)) {
      const val = ev[flatKey];
      if (Array.isArray(val)) {
        sharepoint[csvCol] = JSON.stringify(val);
      } else if (val !== null && val !== undefined) {
        sharepoint[csvCol] = val;
      } else {
        sharepoint[csvCol] = '';
      }
    }
    // Fields with no flat equivalent
    sharepoint['Related Documents'] = '';
    sharepoint['Email Header']      = '';

    // ── research data ─────────────────────────────────────────────────────────
    const research      = ev.research || {};
    const intelligence  = research.intelligence || {};
    const confidence    = research.confidence   || {};
    const humanVerified = research.humanVerified || {};
    const sourceUrls    = research.meta?.sourceUrls || [];
    const sourceUrl     = sourceUrls[0] || null;
    const researchTs    = research.meta?.lastResearchedAt || null;

    if (research.meta?.researchVersion > 0) withResearch++;

    // ── proposals layer ───────────────────────────────────────────────────────
    const proposals = {};

    for (const [intelPath, csvCol] of Object.entries(INTEL_TO_CSV)) {
      const value = getNestedValue(intelligence, intelPath);
      if (value === null || value === '' || value === undefined) continue;

      const conf = confidence[intelPath] || null;
      if (!conf) continue;

      // Skip if human-verified (goes to approved layer)
      if (humanVerified[intelPath] === true) continue;

      let reasoningMethod;
      if (conf === 'high')   reasoningMethod = 'Corroborated';
      else if (conf === 'medium') reasoningMethod = 'Direct';
      else                   reasoningMethod = 'Inferred';

      let reasoningNote = null;
      if (reasoningMethod === 'Inferred' && ADDR_INTEL_FIELDS.has(intelPath)) {
        reasoningNote = 'Venue address derived from venue name lookup — not explicitly stated on event site.';
      }

      // Only propose if it differs from sharepoint value
      const spValue  = String(sharepoint[csvCol] || '').toLowerCase().trim();
      const agentStr = String(value).trim();
      if (spValue && spValue === agentStr.toLowerCase()) continue;

      proposals[csvCol] = {
        value:           agentStr,
        confidence:      conf,
        reasoningMethod,
        reasoningNote,
        sourceUrl,
        proposedAt: researchTs || uploadedAt,
      };
    }
    if (Object.keys(proposals).length > 0) withProposals++;

    // ── approved layer (from humanVerified) ───────────────────────────────────
    const approved = {};

    for (const [intelPath, isVerified] of Object.entries(humanVerified)) {
      if (!isVerified) continue;
      const csvCol = INTEL_TO_CSV[intelPath];
      if (!csvCol) continue;
      const value = getNestedValue(intelligence, intelPath);
      if (value === null || value === undefined) continue;
      approved[csvCol] = {
        value:         String(value).trim(),
        approvedAt:    researchTs || uploadedAt,
        exportPending: false,
      };
    }
    if (Object.keys(approved).length > 0) withApproved++;

    // ── meta layer ────────────────────────────────────────────────────────────
    const daysRaw = ev.daysUntilStart;
    const meta = {
      region:           ev.region   || null,
      subRegion:        ev.subRegion || null,
      regionalTags:     ev.regionalTags || [],
      statusGroup:      ev.statusGroup  || deriveStatusGroup(ev.status || ''),
      urgency:          ev.urgency  || calcUrgency(daysRaw),
      lastResearchedAt: researchTs,
      researchVersion:  research.meta?.researchVersion  || 0,
      intelligenceScore: research.meta?.intelligenceScore || 0,
    };

    return {
      code: ev.code,
      sharepoint,
      proposals,
      approved,
      dashboardEdits: {},
      dismissed:      {},
      meta,
      research,
    };
  });

  const output = {
    lastUpdated:  new Date().toISOString(),
    totalEvents:  masterEvents.length,
    events:       masterEvents,
  };

  const tmpFile = MASTER_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(output, null, 2), 'utf8');
  try {
    fs.renameSync(tmpFile, MASTER_FILE);
  } catch {
    fs.unlinkSync(MASTER_FILE);
    fs.renameSync(tmpFile, MASTER_FILE);
  }

  console.log(`[migrate] Done:`);
  console.log(`  ${masterEvents.length} events migrated`);
  console.log(`  ${withResearch}  events with research data`);
  console.log(`  ${withProposals} events with agent proposals`);
  console.log(`  ${withApproved}  events with approved fields`);
  console.log(`  Written to: ${MASTER_FILE}`);
}

migrate();
