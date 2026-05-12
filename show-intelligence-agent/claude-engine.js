/**
 * claude-engine.js  v2.0.0
 * Layer 2 — Claude API reasoning engine.
 * Receives page content from fetcher.js and uses Claude to extract structured
 * field values. Also provides venue address inference when page scraping fails.
 */

'use strict';

const path     = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const CONFIG_FILE = path.resolve(__dirname, '../_shared/config.json');
const MODEL       = 'claude-sonnet-4-20250514';
const MAX_TOKENS  = 2000;

// ─── Load API key at module init ─────────────────────────────────────────────
let config;
try {
  config = JSON.parse(require('fs').readFileSync(CONFIG_FILE, 'utf8'));
} catch (err) {
  throw new Error(`claude-engine: Cannot read config.json — ${err.message}`);
}
const API_KEY = process.env.ANTHROPIC_API_KEY || config.anthropicApiKey;
if (!API_KEY || typeof API_KEY !== 'string' || !API_KEY.startsWith('sk-')) {
  throw new Error('ANTHROPIC_API_KEY not set — provide it via the ANTHROPIC_API_KEY environment variable or _shared/config.json.');
}

const anthropic = new Anthropic({ apiKey: API_KEY });

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert research assistant extracting specific information about a tradeshow or industry conference from a webpage. You will be given the full text content of a webpage and a list of fields to find. Follow these rules without exception:
(1) Only extract values that are explicitly stated on this page. Never guess, infer without stating so, or construct values.
(2) If a value is not on this page return null for that field.
(3) For dates always use YYYY-MM-DD format.
(4) For address fields extract only the specific component requested — street number and name only in the street field, city name only in the city field, two-letter state code for US states in the state field, full country name in the country field.
(5) For venue extract only the facility name, not the address.
(6) If you apply any reasoning beyond direct reading of the page — for example looking up a venue name to find its address — mark reasoningMethod as "inferred" and explain your reasoning.
(7) Always return valid JSON exactly matching the schema. No markdown, no code fences, no explanation outside the JSON.
(8) In suggestedSubpages include any navigation links from this page that are likely to contain fields you could not find here — especially links labeled Exhibit, Exhibitors, Venue, Location, Hotel, Housing, Sponsors, Sponsorship, Register, Deadlines, or Schedule.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripCodeFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function buildFieldList(fieldsNeeded) {
  return fieldsNeeded.map((f, i) =>
    `${i + 1}. ${f.name}: ${f.description}${f.currentValue ? ` (current value: ${f.currentValue})` : ''}`
  ).join('\n');
}

function buildJsonSchema(fieldsNeeded) {
  const fieldProps = fieldsNeeded.map(f => `    "${f.name}": {
      "value": "extracted value or null",
      "confidence": "high | medium | low",
      "reasoningMethod": "direct | inferred",
      "reasoning": "required if inferred, null otherwise",
      "sourceConfirmed": true
    }`).join(',\n');

  return `{
  "fields": {
${fieldProps}
  },
  "suggestedSubpages": [
    {
      "url": "absolute URL",
      "reason": "why this page likely contains missing fields",
      "fieldsLikelyFound": ["fieldName1"]
    }
  ],
  "pageAssessment": "one sentence describing what this page is and whether it was useful"
}`;
}

async function callClaude(messages, attempt = 1) {
  try {
    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     SYSTEM_PROMPT,
      messages,
    });
    return { ok: true, content: response.content[0]?.text || '' };
  } catch (err) {
    // Rate limit handling
    if (err.status === 429 && attempt === 1) {
      console.log('[claude-engine] Rate limited — waiting 10s before retry…');
      await new Promise(r => setTimeout(r, 10_000));
      return callClaude(messages, 2);
    }
    if (attempt === 2 && err.status === 429) {
      return { ok: false, error: 'API rate limit — retry later.' };
    }
    return { ok: false, error: err.message };
  }
}

function errorResult(fieldsNeeded, reason) {
  const fields = {};
  fieldsNeeded.forEach(f => {
    fields[f.name] = { value: null, confidence: 'low', reasoningMethod: 'direct', reasoning: null, sourceConfirmed: false };
  });
  return { fields, suggestedSubpages: [], pageAssessment: `Error: ${reason}`, error: reason };
}

// ─── Main extraction function ─────────────────────────────────────────────────

/**
 * Extract fields from a fetched page using Claude.
 * @param {object} pageData  — from fetcher.js fetchPage()
 * @param {Array}  fieldsNeeded — [{name, description, currentValue}]
 * @param {object} eventContext — {eventName, eventCode, eventWebsite, region}
 * @returns {Promise<object>} — {fields, suggestedSubpages, pageAssessment}
 */
async function extractFromPage(pageData, fieldsNeeded, eventContext) {
  if (!pageData.success) {
    return errorResult(fieldsNeeded, `Page fetch failed: ${pageData.error}`);
  }
  if (!fieldsNeeded || fieldsNeeded.length === 0) {
    return { fields: {}, suggestedSubpages: [], pageAssessment: 'No fields requested.' };
  }

  const fieldList    = buildFieldList(fieldsNeeded);
  const jsonSchema   = buildJsonSchema(fieldsNeeded);
  const navLinkBlock = pageData.navigationLinks
    .filter(l => l.isNavigation || /exhibit|venue|location|sponsor|register|housing|hotel|schedul|deadline/i.test(l.linkText))
    .slice(0, 30)
    .map(l => `  - "${l.linkText}" → ${l.href}`)
    .join('\n');

  const userMessage = `EVENT CONTEXT:
Name: ${eventContext.eventName}
Code: ${eventContext.eventCode}
Region: ${eventContext.region || 'Unknown'}
Page URL: ${pageData.finalUrl}
Page Title: ${pageData.pageTitle}

FOOTER TEXT (often contains venue address):
${pageData.footerText || '(none)'}

NAVIGATION LINKS (potential subpages to suggest):
${navLinkBlock || '(none)'}

FULL PAGE BODY TEXT:
${pageData.bodyText}

---
FIELDS TO EXTRACT (${fieldsNeeded.length} fields):
${fieldList}

Return EXACTLY this JSON schema — no markdown, no explanation:
${jsonSchema}`;

  // First attempt
  const messages = [{ role: 'user', content: userMessage }];
  let result     = await callClaude(messages);

  if (!result.ok) {
    return errorResult(fieldsNeeded, result.error);
  }

  // Parse JSON — first attempt
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFences(result.content));
  } catch {
    console.warn('[claude-engine] JSON parse failed on first attempt, retrying with explicit instruction…');
    // Retry with stronger instruction
    const retryMessages = [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: result.content },
      { role: 'user', content: 'Return only raw JSON, no markdown formatting. No explanation. Just the JSON object.' },
    ];
    const retry = await callClaude(retryMessages);
    if (!retry.ok) {
      console.error('[claude-engine] Retry failed:', retry.error);
      return errorResult(fieldsNeeded, 'JSON parse failed on both attempts');
    }
    try {
      parsed = JSON.parse(stripCodeFences(retry.content));
    } catch {
      console.error('[claude-engine] Raw response:', result.content.slice(0, 500));
      return errorResult(fieldsNeeded, 'JSON parse failed on both attempts');
    }
  }

  // Normalize — ensure all requested fields are present
  if (!parsed.fields) parsed.fields = {};
  fieldsNeeded.forEach(f => {
    if (!parsed.fields[f.name]) {
      parsed.fields[f.name] = { value: null, confidence: 'low', reasoningMethod: 'direct', reasoning: null, sourceConfirmed: false };
    }
  });
  if (!Array.isArray(parsed.suggestedSubpages)) parsed.suggestedSubpages = [];

  return parsed;
}

// ─── Venue address inference ──────────────────────────────────────────────────

/**
 * Ask Claude to recall the street address of a well-known venue from its training data.
 * @param {string} venueName
 * @param {string} city
 * @param {string} country
 * @returns {Promise<{street: string|null, confidence: string, reasoning: string}>}
 */
async function inferVenueAddress(venueName, city, country) {
  const userMessage = `Given the venue name "${venueName}" located in ${city}, ${country}, what is the street address of this venue? Search your knowledge for this specific venue. If you know the address with high confidence provide it. If you are not certain return null. Return JSON only: { "street": string or null, "confidence": "high" or "low", "reasoning": string }`;

  const result = await callClaude([{ role: 'user', content: userMessage }]);
  if (!result.ok) return { street: null, confidence: 'low', reasoning: result.error };

  try {
    const parsed = JSON.parse(stripCodeFences(result.content));
    return {
      street:     parsed.street     || null,
      confidence: parsed.confidence || 'low',
      reasoning:  parsed.reasoning  || '',
    };
  } catch {
    return { street: null, confidence: 'low', reasoning: 'JSON parse failed' };
  }
}

module.exports = { extractFromPage, inferVenueAddress };
