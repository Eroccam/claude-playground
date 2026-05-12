/**
 * email-composer.js  v1.0.0
 * Loads an event record + email template, calls Claude API to compose
 * a professional email, writes the draft to _shared/data/email-drafts/,
 * and returns the draft content to the caller.
 *
 * Usage (module):
 *   const composer = require('./email-composer');
 *   const draft = await composer.compose({ eventId: 'PXT26', emailType: 'sponsorship' });
 *
 * Usage (CLI):
 *   node email-composer.js --eventId PXT26 --emailType sponsorship
 *   node email-composer.js --eventId PXT26 --emailType exhibit --dry-run
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SHARED_DATA   = path.resolve(__dirname, '../_shared/data');
const EVENTS_FILE   = path.join(SHARED_DATA, 'master-events.json');
const DRAFTS_DIR    = path.join(SHARED_DATA, 'email-drafts');
const TEMPLATES_DIR = path.join(__dirname, 'templates');

const AGENT_VERSION = '1.0.0';

const TEMPLATE_MAP = {
  sponsorship: 'email-sponsorship.md',
  exhibit:     'email-exhibit.md',
  housing:     'email-housing.md',
  followup:    'email-followup.md',
  speaking:    'email-speaking.md',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: INPUT PARSING
// ═══════════════════════════════════════════════════════════════════════════════

function parseArgs(argv) {
  const args = { eventId: null, emailType: null, dryRun: false, tone: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--eventId'   && argv[i+1]) { args.eventId   = argv[++i]; continue; }
    if (argv[i] === '--emailType' && argv[i+1]) { args.emailType = argv[++i]; continue; }
    if (argv[i] === '--tone'      && argv[i+1]) { args.tone      = argv[++i]; continue; }
    if (argv[i] === '--dry-run') { args.dryRun = true; continue; }
  }
  if (!args.eventId)   { console.error('[email-composer] --eventId is required');   process.exit(1); }
  if (!args.emailType) { console.error('[email-composer] --emailType is required'); process.exit(1); }
  if (!TEMPLATE_MAP[args.emailType]) {
    console.error(`[email-composer] Unknown emailType "${args.emailType}". Valid: ${Object.keys(TEMPLATE_MAP).join(', ')}`);
    process.exit(1);
  }
  return args;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: LOAD TEMPLATE
// Parse YAML frontmatter from markdown template files.
// Returns { subject, body } — body still has {{placeholder}} tokens.
// ═══════════════════════════════════════════════════════════════════════════════

function loadTemplate(emailType) {
  const filename = TEMPLATE_MAP[emailType];
  if (!filename) throw new Error(`Unknown email type: ${emailType}`);

  const filepath = path.join(TEMPLATES_DIR, filename);
  const raw      = fs.readFileSync(filepath, 'utf8');

  // Parse YAML frontmatter (between --- delimiters)
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) {
    // No frontmatter — use entire file as body
    return { subject: `Safran — ${emailType} Inquiry`, body: raw.trim() };
  }

  const frontmatter = fmMatch[1];
  const body        = fmMatch[2].trim();

  // Extract subject from frontmatter
  const subjectMatch = frontmatter.match(/^subject:\s*["']?(.+?)["']?\s*$/m);
  const subject = subjectMatch ? subjectMatch[1].trim() : `Safran — ${emailType} Inquiry`;

  return { subject, body };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: LOAD EVENT DATA
// Find event by code, build a structured context for Claude.
// ═══════════════════════════════════════════════════════════════════════════════

function loadEventData(eventId, emailType) {
  const raw      = fs.readFileSync(EVENTS_FILE, 'utf8');
  const data     = JSON.parse(raw);
  const events   = data.events || data;
  const rawEvent = events.find(e => (e.code || '').toUpperCase() === eventId.toUpperCase());

  if (!rawEvent) {
    const codes = events.map(e => e.code).filter(Boolean).sort().join(', ');
    throw new Error(`Event "${eventId}" not found. Available codes: ${codes}`);
  }

  // Normalize master-events 5-layer schema to flat fields
  let event = rawEvent;
  if (rawEvent.sharepoint) {
    const sp   = rawEvent.sharepoint;
    const getF = col => rawEvent.approved?.[col]?.value ?? rawEvent.dashboardEdits?.[col]?.value ?? sp?.[col] ?? null;
    event = {
      ...rawEvent,
      title:                getF('Title'),
      startDate:            getF('Start Date'),
      endDate:              getF('End Date'),
      registrationDeadline: getF('Registration Deadline'),
      venue:                getF('Venue'),
      organizingCompany:    getF('Organizing Company'),
      subject:              getF('Main Event Subject'),
      boothSize:            getF('Booth Size'),
      businessLines:        (() => { try { return JSON.parse(getF('Business Lines')||'[]'); } catch { return []; } })(),
      website:              getF('Event Website'),
    };
  }

  const intel = event.research?.intelligence || {};
  const name  = (event.title || event.code || '').replace(/^NEW:\s*/i, '').trim();
  const year  = event.startDate ? event.startDate.slice(0, 4) : String(new Date().getFullYear());

  // Format date range
  const formatDate = d => {
    if (!d) return null;
    try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
    catch { return d; }
  };
  const startFmt = formatDate(event.startDate);
  const endFmt   = formatDate(event.endDate);
  const dates    = startFmt && endFmt ? `${startFmt} – ${endFmt}` : (startFmt || 'TBD');

  // Pick the most relevant deadline by email type
  const deadlineByType = {
    sponsorship: intel.sponsorship?.deadline,
    exhibit:     intel.booth?.standardDeadline || intel.booth?.earlyBirdDeadline,
    housing:     intel.housing?.deadline,
    speaking:    intel.opportunities?.speakingDeadline,
    followup:    intel.booth?.standardDeadline || intel.sponsorship?.deadline,
  };
  const relevantDeadline = deadlineByType[emailType] || event.registrationDeadline || null;

  // Pick a package/tier name by type
  const packageByType = {
    sponsorship: (intel.sponsorship?.tierNames || [])[0] || null,
    exhibit:     (intel.booth?.boothSizes || [])[0]?.size ? `${(intel.booth.boothSizes[0]).size} booth` : (event.boothSize || null),
    housing:     intel.housing?.blockName || null,
    speaking:    null,
    followup:    null,
  };

  const context = {
    showName:            name,
    showYear:            year,
    showDates:           dates,
    venue:               intel.dates?.fullAddress || event.venue || 'TBD',
    organizerContact:    intel.contacts?.exhibitsManager || intel.contacts?.sponsorshipContact || null,
    organizerEmail:      emailType === 'sponsorship'
                           ? (intel.contacts?.sponsorshipContactEmail || null)
                           : (intel.contacts?.exhibitsManagerEmail || intel.contacts?.sponsorshipContactEmail || null),
    organizerCompany:    intel.identity?.organizerName || event.organizingCompany || null,
    relevantDeadline:    relevantDeadline ? formatDate(relevantDeadline) : null,
    packageTier:         packageByType[emailType] || null,
    officialWebsite:     intel.identity?.officialWebsite || event.website || null,
    subject:             event.subject || null,
    businessLines:       (event.businessLines || []).join(', ') || null,
    attendanceExpected:  intel.attendance?.expectedAttendees || null,
    emailType,
    // Include full intel for Claude's reference
    intelligenceSummary: JSON.stringify(intel, null, 2),
  };

  return { event, context };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: CLAUDE API CALL
// Compose the email using Claude, substituting all template placeholders.
// Any field Claude cannot fill is flagged as [MISSING: field name — where to find it]
// ═══════════════════════════════════════════════════════════════════════════════

function buildMockDraft(template, context) {
  // Simple token substitution for dry-run / no API key mode
  const tokenMap = {
    '{{show_name}}':              context.showName || '[MISSING: show_name — check master-events.json title field]',
    '{{show_year}}':              context.showYear || '[MISSING: show_year — check master-events.json Start Date]',
    '{{show_dates}}':             context.showDates || '[MISSING: show_dates — check master-events.json Start Date/endDate]',
    '{{venue}}':                  context.venue || '[MISSING: venue — run research agent to populate]',
    '{{organizer_contact_name}}': context.organizerContact || '[MISSING: organizer_contact_name — check contacts in intelligence]',
    '{{relevant_deadline}}':      context.relevantDeadline || '[MISSING: relevant_deadline — run research agent to find deadline]',
    '{{package_tier_name}}':      context.packageTier || '[MISSING: package_tier_name — run research agent for pricing]',
  };

  let subject = template.subject;
  let body    = template.body;

  for (const [token, value] of Object.entries(tokenMap)) {
    subject = subject.replaceAll(token, value);
    body    = body.replaceAll(token, value);
  }

  return { subject, body };
}

async function composeWithClaude(template, context, tone, dryRun) {
  if (dryRun || !process.env.ANTHROPIC_API_KEY) {
    if (!dryRun) {
      console.warn('[email-composer] WARNING: ANTHROPIC_API_KEY not set — using template substitution only.');
    }
    return buildMockDraft(template, context);
  }

  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk');
  } catch {
    console.warn('[email-composer] WARNING: @anthropic-ai/sdk not installed. Using template substitution.');
    return buildMockDraft(template, context);
  }

  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = [
    'You are a senior communications specialist at Safran, a premier global aerospace, defense, and security manufacturer.',
    'Your task is to compose a professional outreach email to a tradeshow or conference organizer.',
    'Write in a tone that is confident, professional, and collaborative — appropriate for a world-class industrial company.',
    '',
    'RULES:',
    '- Substitute ALL {{placeholder}} tokens in the template with real data from the event context provided',
    '- If a placeholder cannot be filled because data is missing, replace it with: [MISSING: field name — where to find it]',
    '  Example: [MISSING: housing_portal_url — run research agent housing category]',
    '- Do not invent specific dollar amounts, dates, or contact names if they are not in the provided context',
    '- Keep the email concise and professional (target: 150–250 words for body)',
    '- Return a JSON object with exactly two keys: "subject" (string) and "body" (string)',
    '- The body should be plain text suitable for an email client, with paragraph breaks using \\n\\n',
    tone ? `- Tone adjustment requested: ${tone}` : '',
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `EMAIL TYPE: ${context.emailType}`,
    ``,
    `EVENT CONTEXT:`,
    `  Show Name:          ${context.showName}`,
    `  Show Year:          ${context.showYear}`,
    `  Dates:              ${context.showDates}`,
    `  Venue:              ${context.venue}`,
    `  Organizer Contact:  ${context.organizerContact || 'Unknown'}`,
    `  Organizer Email:    ${context.organizerEmail || 'Unknown'}`,
    `  Relevant Deadline:  ${context.relevantDeadline || 'Not found'}`,
    `  Package/Tier:       ${context.packageTier || 'Not specified'}`,
    `  Website:            ${context.officialWebsite || 'Not found'}`,
    `  Subject Matter:     ${context.subject || 'General'}`,
    `  Business Lines:     ${context.businessLines || 'Multiple Safran divisions'}`,
    ``,
    `RESEARCH INTELLIGENCE (additional data):`,
    context.intelligenceSummary,
    ``,
    `TEMPLATE TO FILL:`,
    `---SUBJECT---`,
    template.subject,
    `---BODY---`,
    template.body,
  ].join('\n');

  const msg = await client.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 1500,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userPrompt }],
  });

  const text = msg.content[0]?.text || '{}';
  try {
    // Claude may wrap in ```json ... ``` — strip it
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // If Claude didn't return JSON, extract manually
    const subjMatch = text.match(/subject["\s:]+(.+)/i);
    return {
      subject: subjMatch?.[1]?.trim() || template.subject,
      body:    text,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION: WRITE DRAFT TO EMAIL-DRAFTS/
// Filename: {eventId}-{emailType}-{YYYYMMDD}.txt
// ═══════════════════════════════════════════════════════════════════════════════

function ensureDraftsDir() {
  if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });
}

function writeDraft(eventId, emailType, subject, body, dryRun) {
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `${eventId}-${emailType}-${date}-${time}.txt`;
  const filepath = path.join(DRAFTS_DIR, filename);

  const content = [
    `TO: [Organizer Contact Email]`,
    `SUBJECT: ${subject}`,
    `DATE: ${now.toISOString()}`,
    `EVENT: ${eventId}`,
    `TYPE: ${emailType}`,
    `AGENT_VERSION: ${AGENT_VERSION}`,
    ``,
    `─────────────────────────────────────────────────────────`,
    ``,
    body,
    ``,
    `─────────────────────────────────────────────────────────`,
    `Generated by Safran Show Intelligence Agent v${AGENT_VERSION}`,
  ].join('\n');

  if (dryRun) {
    console.log('[email-composer] DRY RUN — draft that would be written to:', filepath);
    console.log(content);
    return { filepath, filename, content, subject, body };
  }

  ensureDraftsDir();
  fs.writeFileSync(filepath, content, 'utf8');
  console.log('[email-composer] ✓ Draft written to:', filename);
  return { filepath, filename, content, subject, body };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API (called by serve.js / orchestrator)
// ═══════════════════════════════════════════════════════════════════════════════

async function compose({ eventId, emailType, tone = null, dryRun = false }) {
  console.log(`[email-composer] Composing ${emailType} email for event: ${eventId}`);

  const template             = loadTemplate(emailType);
  const { event, context }   = loadEventData(eventId, emailType);
  const { subject, body }    = await composeWithClaude(template, context, tone, dryRun);
  const draft                = writeDraft(eventId, emailType, subject, body, dryRun);

  console.log(`[email-composer] Done. Subject: "${subject}"`);
  return {
    eventId,
    emailType,
    subject,
    body,
    toEmail:   context.organizerEmail,
    toName:    context.organizerContact,
    filepath:  draft.filepath,
    filename:  draft.filename,
    content:   draft.content,
    composedAt: new Date().toISOString(),
  };
}

module.exports = { compose };

// ═══════════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  compose({ eventId: args.eventId, emailType: args.emailType, tone: args.tone, dryRun: args.dryRun })
    .catch(err => {
      console.error('[email-composer] Fatal error:', err.message);
      process.exit(1);
    });
}
