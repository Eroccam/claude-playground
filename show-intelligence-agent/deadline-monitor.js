/**
 * deadline-monitor.js  v1.0.0
 * Reads all events from MongoDB, calculates days remaining for every
 * deadline field, classifies urgency, and writes deadline-alerts.json.
 *
 * Usage:
 *   node deadline-monitor.js
 *   node deadline-monitor.js --dry-run
 *
 * Urgency tiers (days remaining):
 *   critical  1–7   → banner renders RED
 *   urgent    8–14  → banner renders ORANGE
 *   warning   15–30 → banner renders BLUE
 *   upcoming  31–90 → tracked but not bannered
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { getMasterData } = require('../event-dashboard/db');

const SHARED_DATA = path.resolve(__dirname, '../_shared/data');
const ALERTS_FILE = path.join(SHARED_DATA, 'deadline-alerts.json');
const CONFIG_FILE = path.resolve(__dirname, '../_shared/config.json');

// ─── Deadline fields to check on each event ──────────────────────────────────
// { field: dotted path, type: threshold key, label: human label, emailType: for draft button }
const DEADLINE_FIELDS = [
  // Core event fields (flat on every record)
  { field: 'startDate',            type: 'eventOpen',    label: 'Event Opens',             emailType: 'exhibit'     },
  { field: 'registrationDeadline', type: 'eventOpen',    label: 'Registration Deadline',   emailType: 'exhibit'     },
  { field: 'shipByDate',           type: 'booth',        label: 'Ship By Date',            emailType: 'exhibit'     },

  // Research intelligence fields (nested under research.intelligence)
  { field: 'research.intelligence.booth.earlyBirdDeadline',        type: 'earlyBird',    label: 'Booth Early Bird Deadline',    emailType: 'exhibit'     },
  { field: 'research.intelligence.booth.standardDeadline',         type: 'booth',        label: 'Booth Standard Deadline',      emailType: 'exhibit'     },
  { field: 'research.intelligence.booth.paymentDue',               type: 'booth',        label: 'Booth Payment Due',            emailType: 'exhibit'     },
  { field: 'research.intelligence.booth.designDeadline',           type: 'booth',        label: 'Booth Design Deadline',        emailType: 'exhibit'     },
  { field: 'research.intelligence.sponsorship.deadline',           type: 'sponsorship',  label: 'Sponsorship Deadline',         emailType: 'sponsorship' },
  { field: 'research.intelligence.housing.deadline',               type: 'housing',      label: 'Housing Deadline',             emailType: 'housing'     },
  { field: 'research.intelligence.opportunities.speakingDeadline', type: 'eventOpen',    label: 'Speaking Submission Deadline', emailType: 'speaking'    },
];

// Default thresholds if config.json is unavailable
const DEFAULT_THRESHOLDS = {
  sponsorship: [60, 30, 14, 7],
  booth:       [90, 60, 30, 14],
  housing:     [60, 30, 14, 7],
  earlyBird:   [30, 14, 7],
  eventOpen:   [90, 60, 30, 7],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: READ EVENTS.JSON
// ═══════════════════════════════════════════════════════════════════════════════

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return { agentSettings: { deadlineThresholds: DEFAULT_THRESHOLDS } };
  }
}

// Normalize master-events schema to flat fields expected by this script
function normalizeEvent(ev) {
  if (!ev.sharepoint) return ev; // legacy flat format — pass through
  const sp = ev.sharepoint;
  const getF = col => ev.approved?.[col]?.value ?? ev.dashboardEdits?.[col]?.value ?? sp?.[col] ?? null;
  return {
    ...ev,
    title:                getF('Title'),
    region:               ev.meta?.region  || getF('Region')   || '',
    subRegion:            ev.meta?.subRegion || '',
    startDate:            getF('Start Date'),
    endDate:              getF('End Date'),
    registrationDeadline: getF('Registration Deadline'),
    shipByDate:           getF('Ship By Date'),
  };
}

async function loadEvents() {
  const data = await getMasterData();
  const events = data.events || data;
  return events.map(normalizeEvent);
}

function getNestedValue(obj, dotPath) {
  return dotPath.split('.').reduce((o, k) => (o != null ? o[k] : null), obj) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: CALCULATE DAYS REMAINING
// ═══════════════════════════════════════════════════════════════════════════════

function daysRemaining(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: URGENCY CLASSIFICATION
// critical  = 1–7   days
// urgent    = 8–14  days
// warning   = 15–30 days
// upcoming  = 31–90 days
// ok        = >90   days (not alerted)
// past      = <0    days (skip)
// ═══════════════════════════════════════════════════════════════════════════════

function classifyUrgency(days) {
  if (days === null) return null;
  if (days <= 0)  return 'past';
  if (days <= 7)  return 'critical';
  if (days <= 14) return 'urgent';
  if (days <= 30) return 'warning';
  if (days <= 90) return 'upcoming';
  return 'ok';
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: BUILD ALERT LIST
// Iterate all events × all deadline fields, collect active alerts.
// Log PRIORITY warning to console for any critical or urgent alert.
// ═══════════════════════════════════════════════════════════════════════════════

function buildAlerts(events) {
  const alerts   = [];
  const priority = [];

  for (const event of events) {
    // Skip events already fully in the past (urgency field set by the dashboard generator)
    // but still check their future deadlines
    const eventName = (event.title || event.code || '').replace(/^NEW:\s*/i, '').trim();

    for (const def of DEADLINE_FIELDS) {
      const dateStr = getNestedValue(event, def.field);
      const days    = daysRemaining(dateStr);
      if (days === null) continue;

      const urgency = classifyUrgency(days);
      if (!urgency || urgency === 'past' || urgency === 'ok') continue;

      const alert = {
        eventId:       event.code      || '',
        eventName,
        deadlineType:  def.type,
        deadlineLabel: def.label,
        deadlineDate:  dateStr,
        daysRemaining: days,
        urgency,
        emailType:     def.emailType,
        region:        event.region    || '',
        subRegion:     event.subRegion || '',
        reviewed:      false,
      };

      if (urgency === 'critical' || urgency === 'urgent') {
        priority.push(alert);
        console.warn(`[deadline-monitor] ⚠ PRIORITY [${urgency.toUpperCase()}]: ${event.code} — "${def.label}" in ${days} day(s) (${dateStr})`);
      }

      alerts.push(alert);
    }
  }

  // Sort by daysRemaining ascending (most urgent first)
  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: WRITE DEADLINE-ALERTS.JSON
// ═══════════════════════════════════════════════════════════════════════════════

function writeAlerts(alerts, dryRun) {
  const output = {
    generatedAt: new Date().toISOString(),
    alerts,
  };

  if (dryRun) {
    console.log('[deadline-monitor] DRY RUN — would write:');
    console.log(JSON.stringify(output, null, 2));
    return output;
  }

  const tmpFile = ALERTS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(output, null, 2), 'utf8');
  try {
    fs.renameSync(tmpFile, ALERTS_FILE);
  } catch {
    fs.unlinkSync(ALERTS_FILE);
    fs.renameSync(tmpFile, ALERTS_FILE);
  }

  console.log(`[deadline-monitor] ✓ deadline-alerts.json written — ${alerts.length} active alerts`);
  return output;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: MORNING DIGEST
// ═══════════════════════════════════════════════════════════════════════════════

function printDigest(alerts, primaryRegion) {
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  const bar   = '═'.repeat(70);

  console.log('\n' + bar);
  console.log(`MORNING BRIEFING  —  ${today}`);
  console.log(bar);

  const myAlerts   = alerts.filter(a => a.subRegion === primaryRegion);
  const myCritical = myAlerts.filter(a => a.urgency === 'critical' || a.urgency === 'urgent');

  console.log(`\n YOUR REGION (${primaryRegion})`);
  if (myCritical.length === 0) {
    console.log('  No critical or urgent deadlines this week.');
  } else {
    console.log(`  ${myCritical.length} critical deadline(s) this week`);
    for (const a of myCritical) {
      const urgLabel = a.urgency === 'critical' ? '[CRITICAL]' : '[URGENT  ]';
      const id  = a.eventId.padEnd(10);
      const lbl = a.deadlineLabel.padEnd(30);
      const d   = String(a.daysRemaining).padStart(3) + 'd';
      console.log(`  ${urgLabel}  ${id} ${lbl} ${d}  →  ${a.deadlineDate}`);
    }
  }

  const otherAlerts   = alerts.filter(a => a.subRegion !== primaryRegion);
  const otherCritical = otherAlerts.filter(a => a.urgency === 'critical' || a.urgency === 'urgent');
  const otherMonthly  = otherAlerts.filter(a => a.daysRemaining <= 30);

  console.log(`\n OTHER REGIONS`);
  console.log(`  ${otherCritical.length} critical/urgent,  ${otherMonthly.length} total deadlines this month`);

  const byRegion = {};
  for (const a of otherMonthly) {
    byRegion[a.region] = (byRegion[a.region] || 0) + 1;
  }
  for (const [rgn, cnt] of Object.entries(byRegion)) {
    console.log(`    ${rgn}: ${cnt} deadline(s) in next 30 days`);
  }

  console.log('\n' + bar + '\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: PRINT CONSOLE SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

function printSummary(alerts) {
  const tiers = { critical: [], urgent: [], warning: [], upcoming: [] };
  for (const a of alerts) {
    if (tiers[a.urgency]) tiers[a.urgency].push(a);
  }

  console.log('\n' + '═'.repeat(66));
  console.log('DEADLINE ALERT SUMMARY  —  ' + new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' }));
  console.log('═'.repeat(66));

  const icons = { critical: '🔴 CRITICAL', urgent: '🟠 URGENT', warning: '🔵 WARNING', upcoming: '⚪ UPCOMING' };

  for (const [tier, list] of Object.entries(tiers)) {
    if (list.length === 0) continue;
    console.log(`\n${icons[tier]} (${list.length}):`);
    for (const a of list) {
      const pad = s => String(s).padEnd(10);
      const lpad = s => String(s).padEnd(32);
      console.log(`  ${pad(a.eventId)} ${lpad(a.deadlineLabel)} ${String(a.daysRemaining).padStart(3)}d  →  ${a.deadlineDate}`);
    }
  }

  console.log('\n' + '═'.repeat(66));
  console.log(`Total active alerts: ${alerts.length}  (critical: ${tiers.critical.length}, urgent: ${tiers.urgent.length}, warning: ${tiers.warning.length})`);
  console.log('═'.repeat(66) + '\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const dryRun    = process.argv.includes('--dry-run');
  const digest    = process.argv.includes('--digest');
  const regionIdx = process.argv.indexOf('--region');
  const regionArg = regionIdx !== -1 ? process.argv[regionIdx + 1] : null;
  console.log('[deadline-monitor] Safran Deadline Monitor v1.0.0');

  const config   = loadConfig();
  const myRegion = regionArg || config.userProfile?.primaryRegion || 'US & Canada';

  console.log('[deadline-monitor] Loading events from MongoDB...');
  const events = await loadEvents();
  console.log(`[deadline-monitor] Checking ${events.length} events across ${DEADLINE_FIELDS.length} deadline field types...`);

  const alerts = buildAlerts(events);

  if (digest) printDigest(alerts, myRegion); else printSummary(alerts);
  writeAlerts(alerts, dryRun);

  console.log('[deadline-monitor] Done.');
  return alerts;
}

// Export for use by serve.js / orchestrator
module.exports = { main, buildAlerts, loadEvents };

if (require.main === module) {
  main().catch(err => {
    console.error('[deadline-monitor] Fatal error:', err.message);
    process.exit(1);
  });
}
