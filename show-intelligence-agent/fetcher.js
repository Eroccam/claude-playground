/**
 * fetcher.js  v2.0.0
 * Layer 1 of the research pipeline.
 * Fetches a URL, parses HTML with cheerio, and returns clean readable text.
 * Never throws — always returns a structured result object.
 */

'use strict';

// Node 18+ has built-in fetch globally
const cheerio = require('cheerio');

const FETCH_TIMEOUT_MS  = 15_000;
const MAX_BODY_CHARS    = 80_000;
const MAX_REDIRECTS     = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveUrl(href, base) {
  if (!href) return null;
  try {
    if (/^https?:\/\//i.test(href)) return href;
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function isNavElement($el) {
  const tag  = $el.prop('tagName')?.toLowerCase() || '';
  const cls  = ($el.attr('class') || '').toLowerCase();
  const id   = ($el.attr('id')   || '').toLowerCase();
  return tag === 'nav' || tag === 'header'
    || /\b(nav|menu|header|navigation)\b/.test(cls)
    || /\b(nav|menu|header|navigation)\b/.test(id);
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

/**
 * Fetch a URL and return cleaned page content.
 * @param {string} url
 * @returns {Promise<object>}
 */
async function fetchPage(url) {
  let response;
  let finalUrl = url;

  try {
    const controller  = new AbortController();
    const timer       = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    response = await fetch(url, {
      redirect: 'follow',
      signal:   controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SafranResearchBot/2.0; research tool)',
        'Accept':     'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);
    finalUrl = response.url || url;

    if (!response.ok) {
      return {
        success: false,
        url,
        finalUrl,
        error:      `HTTP ${response.status} ${response.statusText}`,
        statusCode: response.status,
      };
    }
  } catch (err) {
    const msg = err.name === 'AbortError'
      ? `Timeout after ${FETCH_TIMEOUT_MS / 1000}s`
      : err.message;
    return { success: false, url, finalUrl: null, error: msg, statusCode: null };
  }

  // Parse HTML
  let html;
  try {
    html = await response.text();
  } catch (err) {
    return { success: false, url, finalUrl, error: 'Failed to read response body: ' + err.message, statusCode: response.status };
  }

  return parsePage(html, url, finalUrl, response.status);
}

/**
 * Parse raw HTML into structured page content.
 * @param {string} html
 * @param {string} originalUrl
 * @param {string} finalUrl
 * @param {number} statusCode
 * @returns {object}
 */
function parsePage(html, originalUrl, finalUrl, statusCode) {
  const $ = cheerio.load(html);

  // ── Remove noise ──────────────────────────────────────────────────────────
  $('script, style, svg, noscript, iframe, [style*="display:none"], [style*="display: none"], [style*="visibility:hidden"], [style*="visibility: hidden"]').remove();
  $('[hidden]').remove();

  const pageTitle = $('title').first().text().trim() || '';

  // ── Extract footer text early (before we strip it) ───────────────────────
  const footerText = ($('footer').text() + ' ' + $('[role="contentinfo"]').text()).trim().replace(/\s+/g, ' ').slice(0, 5000);

  // ── Navigation links ──────────────────────────────────────────────────────
  const navigationLinks = [];
  const seenHrefs = new Set();

  $('a[href]').each((_, el) => {
    const $el   = $(el);
    const raw   = ($el.attr('href') || '').trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return;

    const href  = resolveUrl(raw, finalUrl);
    if (!href || seenHrefs.has(href)) return;
    seenHrefs.add(href);

    const linkText = $el.text().trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!linkText) return;

    // Determine if navigation link
    const parents = $el.parents();
    let isNavigation = false;
    parents.each((__, parent) => {
      if (isNavElement($(parent))) { isNavigation = true; return false; }
    });

    navigationLinks.push({ linkText, href, isNavigation });
  });

  // ── Headings ──────────────────────────────────────────────────────────────
  const headings = [];
  $('h1, h2, h3, h4').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text) headings.push({ level: el.tagName.toLowerCase(), text });
  });

  // ── Body text ─────────────────────────────────────────────────────────────
  $('header, footer, nav').remove(); // remove structural elements now, after we've collected links/footer
  const rawBody = $('body').text().replace(/\s+/g, ' ').trim();

  let bodyText  = rawBody;
  let truncated = false;
  if (bodyText.length > MAX_BODY_CHARS) {
    bodyText  = bodyText.slice(0, MAX_BODY_CHARS);
    truncated = true;
  }

  // Prepend headings summary for Claude
  const headingSummary = headings.map(h => `[${h.level.toUpperCase()}] ${h.text}`).join('\n');
  if (headingSummary) {
    bodyText = `=== PAGE HEADINGS ===\n${headingSummary}\n\n=== PAGE BODY ===\n${bodyText}`;
  }

  return {
    success:         true,
    url:             originalUrl,
    finalUrl,
    statusCode,
    pageTitle,
    bodyText,
    navigationLinks,
    footerText,
    truncated,
    characterCount:  rawBody.length,
  };
}

// ─── URL Verifier ─────────────────────────────────────────────────────────────

/**
 * Verify a URL is live.
 * @param {string} url
 * @returns {Promise<{isLive: boolean, finalUrl: string|null, statusCode: number|null, pageTitle: string|null}>}
 */
async function verifyUrl(url) {
  const check = async (method) => {
    try {
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal:   controller.signal,
        headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; SafranResearchBot/2.0)' },
      });
      clearTimeout(timer);
      const isLive = [200, 301, 302].includes(res.status);
      let pageTitle = null;
      if (method === 'GET' && res.ok) {
        const html = await res.text();
        const m    = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        pageTitle  = m ? m[1].trim() : null;
      }
      return { isLive, finalUrl: res.url || url, statusCode: res.status, pageTitle };
    } catch {
      return null;
    }
  };

  const head = await check('HEAD');
  if (head) return head;
  const get  = await check('GET');
  if (get)  return get;
  return { isLive: false, finalUrl: null, statusCode: null, pageTitle: null };
}

module.exports = { fetchPage, verifyUrl };
