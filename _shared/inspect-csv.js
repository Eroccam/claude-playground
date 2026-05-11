const fs = require('fs');
const path = require('path');

const raw = require('fs').readFileSync(
  path.join(__dirname, 'data', 'Events_List.csv'), 'utf8'
);

// Reuse the same CSV parser as parse-events.js
function parseCSV(raw) {
  const lines = [];
  let field = '', row = [], inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i], next = raw[i + 1];
    if (inQuote) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); field = ''; lines.push(row); row = []; }
      else if (ch !== '\r') { field += ch; }
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); lines.push(row); }
  return lines;
}

const lines = parseCSV(raw);
const headers = lines[0].map(h => h.trim());

const fields = ['Event Type', 'Business Lines', 'Staff_Assigned', 'Mockups/Models'];
fields.forEach(f => {
  const idx = headers.indexOf(f);
  console.log('\nField:', f, '(col', idx + ')');
  for (let i = 1; i <= 8; i++) {
    if (lines[i]) console.log('  row', i, ':', JSON.stringify(lines[i][idx]));
  }
});
