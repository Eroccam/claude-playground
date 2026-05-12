'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;
const Mixed = Schema.Types.Mixed;

let connectionPromise = null;

const sharepointSchema = new Schema({
  _uploadedAt: String,
  Title: String,
  'Event Code': String,
  'Event Rank': String,
  'Attendance Record': String,
  'Start Date': String,
  'End Date': String,
  Region: String,
  Location: String,
  'Event Type': String,
  'Event Location: Street': String,
  'Event Location: City': String,
  'Event Location: State': String,
  'Event Location: Country/Region': String,
  Venue: String,
  'Event Website': String,
  'Booth Size': String,
  'Booth%23': String,
  Status: String,
  Sector: String,
  'Organizing Company': String,
  'Business Lines': String,
  'Show Captain': String,
  'Ship By Date': String,
  'Registration Deadline': String,
  'Mockups/Models': String,
  'Action Status': String,
  'Main Event Subject': String,
  Notes: String,
  'Days until Start': Mixed,
  Staff_Assigned: String,
  'Related Documents': String,
  'Email Header': String,
}, { _id: false, strict: false });

const metaSchema = new Schema({
  region: Mixed,
  subRegion: Mixed,
  regionalTags: [Mixed],
  statusGroup: Mixed,
  urgency: Mixed,
  lastResearchedAt: Mixed,
  researchVersion: Mixed,
  intelligenceScore: Mixed,
  completedSinceFeb2026: Mixed,
}, { _id: false, strict: false });

const eventSchema = new Schema({
  code: String,
  sharepoint: sharepointSchema,
  proposals: { type: Mixed, default: {} },
  approved: { type: Mixed, default: {} },
  dashboardEdits: { type: Mixed, default: {} },
  dismissed: { type: Mixed, default: {} },
  meta: metaSchema,
  research: { type: Mixed, default: {} },
}, {
  collection: 'events',
  minimize: false,
  strict: false,
  versionKey: false,
});

const masterMetaSchema = new Schema({
  key: { type: String, required: true },
  lastUpdated: Mixed,
  totalEvents: Number,
}, {
  collection: 'master_meta',
  minimize: false,
  versionKey: false,
});

const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);
const MasterMeta = mongoose.models.MasterMeta || mongoose.model('MasterMeta', masterMetaSchema);

async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connectionPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI environment variable is not set');
    connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    }).then(conn => {
      console.log('[db] MongoDB connected');
      return conn.connection;
    }).catch(err => {
      connectionPromise = null;
      throw err;
    });
  }
  return connectionPromise;
}

function stripMongoFields(value) {
  const json = JSON.parse(JSON.stringify(value));
  if (json && typeof json === 'object') {
    delete json._id;
    delete json.__v;
  }
  return json;
}

async function getMasterData() {
  await connectToDatabase();
  const [meta, events] = await Promise.all([
    MasterMeta.findOne({ key: 'master-events' }).lean(),
    Event.find({}).sort({ _id: 1 }).lean(),
  ]);
  const cleanEvents = events.map(stripMongoFields);
  return {
    lastUpdated: meta?.lastUpdated || null,
    totalEvents: meta?.totalEvents ?? cleanEvents.length,
    events: cleanEvents,
  };
}

async function replaceMasterData(masterData) {
  await connectToDatabase();
  const events = masterData.events || [];
  await Event.deleteMany({});
  if (events.length) await Event.insertMany(events, { ordered: true });
  await MasterMeta.findOneAndUpdate(
    { key: 'master-events' },
    {
      key: 'master-events',
      lastUpdated: masterData.lastUpdated || new Date().toISOString(),
      totalEvents: masterData.totalEvents ?? events.length,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { inserted: events.length };
}

async function saveMasterData(masterData) {
  return replaceMasterData(masterData);
}

async function updateMasterMeta(fields = {}) {
  await connectToDatabase();
  const totalEvents = fields.totalEvents ?? await Event.countDocuments();
  return MasterMeta.findOneAndUpdate(
    { key: 'master-events' },
    {
      key: 'master-events',
      lastUpdated: fields.lastUpdated || new Date().toISOString(),
      totalEvents,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

module.exports = {
  connectToDatabase,
  getMasterData,
  replaceMasterData,
  saveMasterData,
  updateMasterMeta,
  Event,
  MasterMeta,
};
