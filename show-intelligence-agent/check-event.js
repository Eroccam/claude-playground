const fs = require('fs');
const path = require('path');
const d = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../_shared/data/master-events.json'), 'utf8'));
const evs = d.events || d;
const ev = evs.find(e => e.code === 'smse26');
if (!ev) { console.log('NOT FOUND'); process.exit(1); }
console.log('Code:', ev.code);
console.log('Title:', ev.sharepoint && ev.sharepoint['Title']);
console.log('Website:', ev.sharepoint && ev.sharepoint['Event Website']);
console.log('Region:', ev.meta && ev.meta.region, '/', ev.meta && ev.meta.subRegion);
console.log('Start Date (sharepoint):', ev.sharepoint && ev.sharepoint['Start Date']);
