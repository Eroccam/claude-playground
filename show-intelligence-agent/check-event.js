const mongoose = require('mongoose');
const { getMasterData } = require('../event-dashboard/db');

async function main() {
  const d = await getMasterData();
  const evs = d.events || d;
  const ev = evs.find(e => (e.code || '').toLowerCase() === 'smse26');
  if (!ev) { console.log('NOT FOUND'); process.exit(1); }
  console.log('Code:', ev.code);
  console.log('Title:', ev.sharepoint && ev.sharepoint['Title']);
  console.log('Website:', ev.sharepoint && ev.sharepoint['Event Website']);
  console.log('Region:', ev.meta && ev.meta.region, '/', ev.meta && ev.meta.subRegion);
  console.log('Start Date (sharepoint):', ev.sharepoint && ev.sharepoint['Start Date']);
}

main()
  .catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
