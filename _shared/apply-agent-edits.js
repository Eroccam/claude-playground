'use strict';
const fs = require('fs');

// ══════════════════════════════════════════════════════════════════════════════
// research-agent.js edits
// ══════════════════════════════════════════════════════════════════════════════
let ra = fs.readFileSync('C:/Coding/claude-playground/show-intelligence-agent/research-agent.js', 'utf8');

// 3a: --region in parseArgs
ra = ra.replace(
  `    if (a === '--force-overwrite')               { args.forceOverwrite = true;      continue; }\n  }`,
  `    if (a === '--force-overwrite')               { args.forceOverwrite = true;      continue; }\n    if (a === '--region' && argv[i + 1])         { args.region         = argv[++i]; continue; }\n  }`
);

// 3b: REGION_SEARCH_HINTS constant after SEARCH_CATEGORIES closing bracket
ra = ra.replace(
  `];\n\n// ═══════════════════════════════════════════════════════════════════════════════\n// SECTION: INPUT PARSING`,
  `];\n\nconst REGION_SEARCH_HINTS = {\n  'Americas': { querySuffix: 'USA exhibitor', sourceNotes: ['TSNN.com', 'ExhibitorMagazine.com', 'SEMA', 'CES', 'trade association .org sites'] },\n  'EMEA':     { querySuffix: 'exhibitor Europe', sourceNotes: ['UFI.org', 'EMECA.eu', 'Messe Frankfurt', '.co.uk/.de/.fr sites'] },\n  'APAC':     { querySuffix: 'exhibitor Asia Pacific', sourceNotes: ['UFI Asia', 'Reed Exhibitions Asia', 'Singapore MICE', '.com.au/.co.jp sites'] },\n};\n\n// ═══════════════════════════════════════════════════════════════════════════════\n// SECTION: INPUT PARSING`
);

// 3c: regional hints in researchEvent — apply to queries in category loop
ra = ra.replace(
  `  const allIntelligence = {};\n  const allConfidence   = {};\n  const allSourceUrls   = [];\n  let   officialDomain  = null;\n\n  // ── Run all 8 search categories ──────────────────────────────────────────\n  for (const category of SEARCH_CATEGORIES) {\n    const queries = category.queries(name, year);`,
  `  const allIntelligence = {};\n  const allConfidence   = {};\n  const allSourceUrls   = [];\n  let   officialDomain  = null;\n\n  // ── Regional search hints ─────────────────────────────────────────────────\n  const region      = args.region || event.region || null;\n  const regionHints = region ? REGION_SEARCH_HINTS[region] : null;\n\n  // ── Run all 8 search categories ──────────────────────────────────────────\n  for (const category of SEARCH_CATEGORIES) {\n    let queries = category.queries(name, year);\n    if (regionHints) queries = queries.map(q => q + ' ' + regionHints.querySuffix);`
);

// 3d: --region batch filter in main
ra = ra.replace(
  `    targets = getBatchTargets(eventsData, staleDays);\n    console.log(\`[research-agent] BATCH MODE: \${targets.length} events need research (stale threshold: \${staleDays} days)\`);`,
  `    targets = getBatchTargets(eventsData, staleDays);\n    if (args.region) {\n      targets = targets.filter(e => e.region === args.region);\n      console.log(\`[research-agent] BATCH REGION FILTER: \${args.region} — \${targets.length} events\`);\n    }\n    console.log(\`[research-agent] BATCH MODE: \${targets.length} events need research (stale threshold: \${staleDays} days)\`);`
);

// 3e: region sources in printSummary — insert before final closing log line
ra = ra.replace(
  `  if (skippedFields.length > 0) {\n    console.log('');\n    console.log(\`Skipped (humanVerified protection) (\${skippedFields.length}):\`);\n    skippedFields.forEach(f => console.log(\`  ⚠ \${f}\`));\n  }\n\n  console.log('═'.repeat(60) + '\\n');\n}\n\n// ═══════════════════════════════════════════════════════════════════════════════\n// SECTION: SINGLE EVENT RESEARCH PIPELINE`,
  `  if (skippedFields.length > 0) {\n    console.log('');\n    console.log(\`Skipped (humanVerified protection) (\${skippedFields.length}):\`);\n    skippedFields.forEach(f => console.log(\`  ⚠ \${f}\`));\n  }\n\n  const _region      = event.region || null;\n  const _regionHints = _region ? REGION_SEARCH_HINTS[_region] : null;\n  if (_regionHints) {\n    console.log('');\n    console.log(\`Region-specific sources checked (\${_region}):\`);\n    _regionHints.sourceNotes.forEach(s => console.log(\`  • \${s}\`));\n  }\n\n  console.log('═'.repeat(60) + '\\n');\n}\n\n// ═══════════════════════════════════════════════════════════════════════════════\n// SECTION: SINGLE EVENT RESEARCH PIPELINE`
);

fs.writeFileSync('C:/Coding/claude-playground/show-intelligence-agent/research-agent.js', ra, 'utf8');
console.log('✓ research-agent.js updated');

// ══════════════════════════════════════════════════════════════════════════════
// deadline-monitor.js edits
// ══════════════════════════════════════════════════════════════════════════════
let dm = fs.readFileSync('C:/Coding/claude-playground/show-intelligence-agent/deadline-monitor.js', 'utf8');

// 4a: Add --digest / --region / myRegion to main, replace bare loadConfig() call
dm = dm.replace(
  `async function main() {\n  const dryRun = process.argv.includes('--dry-run');\n  console.log('[deadline-monitor] Safran Deadline Monitor v1.0.0');\n\n  loadConfig(); // validate config is readable`,
  `async function main() {\n  const dryRun    = process.argv.includes('--dry-run');\n  const digest    = process.argv.includes('--digest');\n  const regionIdx = process.argv.indexOf('--region');\n  const regionArg = regionIdx !== -1 ? process.argv[regionIdx + 1] : null;\n  console.log('[deadline-monitor] Safran Deadline Monitor v1.0.0');\n\n  const config   = loadConfig();\n  const myRegion = regionArg || config.userProfile?.primaryRegion || 'US & Canada';`
);

// 4b: Add region + subRegion fields to alert objects
dm = dm.replace(
  `      const alert = {\n        eventId:       event.code      || '',\n        eventName,\n        deadlineType:  def.type,\n        deadlineLabel: def.label,\n        deadlineDate:  dateStr,\n        daysRemaining: days,\n        urgency,\n        emailType:     def.emailType,\n        reviewed:      false,\n      };`,
  `      const alert = {\n        eventId:       event.code      || '',\n        eventName,\n        deadlineType:  def.type,\n        deadlineLabel: def.label,\n        deadlineDate:  dateStr,\n        daysRemaining: days,\n        urgency,\n        emailType:     def.emailType,\n        region:        event.region    || '',\n        subRegion:     event.subRegion || '',\n        reviewed:      false,\n      };`
);

// 4c: Add printDigest function before printSummary section header
dm = dm.replace(
  `// ═══════════════════════════════════════════════════════════════════════════════\n// SECTION: PRINT CONSOLE SUMMARY\n// ═══════════════════════════════════════════════════════════════════════════════\n\nfunction printSummary(alerts) {`,
  `// ═══════════════════════════════════════════════════════════════════════════════\n// SECTION: MORNING DIGEST\n// ═══════════════════════════════════════════════════════════════════════════════\n\nfunction printDigest(alerts, primaryRegion) {\n  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });\n  const bar   = '═'.repeat(70);\n\n  console.log('\\n' + bar);\n  console.log(\`MORNING BRIEFING  —  \${today}\`);\n  console.log(bar);\n\n  const myAlerts   = alerts.filter(a => a.subRegion === primaryRegion);\n  const myCritical = myAlerts.filter(a => a.urgency === 'critical' || a.urgency === 'urgent');\n\n  console.log(\`\\n YOUR REGION (\${primaryRegion})\`);\n  if (myCritical.length === 0) {\n    console.log('  No critical or urgent deadlines this week.');\n  } else {\n    console.log(\`  \${myCritical.length} critical deadline(s) this week\`);\n    for (const a of myCritical) {\n      const urgLabel = a.urgency === 'critical' ? '[CRITICAL]' : '[URGENT  ]';\n      const id  = a.eventId.padEnd(10);\n      const lbl = a.deadlineLabel.padEnd(30);\n      const d   = String(a.daysRemaining).padStart(3) + 'd';\n      console.log(\`  \${urgLabel}  \${id} \${lbl} \${d}  →  \${a.deadlineDate}\`);\n    }\n  }\n\n  const otherAlerts   = alerts.filter(a => a.subRegion !== primaryRegion);\n  const otherCritical = otherAlerts.filter(a => a.urgency === 'critical' || a.urgency === 'urgent');\n  const otherMonthly  = otherAlerts.filter(a => a.daysRemaining <= 30);\n\n  console.log(\`\\n OTHER REGIONS\`);\n  console.log(\`  \${otherCritical.length} critical/urgent,  \${otherMonthly.length} total deadlines this month\`);\n\n  const byRegion = {};\n  for (const a of otherMonthly) {\n    byRegion[a.region] = (byRegion[a.region] || 0) + 1;\n  }\n  for (const [rgn, cnt] of Object.entries(byRegion)) {\n    console.log(\`    \${rgn}: \${cnt} deadline(s) in next 30 days\`);\n  }\n\n  console.log('\\n' + bar + '\\n');\n}\n\n// ═══════════════════════════════════════════════════════════════════════════════\n// SECTION: PRINT CONSOLE SUMMARY\n// ═══════════════════════════════════════════════════════════════════════════════\n\nfunction printSummary(alerts) {`
);

// Wire --digest into main's output section
dm = dm.replace(
  `  printSummary(alerts);\n  writeAlerts(alerts, dryRun);`,
  `  if (digest) printDigest(alerts, myRegion); else printSummary(alerts);\n  writeAlerts(alerts, dryRun);`
);

fs.writeFileSync('C:/Coding/claude-playground/show-intelligence-agent/deadline-monitor.js', dm, 'utf8');
console.log('✓ deadline-monitor.js updated');
