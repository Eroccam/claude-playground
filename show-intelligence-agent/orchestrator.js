/**
 * orchestrator.js
 * Coordinates all Show Intelligence agents. Routes operations,
 * handles errors, and manages sequential agent call chains.
 *
 * Usage:
 *   node orchestrator.js research --show "NBAA BACE" --year 2026
 *   node orchestrator.js deadlines
 *   node orchestrator.js email --event-id "nbaa-bace-2026" --type sponsorship
 *   node orchestrator.js full-pipeline --show "EBACE" --year 2026
 */

'use strict';

const path = require('path');

// ---------------------------------------------------------------------------
// SECTION: OPERATION ROUTING
// Supported operations:
//   research       → research-agent.js
//   deadlines      → deadline-monitor.js
//   email          → email-composer.js
//   full-pipeline  → research → deadlines → (optional) email
// Parse first positional arg as operation name
// Pass remaining args through to the target agent
// ---------------------------------------------------------------------------

const OPERATIONS = {
  research:      () => require('./research-agent'),
  deadlines:     () => require('./deadline-monitor'),
  email:         () => require('./email-composer'),
  changelog:     () => require('./changelog-engine'),
  'sp-todo':     () => require('./sharepoint-todo'),
  'full-pipeline': null, // handled inline below
};

function parseOperation(argv) {
  const op = argv[0];
  const args = argv.slice(1);
  if (!op || !OPERATIONS.hasOwnProperty(op)) {
    console.error('[orchestrator] Unknown operation:', op);
    console.error('[orchestrator] Available:', Object.keys(OPERATIONS).join(', '));
    process.exit(1);
  }
  return { op, args };
}

// ---------------------------------------------------------------------------
// SECTION: ERROR HANDLING
// Wrap each agent call in try/catch
// On failure:
//   - Log error with agent name, operation, and error message
//   - Write error entry to _shared/data/orchestrator-errors.json
//   - Do NOT silently continue if a required upstream agent failed
//   - For full-pipeline: abort remaining steps on any failure
// ---------------------------------------------------------------------------

async function safeRun(agentName, fn) {
  try {
    console.log(`[orchestrator] Starting: ${agentName}`);
    const result = await fn();
    console.log(`[orchestrator] Completed: ${agentName}`);
    return { success: true, result };
  } catch (err) {
    console.error(`[orchestrator] FAILED: ${agentName} — ${err.message}`);
    // TODO: append error to orchestrator-errors.json
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// SECTION: SEQUENTIAL AGENT CALLS
// full-pipeline sequence:
//   1. research-agent     → produces delta
//   2. changelog-engine   → receives delta, produces changeSet
//   3. sharepoint-todo    → receives changeSet, queues SP tasks
//   4. deadline-monitor   → re-runs after research to refresh alerts
//   5. (optional) email   → if --compose-email flag is present
//
// Each step must succeed before the next begins.
// Pass output from each step as input to the next.
// ---------------------------------------------------------------------------

async function runFullPipeline(args) {
  console.log('[orchestrator] Starting full pipeline...');

  // Step 1: Research
  // TODO: call research-agent with args, capture delta

  // Step 2: Changelog
  // TODO: call changelog-engine.append(delta), capture changeSet

  // Step 3: SharePoint todos
  // TODO: call sharepoint-todo.process(changeSet)

  // Step 4: Deadline monitor
  // TODO: call deadline-monitor main()

  // Step 5: (optional) Email
  // TODO: if --compose-email in args, call email-composer

  console.log('[orchestrator] Full pipeline complete.');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  const { op, args } = parseOperation(process.argv.slice(2));

  if (op === 'full-pipeline') {
    await runFullPipeline(args);
    return;
  }

  // Route to individual agent
  const agentLoader = OPERATIONS[op];
  await safeRun(op, () => agentLoader().main ? agentLoader().main(args) : Promise.resolve());
}

main().catch(err => {
  console.error('[orchestrator] Unhandled error:', err);
  process.exit(1);
});
