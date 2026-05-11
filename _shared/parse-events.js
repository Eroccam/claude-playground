#!/usr/bin/env node
/**
 * parse-events.js
 * Reads Events_List.csv and writes events.json for the Safran Events Dashboard.
 * Usage:  node parse-events.js
 * Input:  _shared/data/Events_List.csv
 * Output: _shared/data/events.json
 */

const fs   = require("fs");
const path = require("path");

const INPUT_CSV   = path.join(__dirname, "data", "Events_List.csv");
const OUTPUT_JSON = path.join(__dirname, "data", "events.json");

function parseCSV(raw) {
  const lines = [];
  let field = "", row = [], inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i], next = raw[i+1];
    if (inQuote) {
      if      (ch === "\"" && next === "\"") { field += "\""; i++; }
      else if (ch === "\"")                  { inQuote = false; }
      else                                   { field += ch; }
    } else {
      if      (ch === "\"") { inQuote = true; }
      else if (ch === ",")  { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); field = ""; lines.push(row); row = []; }
      else if (ch !== "\r") { field += ch; }
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); lines.push(row); }
  return lines;
}
function parseDate(raw) {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return y + "-" + m.padStart(2, "0") + "-" + d.padStart(2, "0");
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function parseNumber(raw) {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw.trim());
  return isNaN(n) ? null : n;
}

function splitSemicolon(raw) {
  if (!raw || !raw.trim()) return [];
  return raw.split(";").map(function(s) { return s.trim(); }).filter(Boolean);
}

// Handles SharePoint JSON-encoded arrays like ["Exhibition"] or ["ST4D","SDSI"]
function parseJsonArray(raw) {
  if (!raw || !raw.trim()) return [];
  const s = raw.trim();
  if (s.startsWith("[")) {
    try { return JSON.parse(s).map(function(v) { return String(v).trim(); }).filter(Boolean); }
    catch (e) { /* fall through to semicolon split */ }
  }
  return splitSemicolon(s);
}

function deriveStatusGroup(status) {
  if (!status || !status.trim()) return "other";
  const s = status.toUpperCase();
  if (/CANCELLED|CANCELED|NO GO/.test(s))           return "cancelled";
  if (/TBC SALES|TBC SDS|TBC SAFRAN GROUP/.test(s)) return "tbc";
  if (/PENDING|DIVISION INTEREST/.test(s))           return "pending";
  if (/\bTBC\b/.test(s))                             return "tbc";
  if (/PLANNING/.test(s))                            return "planning";
  if (/\bGO\b|UP TO DATE|WALKING SALES/.test(s))    return "go";
  if (/\bSALES\b/.test(s))                          return "go";
  return "other";
}

function deriveUrgency(daysUntilStart, startDate) {
  if (startDate      == null) return "no-date";
  if (daysUntilStart == null) return "no-date";
  if (daysUntilStart <   0)  return "past";
  if (daysUntilStart <=  14) return "critical";
  if (daysUntilStart <=  30) return "soon";
  if (daysUntilStart <= 120) return "upcoming";
  return "future";
}
const H = {
  TITLE        : "Title",
  CODE         : "Event Code",
  RANK         : "Event Rank",
  ATTENDANCE   : "Attendance Record",
  START_DATE   : "Start Date",
  END_DATE     : "End Date",
  REGION       : "Region",
  LOCATION     : "Location",
  EVENT_TYPE   : "Event Type",
  CITY         : "Event Location: City",
  STATE        : "Event Location: State",
  COUNTRY      : "Event Location: Country",
  VENUE        : "Venue",
  WEBSITE      : "Event Website",
  BOOTH_SIZE   : "Booth Size",
  BOOTH_NUMBER : "Booth#",
  STATUS       : "Status",
  SECTOR       : "Sector",
  ORG_COMPANY  : "Organizing Company",
  BIZ_LINES    : "Business Lines",
  CAPTAIN      : "Show Captain",
  SHIP_BY      : "Ship By Date",
  REG_DL       : "Registration Deadline",
  MOCKUPS      : "Mockups/Models",
  ACTION       : "Action Status",
  SUBJECT      : "Main Event Subject",
  NOTES        : "Notes",
  DAYS         : "Days until Start",
  STAFF        : "Staff_Assigned",
};
function main() {
  if (!fs.existsSync(INPUT_CSV)) {
    console.error("ERROR: Input file not found: " + INPUT_CSV);
    process.exit(1);
  }
  const raw   = fs.readFileSync(INPUT_CSV, "utf-8");
  const lines = parseCSV(raw);
  if (lines.length < 2) {
    console.error("ERROR: CSV is empty or has no data rows.");
    process.exit(1);
  }
  const headers = lines[0].map(function(h) { return h.trim(); });
  const idx = {};
  headers.forEach(function(h, i) { idx[h] = i; });
  function cell(row, hdr) {
    const i = idx[hdr];
    return (i !== undefined && row[i] ? row[i] : "").trim();
  }
  const events = [];
  for (let r = 1; r < lines.length; r++) {
    const row = lines[r];
    if (row.every(function(c) { return !c.trim(); })) continue;
    const startDate            = parseDate(cell(row, H.START_DATE));
    const endDate              = parseDate(cell(row, H.END_DATE));
    const shipByDate           = parseDate(cell(row, H.SHIP_BY));
    const registrationDeadline = parseDate(cell(row, H.REG_DL));
    const websiteRaw           = cell(row, H.WEBSITE);
    const statusRaw            = cell(row, H.STATUS);
    const daysUntilStart       = parseNumber(cell(row, H.DAYS));
    const statusGroup          = deriveStatusGroup(statusRaw);
    const urgency              = deriveUrgency(daysUntilStart, startDate);
    events.push({
      title                : cell(row, H.TITLE),
      code                 : cell(row, H.CODE),
      rank                 : cell(row, H.RANK),
      attendanceRecord     : cell(row, H.ATTENDANCE),
      startDate,
      endDate,
      region               : cell(row, H.REGION),
      locationKnown        : cell(row, H.LOCATION),
      eventType            : parseJsonArray(cell(row, H.EVENT_TYPE)),
      city                 : cell(row, H.CITY),
      state                : cell(row, H.STATE),
      country              : cell(row, H.COUNTRY),
      venue                : cell(row, H.VENUE),
      website              : websiteRaw || null,
      boothSize            : cell(row, H.BOOTH_SIZE),
      boothNumber          : cell(row, H.BOOTH_NUMBER),
      status               : statusRaw,
      statusGroup,
      sector               : cell(row, H.SECTOR),
      organizingCompany    : cell(row, H.ORG_COMPANY),
      businessLines        : parseJsonArray(cell(row, H.BIZ_LINES)),
      showCaptain          : cell(row, H.CAPTAIN),
      shipByDate,
      registrationDeadline,
      mockupsModels        : parseJsonArray(cell(row, H.MOCKUPS)),
      actionStatus         : cell(row, H.ACTION),
      subject              : cell(row, H.SUBJECT),
      notes                : cell(row, H.NOTES),
      daysUntilStart,
      staffAssigned        : splitSemicolon(cell(row, H.STAFF)),
      urgency,
    });
  }
  const output = {
    lastUpdated : new Date().toISOString(),
    totalEvents : events.length,
    events,
  };
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2), "utf-8");
  console.log("Parsed       : " + events.length + " events");
  console.log("Output       : " + OUTPUT_JSON);
  console.log("Last updated : " + output.lastUpdated);
}

main();
