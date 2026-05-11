/**
 * dateHelpers.js — Safran Events Platform
 * Shared date comparison and formatting utilities used across all apps and agents.
 */

/**
 * Returns the number of days between today and a target date.
 * Negative value means the date is in the past.
 * @param {string} dateStr - ISO 8601 date string (YYYY-MM-DD)
 * @returns {number}
 */
function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

/**
 * Classifies a deadline date into an urgency bucket.
 * @param {string} dateStr - ISO 8601 date string
 * @returns {'overdue' | 'urgent' | 'soon' | 'future'}
 */
function classifyDeadline(dateStr) {
  const days = daysUntil(dateStr);
  if (days < 0)   return 'overdue';
  if (days <= 7)  return 'urgent';
  if (days <= 30) return 'soon';
  return 'future';
}

/**
 * Formats an ISO date string to a human-readable format.
 * @param {string} dateStr - ISO 8601 date string
 * @param {string} [locale='en-GB'] - BCP 47 locale tag
 * @returns {string} e.g. "14 June 2025"
 */
function formatDate(dateStr, locale = 'en-GB') {
  return new Date(dateStr).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Formats a date range as a readable string.
 * @param {string} startDate - ISO 8601
 * @param {string} endDate - ISO 8601
 * @returns {string} e.g. "16–20 June 2025"
 */
function formatDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
  }
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

/**
 * Returns true if an event is currently active (today is between start and end dates).
 * @param {string} startDate - ISO 8601
 * @param {string} endDate - ISO 8601
 * @returns {boolean}
 */
function isEventActive(startDate, endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(startDate) <= today && today <= new Date(endDate);
}

/**
 * Returns the current ISO 8601 datetime string (for lastUpdated fields).
 * @returns {string}
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * Sorts an array of events by startDate ascending.
 * @param {Array} events
 * @returns {Array}
 */
function sortEventsByDate(events) {
  return [...events].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
}

/**
 * Filters events to those occurring in a given year.
 * @param {Array} events
 * @param {number} year
 * @returns {Array}
 */
function filterEventsByYear(events, year) {
  return events.filter(e => new Date(e.startDate).getFullYear() === year);
}

// CommonJS export (Node.js / agents)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    daysUntil,
    classifyDeadline,
    formatDate,
    formatDateRange,
    isEventActive,
    nowISO,
    sortEventsByDate,
    filterEventsByYear,
  };
}
