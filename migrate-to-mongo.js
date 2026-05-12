'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { replaceMasterData } = require('./event-dashboard/db');

const MASTER_FILE = path.join(__dirname, '_shared', 'data', 'master-events.json');

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  const raw = fs.readFileSync(MASTER_FILE, 'utf8');
  const masterData = JSON.parse(raw);
  const events = masterData.events || [];

  if (!Array.isArray(events) || events.length === 0) {
    throw new Error(`No events found in ${MASTER_FILE}`);
  }

  masterData.totalEvents = masterData.totalEvents ?? events.length;
  masterData.lastUpdated = masterData.lastUpdated || new Date().toISOString();

  const result = await replaceMasterData(masterData);
  console.log(`[migrate-to-mongo] Seeded ${result.inserted} event records into MongoDB.`);
  console.log(`[migrate-to-mongo] Master metadata: totalEvents=${masterData.totalEvents}, lastUpdated=${masterData.lastUpdated}`);
}

main()
  .catch(err => {
    console.error('[migrate-to-mongo] Fatal:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
