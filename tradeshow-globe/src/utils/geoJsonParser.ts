import type { Region } from '../types.ts';
import { latLngToVector3 } from './coordinates.ts';

interface GeoFeature {
  properties: { CONTINENT: string };
  geometry: {
    type: string;
    coordinates: number[][][][] | number[][][];
  };
}

interface GeoJSON {
  features: GeoFeature[];
}

export interface ParsedCoastlines {
  /** Flat array of [x,y,z, x,y,z, ...] for line segment pairs */
  positions: Float32Array;
  /** Per-vertex region tag for coloring */
  regions: Region[];
}

function continentToRegion(continent: string): Region {
  switch (continent) {
    case 'North America':
    case 'South America':
    case 'Central America':
      return 'US';
    case 'Europe':
    case 'Africa':
      return 'EMEA';
    case 'Asia':
    case 'Oceania':
    case 'Australia and New Zealand':
      return 'APAC';
    default:
      return 'EMEA';
  }
}

/**
 * Detect if a polygon ring is in the Americas (French Guiana override).
 * France is tagged CONTINENT:"Europe" but its MultiPolygon includes
 * French Guiana (lon ~-54, lat ~4). We reassign such polygons to US.
 */
function polygonIsInAmericas(ring: number[][]): boolean {
  if (ring.length < 3) return false;
  let sumLng = 0, sumLat = 0;
  const n = Math.min(ring.length, ring.length - 1);
  for (let i = 0; i < n; i++) {
    sumLng += ring[i][0];
    sumLat += ring[i][1];
  }
  const avgLng = sumLng / n;
  const avgLat = sumLat / n;
  // Americas: roughly lng -170 to -30
  return avgLng < -30 && avgLng > -170 && avgLat > -60 && avgLat < 80;
}

/**
 * Determine the region for a specific polygon within a feature.
 * Handles the French Guiana case: a European feature with a polygon in the Americas.
 */
function getPolygonRegion(continent: string, outerRing: number[][]): Region {
  const baseRegion = continentToRegion(continent);
  // Override: European feature with polygon in the Americas → US
  if (baseRegion === 'EMEA' && polygonIsInAmericas(outerRing)) {
    return 'US';
  }
  return baseRegion;
}

// ---------------------------------------------------------------------------
// Edge deduplication for coast/region-border extraction.
// ---------------------------------------------------------------------------

/**
 * Maximum longitude jump (degrees) between adjacent raw GeoJSON ring points
 * before we treat the edge as an antimeridian-crossing artifact and skip it.
 * Legitimate ne_110m segments are ≤ ~15°; seam crossings jump ~340°.
 */
const SEAM_LON_JUMP = 180;

/**
 * Round a coordinate to 4 d.p. (~11 m at equator) to absorb floating-point
 * noise between nominally-coincident NE-110m border vertices.
 */
const EDGE_ROUND = 10000;
function rnd(v: number): number {
  return Math.round(v * EDGE_ROUND) / EDGE_ROUND;
}

/**
 * Canonical undirected-edge key: smaller rounded endpoint first,
 * so A→B and B→A hash to the same string.
 */
function canonicalEdgeKey(p1: number[], p2: number[]): string {
  const x1 = rnd(p1[0]), y1 = rnd(p1[1]);
  const x2 = rnd(p2[0]), y2 = rnd(p2[1]);
  return x1 < x2 || (x1 === x2 && y1 <= y2)
    ? `${x1},${y1}|${x2},${y2}`
    : `${x2},${y2}|${x1},${y1}`;
}

/**
 * Two-pass edge classifier:
 *   count === 1                      → coastline   (emit)
 *   count >= 2, regions.size >= 2   → region border (emit)
 *   count >= 2, regions.size === 1  → internal country border (suppress)
 *
 * Only outer rings (polygon[0]) are processed — holes are inland water /
 * enclaves and do not contribute to country-level borders.
 */
export function parseGeoJson(geojson: GeoJSON, radius: number): ParsedCoastlines {
  interface EdgeRec {
    raw1: number[];    // canonical-first raw [lng, lat]
    raw2: number[];    // canonical-second raw [lng, lat]
    regions: Set<Region>;
    count: number;
  }
  const edgeMap = new Map<string, EdgeRec>();

  // --- Pass 1: catalogue every outer-ring edge ------------------------------
  for (const feature of geojson.features) {
    const { type, coordinates } = feature.geometry;
    const polygons: number[][][][] =
      type === 'MultiPolygon'
        ? (coordinates as number[][][][])
        : [coordinates as number[][][]];

    for (const polygon of polygons) {
      const outer  = polygon[0];
      const region = getPolygonRegion(feature.properties.CONTINENT, outer);

      for (let i = 0; i < outer.length - 1; i++) {
        const p1 = outer[i];
        const p2 = outer[i + 1];
        const key  = canonicalEdgeKey(p1, p2);
        const x1 = rnd(p1[0]), y1 = rnd(p1[1]);
        const x2 = rnd(p2[0]), y2 = rnd(p2[1]);
        const inOrder = x1 < x2 || (x1 === x2 && y1 <= y2);

        if (edgeMap.has(key)) {
          const rec = edgeMap.get(key)!;
          rec.regions.add(region);
          rec.count++;
        } else {
          edgeMap.set(key, {
            raw1: inOrder ? p1 : p2,
            raw2: inOrder ? p2 : p1,
            regions: new Set([region]),
            count: 1,
          });
        }
      }
    }
  }

  // --- Pass 2: emit coastlines and region borders only ---------------------
  const allPositions: number[] = [];
  const allRegions:   Region[] = [];
  let seamSegmentsSkipped = 0;

  for (const { raw1, raw2, regions, count } of edgeMap.values()) {
    const isCoastline    = count === 1;
    const isRegionBorder = count >= 2 && regions.size >= 2;
    if (!isCoastline && !isRegionBorder) continue;

    // Skip antimeridian-crossing segments: adjacent ring points that jump more
    // than SEAM_LON_JUMP degrees in raw longitude are seam artifacts that would
    // project as lines spanning most of the globe.
    if (Math.abs(raw2[0] - raw1[0]) > SEAM_LON_JUMP) {
      seamSegmentsSkipped++;
      continue;
    }

    const emitRegion = Array.from(regions)[0];
    const a = latLngToVector3(raw1[1], raw1[0], radius);
    const b = latLngToVector3(raw2[1], raw2[0], radius);
    allPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    allRegions.push(emitRegion, emitRegion);
  }

  if (seamSegmentsSkipped > 0) {
    console.debug(`[parseGeoJson] skipped ${seamSegmentsSkipped} seam-crossing outline segments (lon jump > ${SEAM_LON_JUMP}°)`);
  }

  return {
    positions: new Float32Array(allPositions),
    regions: allRegions,
  };
}
