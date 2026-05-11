import earcut from 'earcut';
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

/** Earcut base fill, pre-merged by region — one position buffer per region. */
export type ParsedRegionFills = Record<Region, Float32Array>;

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

  for (const { raw1, raw2, regions, count } of edgeMap.values()) {
    const isCoastline    = count === 1;
    const isRegionBorder = count >= 2 && regions.size >= 2;
    if (!isCoastline && !isRegionBorder) continue;

    const emitRegion = Array.from(regions)[0];
    const a = latLngToVector3(raw1[1], raw1[0], radius);
    const b = latLngToVector3(raw2[1], raw2[0], radius);
    allPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    allRegions.push(emitRegion, emitRegion);
  }

  return {
    positions: new Float32Array(allPositions),
    regions: allRegions,
  };
}

// ---------------------------------------------------------------------------
// Normalize a ring into continuous longitude space so earcut never sees a
// jump > 180° between consecutive vertices (fixes antimeridian holes).
// ---------------------------------------------------------------------------
function normalizeRing(ring: number[][]): number[][] {
  let prevLng = ring[0][0];
  return ring.map(([lng, lat]) => {
    let adjusted = lng;
    while (adjusted - prevLng > 180) adjusted -= 360;
    while (adjusted - prevLng < -180) adjusted += 360;
    prevLng = adjusted;
    return [adjusted, lat];
  });
}

// ---------------------------------------------------------------------------
// Polygon repair: remove near-duplicate and collinear points that can
// cause earcut to produce degenerate (zero-area) triangles.
// ---------------------------------------------------------------------------
const EPS = 1e-9;
function repairRing(ring: number[][]): number[][] {
  if (ring.length < 4) return ring;
  const cleaned: number[][] = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const cur = ring[i];
    // Skip near-duplicates
    if (Math.abs(cur[0] - prev[0]) < EPS && Math.abs(cur[1] - prev[1]) < EPS) continue;
    // Skip collinear middle points
    if (cleaned.length >= 2) {
      const pp = cleaned[cleaned.length - 2];
      const cross =
        (prev[0] - pp[0]) * (cur[1] - pp[1]) -
        (prev[1] - pp[1]) * (cur[0] - pp[0]);
      if (Math.abs(cross) < EPS) {
        cleaned[cleaned.length - 1] = cur; // replace middle with current
        continue;
      }
    }
    cleaned.push(cur);
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Triangle quality checks — discard degenerate and sliver triangles.
// ---------------------------------------------------------------------------
const MIN_TRI_AREA = 1e-6; // minimum triangle area in degrees² (shoelace)

function triArea2D(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  return Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2;
}

// ---------------------------------------------------------------------------
// Attempt earcut on a repaired/normalized ring set.
// Returns FILTERED index array — degenerate/sliver triangles are removed.
// ---------------------------------------------------------------------------
function tryEarcut(
  outer: number[][],
  holes: number[][][],
): { indices: number[]; coords: number[] } {
  const coords: number[] = [];
  for (const pt of outer) coords.push(pt[0], pt[1]);

  const holeIndices: number[] = [];
  for (const hole of holes) {
    holeIndices.push(coords.length / 2);
    for (const pt of hole) coords.push(pt[0], pt[1]);
  }

  const rawIndices = earcut(coords, holeIndices.length > 0 ? holeIndices : undefined, 2);

  // Validate: need at least 1 triangle (3 indices), all within bounds
  if (rawIndices.length < 3) return { indices: [], coords };
  const maxIdx = coords.length / 2;

  // Per-triangle filtering: keep only well-formed triangles
  const indices: number[] = [];
  for (let t = 0; t < rawIndices.length; t += 3) {
    const i0 = rawIndices[t], i1 = rawIndices[t + 1], i2 = rawIndices[t + 2];

    // Bounds check
    if (i0 < 0 || i0 >= maxIdx || i1 < 0 || i1 >= maxIdx || i2 < 0 || i2 >= maxIdx) continue;

    const x0 = coords[i0 * 2], y0 = coords[i0 * 2 + 1];
    const x1 = coords[i1 * 2], y1 = coords[i1 * 2 + 1];
    const x2 = coords[i2 * 2], y2 = coords[i2 * 2 + 1];

    // Discard degenerate / sliver triangles (near-zero area in lat/lng space)
    if (triArea2D(x0, y0, x1, y1, x2, y2) < MIN_TRI_AREA) continue;

    indices.push(i0, i1, i2);
  }

  return { indices, coords };
}

// ---------------------------------------------------------------------------
// Base fill: earcut-triangulated land, merged by region before output.
// Polygons are grouped into US / EMEA / APAC buckets first; each bucket
// accumulates triangle positions independently so the caller receives one
// flat Float32Array per region — no per-vertex region bookkeeping needed.
// ---------------------------------------------------------------------------
export function parseBaseFill(geojson: GeoJSON, radius: number): ParsedRegionFills {
  const buckets: Record<Region, number[]> = { US: [], EMEA: [], APAC: [] };
  let skippedPolygons = 0;

  for (const feature of geojson.features) {
    const { type, coordinates } = feature.geometry;
    const polygons: number[][][][] =
      type === 'MultiPolygon'
        ? (coordinates as number[][][][])
        : [coordinates as number[][][]];

    for (const polygon of polygons) {
      const rawOuter = polygon[0];
      if (rawOuter.length < 4) continue;

      const region = getPolygonRegion(feature.properties.CONTINENT, rawOuter);
      const pos = buckets[region];

      // Normalize into continuous longitude space before earcut (fixes antimeridian holes)
      const outer = normalizeRing(repairRing(rawOuter));
      const holes = polygon.slice(1).map(h => normalizeRing(repairRing(h)));
      if (outer.length < 4) continue;

      const { indices, coords } = tryEarcut(outer, holes);
      if (indices.length > 0) {
        for (const idx of indices) {
          const v = latLngToVector3(coords[idx * 2 + 1], coords[idx * 2], radius);
          pos.push(v.x, v.y, v.z);
        }
      } else {
        skippedPolygons++;
      }
    }
  }

  if (skippedPolygons > 0) console.log(`[BaseFill] Skipped (earcut fail): ${skippedPolygons}`);

  return {
    US:   new Float32Array(buckets.US),
    EMEA: new Float32Array(buckets.EMEA),
    APAC: new Float32Array(buckets.APAC),
  };
}
