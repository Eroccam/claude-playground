// serve.js — Safran Event Dashboard local server  v2.0
// Run:  node serve.js
// Then: http://localhost:3000
//
// Static file serving + API endpoints for agent integration:
//   GET  /api/deadline-alerts          → deadline-alerts.json
//   GET  /api/research/stream?eventId= → SSE stream of research progress
//   POST /api/email                    → compose email draft, return content
//   POST /api/todo/complete            → mark SP todo task complete
//   GET  /api/email-drafts?eventId&type → list drafts for an event+type

'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { spawn } = require('child_process');
const { connectToDatabase, getMasterData, saveMasterData } = require('./db');

const PORT        = process.env.PORT || 3000;
const HOST        = '0.0.0.0';
const ROOT        = path.join(__dirname, '..');
const AGENT_DIR   = path.join(ROOT, 'show-intelligence-agent');
const SHARED_DATA = path.join(ROOT, '_shared', 'data');

const MIME = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.txt':  'text/plain',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
  });
}

function getQueryParam(url, key) {
  const u = new URL('http://localhost' + url);
  return u.searchParams.get(key);
}

// ─── API: GET /api/deadline-alerts ───────────────────────────────────────────
// Re-run the deadline monitor to get fresh alerts, then return results.

function handleDeadlineAlerts(req, res) {
  const alertsFile = path.join(SHARED_DATA, 'deadline-alerts.json');
  try {
    const data = fs.readFileSync(alertsFile, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  } catch {
    json(res, 200, { generatedAt: null, alerts: [] });
  }
}

// ─── API: GET /api/research/stream?eventId= ──────────────────────────────────
// Spawns research-agent.js and streams stdout as Server-Sent Events.

function handleResearchStream(req, res) {
  const eventId = getQueryParam(req.url, 'eventId');
  const dryRun  = getQueryParam(req.url, 'dryRun') === 'true';

  if (!eventId) {
    json(res, 400, { error: 'eventId query param required' });
    return;
  }

  res.writeHead(200, {
    'Content-Type':                'text/event-stream',
    'Cache-Control':               'no-cache',
    'Connection':                  'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send('start', { eventId, message: 'Research started', timestamp: new Date().toISOString() });

  const args = ['research-agent.js', '--eventId', eventId];
  if (dryRun) args.push('--dry-run');

  const child = spawn('node', args, {
    cwd: AGENT_DIR,
    env: { ...process.env },
  });

  child.stdout.on('data', chunk => {
    const lines = chunk.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      // Detect category completion lines
      const catMatch = line.match(/Category\s+(\d+)\/(\d+).*?—\s*(.*)/i);
      if (catMatch) {
        send('progress', { category: parseInt(catMatch[1]), total: parseInt(catMatch[2]), categoryName: catMatch[3].trim(), line });
        continue;
      }
      // Step/status lines (website fetch, subpage fetch, etc.)
      if (/Step 1|Step 2|Step 3|🌐|🔗|🏢/.test(line)) {
        send('step', { line });
        continue;
      }
      // Field extraction lines (· field.path: value)
      const fieldMatch = line.match(/·\s+([\w.]+):\s+(.+)/);
      if (fieldMatch) {
        send('field', { path: fieldMatch[1], value: fieldMatch[2].trim(), line });
        continue;
      }
      // Detect summary lines
      if (line.includes('Intelligence Score:') || line.includes('Fields Updated') || line.includes('Fields Still Missing')) {
        send('summary', { line });
        continue;
      }
      // Generic log line
      send('log', { line });
    }
  });

  child.stderr.on('data', chunk => {
    send('log', { line: chunk.toString().trim(), level: 'warn' });
  });

  child.on('error', err => {
    send('log', { line: `[serve] Failed to start research agent: ${err.message}`, level: 'error' });
    send('done', { exitCode: 1, timestamp: new Date().toISOString() });
    res.end();
  });

  child.on('close', code => {
    send('done', { exitCode: code, timestamp: new Date().toISOString() });
    res.end();
  });

  // Clean up if client disconnects
  req.on('close', () => { child.kill(); });
}

// ─── API: POST /api/email ─────────────────────────────────────────────────────
// Runs email-composer.js and returns the draft.

async function handleEmail(req, res) {
  try {
    const body      = await readBody(req);
    const { eventId, emailType, tone } = body;

    if (!eventId || !emailType) {
      json(res, 400, { error: 'eventId and emailType are required' });
      return;
    }

    const composer  = require(path.join(AGENT_DIR, 'email-composer.js'));
    const draft     = await composer.compose({ eventId, emailType, tone: tone || null, dryRun: false });

    json(res, 200, draft);
  } catch (err) {
    console.error('[serve] Email compose error:', err.message);
    json(res, 500, { error: err.message });
  }
}

// ─── API: POST /api/todo/complete ────────────────────────────────────────────
// Marks a specific task as complete/incomplete in sharepoint-todos.json.

async function handleTodoComplete(req, res) {
  try {
    const body = await readBody(req);
    const { taskSetId, taskId, complete, completedBy } = body;

    const todosFile  = path.join(SHARED_DATA, 'sharepoint-todos.json');
    const raw        = fs.readFileSync(todosFile, 'utf8').trim();
    const todos      = raw ? JSON.parse(raw) : [];

    let found = false;
    for (const set of todos) {
      if (set.taskSetId !== taskSetId) continue;
      for (const task of (set.tasks || [])) {
        if (task.taskId !== taskId) continue;
        task.complete      = complete;
        task.completedAt   = complete ? new Date().toISOString() : null;
        task.completedBy   = complete ? (completedBy || 'unknown') : null;
        found = true;
        break;
      }
      // Update parent set status if all tasks done
      const allDone = (set.tasks || []).every(t => t.complete);
      set.status = allDone ? 'completed' : 'pending';
      if (allDone) set.completedAt = new Date().toISOString();
    }

    if (!found) {
      json(res, 404, { error: `Task ${taskId} not found in set ${taskSetId}` });
      return;
    }

    const tmpFile = todosFile + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(todos, null, 2), 'utf8');
    try { fs.renameSync(tmpFile, todosFile); }
    catch { fs.unlinkSync(todosFile); fs.renameSync(tmpFile, todosFile); }

    json(res, 200, { ok: true, taskId, complete });
  } catch (err) {
    console.error('[serve] Todo complete error:', err.message);
    json(res, 500, { error: err.message });
  }
}

// ─── API: GET /api/email-drafts?eventId=&type= ───────────────────────────────
// Lists draft files for a given event and email type.

function handleEmailDraftsList(req, res) {
  const eventId   = getQueryParam(req.url, 'eventId');
  const emailType = getQueryParam(req.url, 'type');

  if (!emailType) {
    json(res, 400, { error: 'type query param required' });
    return;
  }

  const prefix = eventId ? `${eventId}-${emailType}` : emailType;

  try {
    const files = fs.readdirSync(path.join(SHARED_DATA, 'email-drafts'))
      .filter(f => f.startsWith(prefix) && f.endsWith('.txt'))
      .sort()
      .reverse()
      .map(f => {
        const fullPath = path.join(SHARED_DATA, 'email-drafts', f);
        const content  = fs.readFileSync(fullPath, 'utf8');
        // Parse subject from first lines
        const subjMatch = content.match(/^SUBJECT:\s*(.+)$/m);
        const dateMatch = content.match(/^DATE:\s*(.+)$/m);
        return {
          filename: f,
          subject:  subjMatch?.[1]?.trim() || f,
          date:     dateMatch?.[1]?.trim() || null,
          content,
        };
      });
    json(res, 200, { drafts: files });
  } catch {
    json(res, 200, { drafts: [] });
  }
}

// ─── Master Events: helpers ───────────────────────────────────────────────────

async function readMaster() {
  return getMasterData();
}

async function writeMaster(data) {
  return saveMasterData(data);
}

function findMasterEvent(masterData, code) {
  return masterData.events.find(e => (e.code || '').toUpperCase() === (code || '').toUpperCase());
}

function calcUrgency(days) {
  if (days === null || days === undefined || days === '') return 'no-date';
  const d = parseInt(days, 10);
  if (isNaN(d))   return 'no-date';
  if (d < 0)      return 'past';
  if (d <= 14)    return 'critical';
  if (d <= 30)    return 'soon';
  if (d <= 90)    return 'upcoming';
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

// ─── API: GET /api/master-events ──────────────────────────────────────────────

async function handleGetMasterEvents(req, res) {
  try {
    const masterData = await readMaster();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(masterData));
  } catch (err) {
    json(res, 500, { error: err.message });
  }
}

// ─── API: POST /api/master-events/merge-csv ───────────────────────────────────
// body: { rows: [{...}, ...], uploadedAt: "ISO" }
// Merges the sharepoint layer; respects dashboardEdits timestamps.

async function handleMergeCSV(req, res) {
  try {
    const body = await readBody(req);
    const { rows, uploadedAt } = body;
    if (!rows || !Array.isArray(rows)) {
      json(res, 400, { error: 'rows array required' });
      return;
    }

    const masterData = await readMaster();
    const masterMap  = new Map(masterData.events.map(e => [(e.code || '').toUpperCase(), e]));
    const uploadTs   = uploadedAt || new Date().toISOString();
    const uploadDate = new Date(uploadTs);

    let added = 0, updated = 0;

    for (const row of rows) {
      const code = (row['Event Code'] || '').toUpperCase();
      if (!code) continue;

      const existing = masterMap.get(code);

      if (existing) {
        // Merge columns — dashboardEdit timestamp wins over CSV if newer
        for (const [col, val] of Object.entries(row)) {
          if (col === '_rowIdx' || col === '_daysNum') continue;
          const editEntry = existing.dashboardEdits?.[col];
          if (editEntry) {
            const editDate = new Date(editEntry.editedAt);
            if (editDate > uploadDate) continue;
          }
          existing.sharepoint[col] = val ?? '';
        }
        existing.sharepoint._uploadedAt = uploadTs;

        // Recalculate daysUntilStart
        const sd = existing.sharepoint['Start Date'];
        if (sd) {
          const diff = Math.round((new Date(sd) - new Date()) / 86400000);
          existing.sharepoint['Days until Start'] = diff;
        }

        // Refresh meta urgency
        existing.meta.urgency = calcUrgency(existing.sharepoint['Days until Start']);
        updated++;

      } else {
        // New event — create with empty layers
        const sharepoint = { _uploadedAt: uploadTs };
        for (const [col, val] of Object.entries(row)) {
          if (col === '_rowIdx' || col === '_daysNum') continue;
          sharepoint[col] = val ?? '';
        }
        // Recalculate days
        const sd = sharepoint['Start Date'];
        if (sd) sharepoint['Days until Start'] = Math.round((new Date(sd) - new Date()) / 86400000);

        masterData.events.push({
          code: row['Event Code'],
          sharepoint,
          proposals:      {},
          approved:       {},
          dashboardEdits: {},
          dismissed:      {},
          meta: {
            region:           sharepoint['Region'] || null,
            subRegion:        null,
            regionalTags:     [],
            statusGroup:      deriveStatusGroup(sharepoint['Status'] || ''),
            urgency:          calcUrgency(sharepoint['Days until Start']),
            lastResearchedAt: null,
            researchVersion:  0,
            intelligenceScore: 0,
          },
          research: {},
        });
        added++;
      }
    }

    masterData.lastUpdated = new Date().toISOString();
    await writeMaster(masterData);
    json(res, 200, { ok: true, added, updated, total: masterData.events.length });
  } catch (err) {
    console.error('[serve] merge-csv error:', err.message);
    json(res, 500, { error: err.message });
  }
}

// ─── API: POST /api/master-events/edit-field ─────────────────────────────────
// body: { code, csvCol, value }

async function handleEditField(req, res) {
  try {
    const body = await readBody(req);
    const { code, csvCol, value } = body;
    if (!code || !csvCol) {
      json(res, 400, { error: 'code and csvCol required' });
      return;
    }

    const masterData = await readMaster();
    const ev = findMasterEvent(masterData, code);
    if (!ev) { json(res, 404, { error: `Event ${code} not found` }); return; }

    if (!ev.dashboardEdits) ev.dashboardEdits = {};
    ev.dashboardEdits[csvCol] = {
      value:         value ?? '',
      editedAt:      new Date().toISOString(),
      exportPending: true,
    };

    masterData.lastUpdated = new Date().toISOString();
    await writeMaster(masterData);
    json(res, 200, { ok: true, code, csvCol, value });
  } catch (err) {
    console.error('[serve] edit-field error:', err.message);
    json(res, 500, { error: err.message });
  }
}

// ─── API: POST /api/master-events/approve-proposal ───────────────────────────
// body: { code, csvCol }

async function handleApproveProposal(req, res) {
  try {
    const body = await readBody(req);
    const { code, csvCol } = body;
    if (!code || !csvCol) {
      json(res, 400, { error: 'code and csvCol required' });
      return;
    }

    const masterData = await readMaster();
    const ev = findMasterEvent(masterData, code);
    if (!ev) { json(res, 404, { error: `Event ${code} not found` }); return; }

    const proposal = ev.proposals?.[csvCol];
    if (!proposal) { json(res, 404, { error: `Proposal for ${csvCol} not found` }); return; }

    if (!ev.approved) ev.approved = {};
    ev.approved[csvCol] = {
      value:         proposal.value,
      approvedAt:    new Date().toISOString(),
      exportPending: true,
    };
    delete ev.proposals[csvCol];

    masterData.lastUpdated = new Date().toISOString();
    await writeMaster(masterData);
    json(res, 200, { ok: true, code, csvCol, value: ev.approved[csvCol].value });
  } catch (err) {
    console.error('[serve] approve-proposal error:', err.message);
    json(res, 500, { error: err.message });
  }
}

// ─── API: POST /api/master-events/dismiss-proposal ───────────────────────────
// body: { code, csvCol }

async function handleDismissProposal(req, res) {
  try {
    const body = await readBody(req);
    const { code, csvCol } = body;
    if (!code || !csvCol) {
      json(res, 400, { error: 'code and csvCol required' });
      return;
    }

    const masterData = await readMaster();
    const ev = findMasterEvent(masterData, code);
    if (!ev) { json(res, 404, { error: `Event ${code} not found` }); return; }

    const proposal = ev.proposals?.[csvCol];
    if (!proposal) { json(res, 404, { error: `Proposal for ${csvCol} not found` }); return; }

    if (!ev.dismissed) ev.dismissed = {};
    ev.dismissed[csvCol] = {
      dismissedAt:    new Date().toISOString(),
      dismissedValue: proposal.value,
    };
    delete ev.proposals[csvCol];

    masterData.lastUpdated = new Date().toISOString();
    await writeMaster(masterData);
    json(res, 200, { ok: true, code, csvCol });
  } catch (err) {
    console.error('[serve] dismiss-proposal error:', err.message);
    json(res, 500, { error: err.message });
  }
}

// ─── API: POST /api/run-deadlines ────────────────────────────────────────────
// Runs deadline-monitor.js to regenerate alerts.

function handleRunDeadlines(req, res) {
  const monitor = require(path.join(AGENT_DIR, 'deadline-monitor.js'));
  monitor.main()
    .then(alerts => json(res, 200, { ok: true, alertCount: (alerts || []).length }))
    .catch(err => {
      console.error('[serve] Deadline monitor error:', err.message);
      json(res, 500, { error: err.message });
    });
}

// ─── API: GET /api/health ─────────────────────────────────────────────────────
// Returns DB connection status and event count — useful for verifying MongoDB.

async function handleHealth(req, res) {
  const start = Date.now();
  try {
    const { Event, MasterMeta } = require('./db');
    const [eventCount, meta] = await Promise.all([
      Event.countDocuments(),
      MasterMeta.findOne({ key: 'master-events' }).lean(),
    ]);
    json(res, 200, {
      status:      'ok',
      db:          'connected',
      eventCount,
      lastUpdated: meta?.lastUpdated || null,
      latencyMs:   Date.now() - start,
      uptime:      Math.floor(process.uptime()) + 's',
    });
  } catch (err) {
    json(res, 500, {
      status:    'error',
      db:        'disconnected',
      error:     err.message,
      latencyMs: Date.now() - start,
    });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const { method, url } = req;
  const urlPath = url.split('?')[0];

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

  // ── API routes ──
  if (urlPath === '/api/health'                              && method === 'GET')  { handleHealth(req, res);           return; }
  if (urlPath === '/api/deadline-alerts'                  && method === 'GET')  { handleDeadlineAlerts(req, res);    return; }
  if (urlPath === '/api/research/stream'                  && method === 'GET')  { handleResearchStream(req, res);    return; }
  if (urlPath === '/api/email'                            && method === 'POST') { handleEmail(req, res);             return; }
  if (urlPath === '/api/todo/complete'                    && method === 'POST') { handleTodoComplete(req, res);      return; }
  if (urlPath === '/api/email-drafts'                     && method === 'GET')  { handleEmailDraftsList(req, res);   return; }
  if (urlPath === '/api/run-deadlines'                    && method === 'POST') { handleRunDeadlines(req, res);      return; }
  if (urlPath === '/api/master-events'                    && method === 'GET')  { handleGetMasterEvents(req, res);   return; }
  if (urlPath === '/api/master-events/merge-csv'          && method === 'POST') { handleMergeCSV(req, res);          return; }
  if (urlPath === '/api/master-events/edit-field'         && method === 'POST') { handleEditField(req, res);         return; }
  if (urlPath === '/api/master-events/approve-proposal'   && method === 'POST') { handleApproveProposal(req, res);   return; }
  if (urlPath === '/api/master-events/dismiss-proposal'   && method === 'POST') { handleDismissProposal(req, res);   return; }

  // ── Globe: serve tradeshow-globe/dist under /globe/* ──
  if (urlPath === '/globe' || urlPath === '/globe/') {
    const indexPath = path.join(ROOT, 'tradeshow-globe', 'dist', 'index.html');
    fs.readFile(indexPath, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Globe not built'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    });
    return;
  }
  if (urlPath.startsWith('/globe/')) {
    const subPath  = urlPath.slice('/globe'.length); // e.g. /assets/foo.js
    const fullPath = path.join(ROOT, 'tradeshow-globe', 'dist', subPath);
    const ext      = path.extname(fullPath);
    fs.readFile(fullPath, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    });
    return;
  }

  // ── Static file serving ──
  let filePath = url === '/' ? '/home.html' : url.split('?')[0];
  if (filePath.endsWith('/')) filePath += 'index.html';
  const fullPath = path.join(ROOT, filePath);
  const ext      = path.extname(fullPath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + filePath);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });

});

connectToDatabase()
  .then(() => {
    server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Safran Event Dashboard  v2.0');
  console.log('  ─────────────────────────────────────');
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Listening on ${HOST}:${PORT}`);
  console.log('');
  console.log('  API endpoints:');
  console.log(`    GET  /api/deadline-alerts`);
  console.log(`    GET  /api/research/stream?eventId=PXT26`);
  console.log(`    POST /api/email`);
  console.log(`    POST /api/todo/complete`);
  console.log(`    GET  /api/email-drafts?eventId=PXT26&type=sponsorship`);
  console.log(`    POST /api/run-deadlines`);
  console.log(`    GET  /api/master-events`);
  console.log(`    POST /api/master-events/merge-csv`);
  console.log(`    POST /api/master-events/edit-field`);
  console.log(`    POST /api/master-events/approve-proposal`);
  console.log(`    POST /api/master-events/dismiss-proposal`);
  console.log('');
    });
  })
  .catch(err => {
    console.error('[serve] MongoDB connection failed:', err.message);
    process.exit(1);
  });
