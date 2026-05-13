import type { AttendanceType, Region, TradeshowEvent } from '../types.ts';
import eventsData from '../data/events.json';

type UnknownRecord = Record<string, unknown>;

interface MasterEventRecord {
  code?: string;
  sharepoint?: UnknownRecord;
  approved?: UnknownRecord;
  dashboardEdits?: UnknownRecord;
  research?: UnknownRecord;
  meta?: UnknownRecord;
}

interface MasterEventsResponse {
  events?: MasterEventRecord[];
}

const REGION_FALLBACK_COORDS: Record<Region, { lat: number; lng: number }> = {
  US: { lat: 39.8283, lng: -98.5795 },
  EMEA: { lat: 50.1109, lng: 8.6821 },
  APAC: { lat: 1.3521, lng: 103.8198 },
};

const COUNTRY_COORDS: Record<string, { lat: number; lng: number }> = {
  australia: { lat: -25.2744, lng: 133.7751 },
  austria: { lat: 47.5162, lng: 14.5501 },
  belgium: { lat: 50.5039, lng: 4.4699 },
  brazil: { lat: -14.235, lng: -51.9253 },
  bulgaria: { lat: 42.7339, lng: 25.4858 },
  canada: { lat: 56.1304, lng: -106.3468 },
  china: { lat: 35.8617, lng: 104.1954 },
  czechia: { lat: 49.8175, lng: 15.473 },
  denmark: { lat: 56.2639, lng: 9.5018 },
  egypt: { lat: 26.8206, lng: 30.8025 },
  finland: { lat: 61.9241, lng: 25.7482 },
  france: { lat: 46.2276, lng: 2.2137 },
  germany: { lat: 51.1657, lng: 10.4515 },
  greece: { lat: 39.0742, lng: 21.8243 },
  india: { lat: 20.5937, lng: 78.9629 },
  italy: { lat: 41.8719, lng: 12.5674 },
  japan: { lat: 36.2048, lng: 138.2529 },
  malaysia: { lat: 4.2105, lng: 101.9758 },
  mexico: { lat: 23.6345, lng: -102.5528 },
  netherlands: { lat: 52.1326, lng: 5.2913 },
  norway: { lat: 60.472, lng: 8.4689 },
  poland: { lat: 51.9194, lng: 19.1451 },
  qatar: { lat: 25.3548, lng: 51.1839 },
  singapore: { lat: 1.3521, lng: 103.8198 },
  spain: { lat: 40.4637, lng: -3.7492 },
  sweden: { lat: 60.1282, lng: 18.6435 },
  switzerland: { lat: 46.8182, lng: 8.2275 },
  thailand: { lat: 15.87, lng: 100.9925 },
  turkey: { lat: 38.9637, lng: 35.2433 },
  uae: { lat: 23.4241, lng: 53.8478 },
  uk: { lat: 55.3781, lng: -3.436 },
  usa: { lat: 39.8283, lng: -98.5795 },
  'united arab emirates': { lat: 23.4241, lng: 53.8478 },
  'united kingdom': { lat: 55.3781, lng: -3.436 },
  'united states': { lat: 39.8283, lng: -98.5795 },
};

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'anaheim|usa': { lat: 33.8366, lng: -117.9143 },
  'arlington|usa': { lat: 38.8799, lng: -77.1068 },
  'atlanta|usa': { lat: 33.749, lng: -84.388 },
  'aurora|usa': { lat: 39.7294, lng: -104.8319 },
  'austin|usa': { lat: 30.2672, lng: -97.7431 },
  'barcelona|spain': { lat: 41.3874, lng: 2.1686 },
  'berlin|germany': { lat: 52.52, lng: 13.405 },
  'brussels|belgium': { lat: 50.8503, lng: 4.3517 },
  'cannes|france': { lat: 43.5528, lng: 7.0174 },
  'chicago|usa': { lat: 41.8781, lng: -87.6298 },
  'cologne|germany': { lat: 50.9375, lng: 6.9603 },
  'copenhagen|denmark': { lat: 55.6761, lng: 12.5683 },
  'dallas|usa': { lat: 32.7767, lng: -96.797 },
  'denver|usa': { lat: 39.7392, lng: -104.9903 },
  'dubai|uae': { lat: 25.2048, lng: 55.2708 },
  'farnborough|uk': { lat: 51.2758, lng: -0.7763 },
  'frankfurt|germany': { lat: 50.1109, lng: 8.6821 },
  'geneva|switzerland': { lat: 46.2044, lng: 6.1432 },
  'hamburg|germany': { lat: 53.5511, lng: 9.9937 },
  'hannover|germany': { lat: 52.3759, lng: 9.732 },
  'houston|usa': { lat: 29.7604, lng: -95.3698 },
  'las vegas|usa': { lat: 36.1699, lng: -115.1398 },
  'london|uk': { lat: 51.5072, lng: -0.1276 },
  'los angeles|usa': { lat: 34.0522, lng: -118.2437 },
  'madrid|spain': { lat: 40.4168, lng: -3.7038 },
  'melbourne|australia': { lat: -37.8136, lng: 144.9631 },
  'munich|germany': { lat: 48.1351, lng: 11.582 },
  'nashville|usa': { lat: 36.1627, lng: -86.7816 },
  'national harbor|usa': { lat: 38.7829, lng: -77.0163 },
  'new york|usa': { lat: 40.7128, lng: -74.006 },
  'novi|usa': { lat: 42.4806, lng: -83.4755 },
  'orlando|usa': { lat: 28.5383, lng: -81.3792 },
  'paris|france': { lat: 48.8566, lng: 2.3522 },
  'reno|usa': { lat: 39.5296, lng: -119.8138 },
  'san diego|usa': { lat: 32.7157, lng: -117.1611 },
  'san francisco|usa': { lat: 37.7749, lng: -122.4194 },
  'singapore|singapore': { lat: 1.3521, lng: 103.8198 },
  'sydney|australia': { lat: -33.8688, lng: 151.2093 },
  'tokyo|japan': { lat: 35.6762, lng: 139.6503 },
  'toronto|canada': { lat: 43.6532, lng: -79.3832 },
  'washington|usa': { lat: 38.9072, lng: -77.0369 },
  'whistler|canada': { lat: 50.1163, lng: -122.9574 },
};

const LEGACY_COORDS = new Map(
  (eventsData as TradeshowEvent[]).map((event) => [event.id.toUpperCase(), { lat: event.lat, lng: event.lng }]),
);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function nested(record: unknown, path: string[]): unknown {
  let current = record;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as UnknownRecord)[key];
  }
  return current;
}

function eventField(event: MasterEventRecord, field: string): unknown {
  const dashboardEdit = event.dashboardEdits?.[field];
  if (dashboardEdit && typeof dashboardEdit === 'object' && 'value' in dashboardEdit) {
    return (dashboardEdit as UnknownRecord).value;
  }

  const approved = event.approved?.[field];
  if (approved && typeof approved === 'object' && 'value' in approved) {
    return (approved as UnknownRecord).value;
  }

  return event.sharepoint?.[field];
}

function parseSharepointDate(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return value;

  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parseEventType(value: string): AttendanceType {
  return value.toLowerCase().includes('walking') ? 'Walking' : 'Exhibition';
}

function normalizeCountry(value: string): string {
  if (!value) return '';
  if (value.toLowerCase() === 'americas') return 'USA';
  if (value.toUpperCase() === 'US') return 'USA';
  return value;
}

function countryKey(country: string): string {
  const normalized = country.toLowerCase();
  if (normalized === 'us' || normalized === 'united states of america') return 'usa';
  if (normalized === 'united states') return 'united states';
  if (normalized === 'united arab emirates') return 'united arab emirates';
  if (normalized === 'uae') return 'uae';
  if (normalized === 'united kingdom' || normalized === 'great britain') return 'uk';
  return normalized;
}

function mapRegion(event: MasterEventRecord, country: string): Region {
  const source = `${text(event.sharepoint?.Region)} ${text(event.meta?.region)} ${text(event.meta?.subRegion)} ${country}`.toLowerCase();
  if (source.includes('apac') || source.includes('asia') || source.includes('australia')) return 'APAC';
  if (source.includes('emea') || source.includes('europe') || source.includes('middle east') || source.includes('africa')) return 'EMEA';
  return 'US';
}

function coordinatesFor(event: MasterEventRecord, code: string, city: string, country: string, region: Region): { lat: number; lng: number; hasPin: boolean } {
  const lat =
    number(nested(event.approved, ['dates', 'gpsLat'])) ??
    number(nested(event.research, ['dates', 'gpsLat'])) ??
    number(event.approved?.['dates.gpsLat']) ??
    number(event.research?.['dates.gpsLat']);
  const lng =
    number(nested(event.approved, ['dates', 'gpsLng'])) ??
    number(nested(event.research, ['dates', 'gpsLng'])) ??
    number(event.approved?.['dates.gpsLng']) ??
    number(event.research?.['dates.gpsLng']);

  if (lat !== null && lng !== null) return { lat, lng, hasPin: true };

  const legacyCoords = LEGACY_COORDS.get(code.toUpperCase());
  if (legacyCoords) return { ...legacyCoords, hasPin: true };

  const cKey = countryKey(country);
  const byCity = CITY_COORDS[`${city.toLowerCase()}|${cKey}`];
  if (city && byCity) return { ...byCity, hasPin: true };

  const fallback = COUNTRY_COORDS[cKey] ?? REGION_FALLBACK_COORDS[region];
  return { ...fallback, hasPin: false };
}

function descriptionFor(event: MasterEventRecord): string {
  const sharepoint = event.sharepoint ?? {};
  return (
    text(sharepoint['Main Event Subject']) ||
    text(nested(event.research, ['audience', 'targetAudience'])) ||
    text(sharepoint.Notes) ||
    'Safran tradeshow event'
  );
}

function normalizeEvent(event: MasterEventRecord): TradeshowEvent | null {
  const code = text(event.code) || text(eventField(event, 'Event Code'));
  const name = text(eventField(event, 'Title')).replace(/^NEW:\s*/i, '') || code;
  const startDate = parseSharepointDate(text(eventField(event, 'Start Date')));
  const endDate = parseSharepointDate(text(eventField(event, 'End Date'))) || startDate;

  if (!code || !name) return null;

  const city = text(eventField(event, 'Event Location: City'));
  const stateProvince = text(eventField(event, 'Event Location: State'));
  const country = normalizeCountry(text(eventField(event, 'Event Location: Country/Region')) || text(eventField(event, 'Region')));
  const region = mapRegion(event, country);
  const coords = coordinatesFor(event, code, city, country, region);

  return {
    id: `${code}-${startDate || 'date-tbc'}`,
    name,
    region,
    city,
    stateProvince,
    country,
    lat: coords.lat,
    lng: coords.lng,
    hasPin: coords.hasPin,
    startDate,
    endDate,
    description: descriptionFor(event),
    attendanceType: parseEventType(text(eventField(event, 'Event Type'))),
    eventUrl: text(eventField(event, 'Event Website')) || undefined,
  };
}

export async function fetchMasterEvents(signal?: AbortSignal): Promise<TradeshowEvent[]> {
  const response = await fetch('/api/master-events', {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Master events request failed (${response.status})`);
  }

  const data = (await response.json()) as MasterEventsResponse;
  if (!Array.isArray(data.events)) {
    throw new Error('Master events response did not include an events array');
  }

  return data.events
    .map(normalizeEvent)
    .filter((event): event is TradeshowEvent => event !== null)
    .sort((a, b) => {
      const dateCompare = (a.startDate || '9999-12-31').localeCompare(b.startDate || '9999-12-31');
      if (dateCompare !== 0) return dateCompare;
      return a.name.localeCompare(b.name);
    });
}
