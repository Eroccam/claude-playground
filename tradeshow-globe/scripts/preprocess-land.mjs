/**
 * preprocess-land.mjs
 *
 * Generates src/data/land-triangles.json from country GeoJSON.
 * This version normalizes and validates rings before triangulation, keeps holes,
 * and guarantees outward-facing triangle winding after sphere projection.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import earcut from 'earcut';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Switch to ne_110m_land: no internal country borders → no stacked wireframe edges,
// no floating-point crack slivers at country borders in fill mode.
const GEOJSON_PATH = resolve(__dirname, '../src/data/ne_110m_land.json');
const OUTPUT_PATH = resolve(__dirname, '../public/land/land-triangles.json');

const RADIUS = 1.005;
const MIN_TRI_AREA = 1e-8;
const POINT_EPS = 1e-7;
// Antarctica detection: skip any polygon whose outer-ring centroid latitude < this.
const ANTARCTICA_LAT = -60;

// Boundary epsilon snap: triangles whose 2-D centroid falls within this many degrees
// of a region boundary (-25° or 65° lon) are assigned by centroid with a west-side
// snap, bypassing majority vote. Eliminates ~0.15% wedge artifacts at region edges.
const BOUNDARY_SNAP_DEG = 2.0;

// Boundary densification: insert intermediate lat/lon points along ring edges so no
// flat-space edge exceeds this length (degrees). Reduces earcut diagonal length.
// Reduce to 2.0 for a finer mesh; increase to 6.0 if preprocessing is slow.
const DENSIFY_MAX_DEG = 4.0;

// 2-D grid cell splitting: slice each polygon into LON×LAT degree cells before
// triangulation. Max earcut diagonal within a cell ≈ sqrt(LON²+LAT²) in flat space,
// preventing continent-spanning triangles in both directions.
// 10°×10° cells → max diagonal ≈ 14° ≈ chord 0.25 → subdivides to ≤0.1 in 2 levels.
// Reduce to 5 for finer mesh; increase to 15 if preprocessing is slow.
const BAND_STEP_LON = 10;
const BAND_STEP_LAT = 10;

// No chord-based seam discard: ne_110m_land normalizeRing prevents antimeridian jumps.
// The Eurasian+Africa supercontinent produces legitimate earcut triangles with chords
// up to ~1.7 (spanning 50-150° of arc). A 0.75 threshold incorrectly drops these,
// creating huge holes. pushSubdivided handles any chord size safely.
const DEBUG_TRIANGULATION = process.env.NODE_ENV !== 'production';

function latLngToVector3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return {
    x: -(radius * Math.sin(phi) * Math.cos(theta)),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

/**
 * Assign a region to an earcut triangle based on its 2-D lon/lat centroid.
 * Called per-triangle so the Eurasia+Africa supercontinent polygon (a single
 * ring in ne_110m_land) is correctly split between EMEA and APAC.
 *
 * Longitude thresholds (tunable):
 *   < -25°          → US   (Americas — including Greenland, Caribbean)
 *   [-25°,  65°)    → EMEA (Europe, Africa, Middle East, W Russia)
 *   ≥  65°          → APAC (Asia, Pacific, Australia, E Russia / Siberia)
 *
 * Lon may be "unwrapped" beyond ±180 after normalizeRing; the thresholds
 * work correctly because unwrapping is monotone (e.g. 190 → Kamchatka → APAC ✓).
 * Returns null for triangles with centroid lat < ANTARCTICA_LAT (skipped).
 */
/**
 * Normalize an unwrapped lon (e.g. 190° from normalizeRing) back to (-180, 180].
 * Uses the formula from the task spec: ((lon + 180) % 360 + 360) % 360 - 180.
 * Note: in JS, % can return negative values, so the +360 guard is essential.
 */
function normalizeLon(lon) {
  return ((lon % 360) + 540) % 360 - 180;
}

function centroidToRegion(lon, lat) {
  if (lat < ANTARCTICA_LAT) return null;
  // Normalize unwrapped lon → (-180, 180] before applying geographic thresholds.
  // This makes classification deterministic regardless of ring traversal direction.
  const nLon = normalizeLon(lon);
  if (nLon < -25) return 'US';
  if (nLon < 65)  return 'EMEA';
  return 'APAC';
}

/**
 * Return true if a normalized longitude is within BOUNDARY_SNAP_DEG of a
 * region boundary (-25° or 65°). Triangles in this band are assigned by
 * centroid + west-side snap rather than majority vote.
 */
function nearBoundary(nLon) {
  return (
    Math.abs(nLon - (-25)) <= BOUNDARY_SNAP_DEG ||
    Math.abs(nLon - 65)    <= BOUNDARY_SNAP_DEG
  );
}

function samePoint(a, b, eps = POINT_EPS) {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
}

function normalizeRing(ring) {
  if (!ring.length) return [];
  let prevLng = ring[0][0];
  return ring.map(([lng, lat]) => {
    let adj = lng;
    while (adj - prevLng > 180) adj -= 360;
    while (adj - prevLng < -180) adj += 360;
    prevLng = adj;
    return [adj, lat];
  });
}

/**
 * Insert intermediate points along ring edges so no flat lon/lat edge exceeds
 * DENSIFY_MAX_DEG. Applied after sanitizeRing+enforceWinding, before earcut.
 * Prevents earcut from creating long diagonal triangles across large concave
 * polygons (e.g. Eurasian supercontinent). Points are linearly interpolated in
 * lon/lat space — accurate enough at 4° step vs ~5° sphere curvature.
 */
function densifyRing(ring) {
  if (ring.length < 2) return ring;
  const result = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const p0 = ring[i];
    const p1 = ring[i + 1];
    result.push(p0);
    const dLon = p1[0] - p0[0];
    const dLat = p1[1] - p0[1];
    const dist = Math.sqrt(dLon * dLon + dLat * dLat);
    if (dist > DENSIFY_MAX_DEG) {
      const n = Math.ceil(dist / DENSIFY_MAX_DEG);
      for (let s = 1; s < n; s++) {
        const t = s / n;
        result.push([p0[0] + t * dLon, p0[1] + t * dLat]);
        densifiedPoints++;
      }
    }
  }
  result.push(ring[ring.length - 1]);
  return result;
}

/**
 * Clip a closed ring to the half-plane lon <= threshold (keepLeft=true)
 * or lon >= threshold (keepLeft=false) using Sutherland-Hodgman.
 * Returns a new closed ring, or null if the result is degenerate (< 3 vertices).
 */
function clipRingByLon(ring, threshold, keepLeft) {
  const inside = keepLeft ? (p) => p[0] <= threshold : (p) => p[0] >= threshold;
  const n = ring.length - 1; // closed ring: ring[n] === ring[0], process n edges
  if (n < 3) return null;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[i + 1];
    const pIn = inside(p);
    const qIn = inside(q);
    if (pIn) out.push(p);
    if (pIn !== qIn && Math.abs(q[0] - p[0]) > 1e-12) {
      const t = (threshold - p[0]) / (q[0] - p[0]);
      out.push([threshold, p[1] + t * (q[1] - p[1])]);
    }
  }
  if (out.length < 3) return null;
  return [...out, out[0]]; // close the ring
}

/**
 * Clip a closed ring to lat <= threshold (keepBelow=true) or lat >= threshold.
 * Mirrors clipRingByLon but operates on the latitude (index 1) coordinate.
 */
function clipRingByLat(ring, threshold, keepBelow) {
  const inside = keepBelow ? (p) => p[1] <= threshold : (p) => p[1] >= threshold;
  const n = ring.length - 1;
  if (n < 3) return null;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[i + 1];
    const pIn = inside(p);
    const qIn = inside(q);
    if (pIn) out.push(p);
    if (pIn !== qIn && Math.abs(q[1] - p[1]) > 1e-12) {
      const t = (threshold - p[1]) / (q[1] - p[1]);
      out.push([p[0] + t * (q[0] - p[0]), threshold]);
    }
  }
  if (out.length < 3) return null;
  return [...out, out[0]];
}

/**
 * Split a closed ring into BAND_STEP_LON × BAND_STEP_LAT degree grid cells.
 * Phase 1: clip by longitude bands. Phase 2: clip each band by latitude bands.
 * Earcut diagonals within any cell are bounded by sqrt(LON²+LAT²) in flat space,
 * preventing long diagonal triangles in both horizontal and vertical directions.
 * Returns [ring] unchanged if the polygon fits within one cell.
 */
function splitRingIntoCells(ring) {
  const { minLon, maxLon, minLat, maxLat } = ringBBox(ring);

  // Phase 1: longitude bands
  const lonBands = [];
  if (maxLon - minLon <= BAND_STEP_LON) {
    lonBands.push(ring);
  } else {
    const startLon = Math.floor(minLon / BAND_STEP_LON) * BAND_STEP_LON;
    for (let lo = startLon; lo < maxLon; lo += BAND_STEP_LON) {
      const leftClip = clipRingByLon(ring, lo + BAND_STEP_LON, true);
      if (!leftClip) continue;
      const band = clipRingByLon(leftClip, lo, false);
      if (band && band.length >= 4) lonBands.push(band);
    }
    if (lonBands.length === 0) lonBands.push(ring); // clipping failed: fallback
  }

  // Phase 2: latitude bands within each longitude band
  const cells = [];
  for (const lonBand of lonBands) {
    const { minLat: bMin, maxLat: bMax } = ringBBox(lonBand);
    if (bMax - bMin <= BAND_STEP_LAT) {
      cells.push(lonBand);
      continue;
    }
    const preCellCount = cells.length; // per-lonBand baseline for fallback check
    const startLat = Math.floor(bMin / BAND_STEP_LAT) * BAND_STEP_LAT;
    for (let lo = startLat; lo < bMax; lo += BAND_STEP_LAT) {
      const bottomClip = clipRingByLat(lonBand, lo + BAND_STEP_LAT, true);
      if (!bottomClip) continue;
      const cell = clipRingByLat(bottomClip, lo, false);
      if (cell && cell.length >= 4) cells.push(cell);
    }
    // BUG-FIX: compare against preCellCount (not 0) — each lonBand needs its own fallback
    if (cells.length === preCellCount) cells.push(lonBand);
  }

  return cells.length > 0 ? cells : [ring];
}

function closeRing(ring) {
  if (!ring.length) return [];
  if (samePoint(ring[0], ring[ring.length - 1])) return ring.slice();
  return [...ring, ring[0]];
}

function removeNearDuplicates(ring, eps = POINT_EPS) {
  if (!ring.length) return [];
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    if (!samePoint(ring[i], out[out.length - 1], eps)) out.push(ring[i]);
  }
  if (out.length > 1 && samePoint(out[0], out[out.length - 1], eps)) out.pop();
  return out;
}

function isCollinear(a, b, c, eps = POINT_EPS) {
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(cross) <= eps;
}

function removeCollinear(ring) {
  if (ring.length < 3) return ring.slice();
  const out = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n];
    const curr = ring[i];
    const next = ring[(i + 1) % n];
    if (!isCollinear(prev, curr, next)) out.push(curr);
  }
  return out;
}

function ringBBox(ringClosed) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of ringClosed) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

function maxAbsLonJump(ring) {
  if (ring.length < 2) return 0;
  let maxJump = 0;
  for (let i = 1; i < ring.length; i++) {
    const jump = Math.abs(ring[i][0] - ring[i - 1][0]);
    if (jump > maxJump) maxJump = jump;
  }
  return maxJump;
}

function orient2D(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, c, eps = POINT_EPS) {
  return b[0] >= Math.min(a[0], c[0]) - eps
    && b[0] <= Math.max(a[0], c[0]) + eps
    && b[1] >= Math.min(a[1], c[1]) - eps
    && b[1] <= Math.max(a[1], c[1]) + eps;
}

function segmentsIntersect(a, b, c, d) {
  const eps = POINT_EPS;
  const o1 = orient2D(a, b, c);
  const o2 = orient2D(a, b, d);
  const o3 = orient2D(c, d, a);
  const o4 = orient2D(c, d, b);

  if (((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps))
    && ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))) {
    return true;
  }

  if (Math.abs(o1) <= eps && onSegment(a, c, b)) return true;
  if (Math.abs(o2) <= eps && onSegment(a, d, b)) return true;
  if (Math.abs(o3) <= eps && onSegment(c, a, d)) return true;
  if (Math.abs(o4) <= eps && onSegment(c, b, d)) return true;
  return false;
}

function hasSelfIntersection(ringClosed) {
  const n = ringClosed.length - 1;
  for (let i = 0; i < n; i++) {
    const a = ringClosed[i];
    const b = ringClosed[i + 1];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1) continue;
      if (i === 0 && j === n - 1) continue;
      const c = ringClosed[j];
      const d = ringClosed[j + 1];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function rotateOpenRing(openRing, start) {
  if (!openRing.length) return [];
  if (start <= 0 || start >= openRing.length) return openRing.slice();
  return [...openRing.slice(start), ...openRing.slice(0, start)];
}

function ringSignedArea(ringClosed) {
  let area = 0;
  for (let i = 0; i < ringClosed.length - 1; i++) {
    const [x1, y1] = ringClosed[i];
    const [x2, y2] = ringClosed[i + 1];
    area += (x1 * y2) - (x2 * y1);
  }
  return area / 2;
}

function ringDebugSummary(ring) {
  const closed = closeRing(ring);
  const bbox = ringBBox(closed);
  const area = ringSignedArea(closed);
  return {
    points: closed.length,
    signedArea: area,
    bbox,
  };
}

function enforceWinding(ringClosed, clockwise) {
  const area = ringSignedArea(ringClosed);
  const isClockwise = area < 0;
  if (isClockwise === clockwise) return ringClosed;
  const noClose = ringClosed.slice(0, -1).reverse();
  return [...noClose, noClose[0]];
}

function pointInRing(point, ringClosed) {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = ringClosed.length - 1; i < ringClosed.length; j = i++) {
    const xi = ringClosed[i][0];
    const yi = ringClosed[i][1];
    const xj = ringClosed[j][0];
    const yj = ringClosed[j][1];

    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function sanitizeRing(rawRing) {
  const evaluateRaw = (rawOpen) => {
    const candidates = new Set([0]);
    const n = rawOpen.length;
    if (n > 3) {
      candidates.add(Math.floor(n / 4));
      candidates.add(Math.floor(n / 2));
      candidates.add(Math.floor((3 * n) / 4));
    }

    let bestLocal = null;
    const evaluateStart = (start) => {
      const rotated = rotateOpenRing(rawOpen, start);
      const unwrapped = normalizeRing(rotated);
      const deduped = removeNearDuplicates(unwrapped);
      const simplified = removeCollinear(deduped);
      const closed = closeRing(simplified);
      if (closed.length < 4) return;

      const selfIntersect = hasSelfIntersection(closed);
      const bbox = ringBBox(closed);
      const span = (bbox.maxLon - bbox.minLon) + (bbox.maxLat - bbox.minLat);
      const score = (selfIntersect ? 1_000_000 : 0) + span;

      if (!bestLocal || score < bestLocal.score) {
        bestLocal = { ring: closed, score, selfIntersect };
      }
    };

    for (const start of candidates) {
      evaluateStart(start);
    }

    if (bestLocal && bestLocal.selfIntersect) {
      for (let start = 0; start < rawOpen.length; start++) {
        evaluateStart(start);
        if (bestLocal && !bestLocal.selfIntersect) break;
      }
    }

    return bestLocal;
  };

  const rawDeduped = removeNearDuplicates(rawRing);
  if (rawDeduped.length < 3) return null;

  let best = evaluateRaw(rawDeduped);
  if (best && !best.selfIntersect) return best.ring;

  // Seam-fix fallback: trim up to 2 points from start/end to remove tiny
  // crossing artifacts around the ring closure seam.
  let bestTrimmed = null;
  for (let trimStart = 0; trimStart <= 2; trimStart++) {
    for (let trimEnd = 0; trimEnd <= 2; trimEnd++) {
      if (trimStart === 0 && trimEnd === 0) continue;
      const end = rawDeduped.length - trimEnd;
      if (end - trimStart < 3) continue;
      const trimmed = rawDeduped.slice(trimStart, end);
      const candidate = evaluateRaw(trimmed);
      if (!candidate) continue;
      if (!bestTrimmed || candidate.score < bestTrimmed.score) {
        bestTrimmed = candidate;
      }
      if (bestTrimmed && !bestTrimmed.selfIntersect) {
        return bestTrimmed.ring;
      }
    }
  }

  best = bestTrimmed || best || evaluateRaw(rawDeduped);
  return best ? best.ring : null;
}

function triArea2D(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
}

function isOutward(v0, v1, v2) {
  const abx = v1.x - v0.x;
  const aby = v1.y - v0.y;
  const abz = v1.z - v0.z;
  const acx = v2.x - v0.x;
  const acy = v2.y - v0.y;
  const acz = v2.z - v0.z;
  const nx = (aby * acz) - (abz * acy);
  const ny = (abz * acx) - (abx * acz);
  const nz = (abx * acy) - (aby * acx);
  const mx = (v0.x + v1.x + v2.x) / 3;
  const my = (v0.y + v1.y + v2.y) / 3;
  const mz = (v0.z + v1.z + v2.z) / 3;
  return (nx * mx) + (ny * my) + (nz * mz) >= 0;
}

function flattenPolygon(outer, holes) {
  const vertices = [];
  const holeIndices = [];

  const pushRing = (ring) => {
    const start = vertices.length / 2;
    for (let i = 0; i < ring.length - 1; i++) {
      vertices.push(ring[i][0], ring[i][1]);
    }
    return start;
  };

  pushRing(outer);
  for (const hole of holes) {
    holeIndices.push(pushRing(hole));
  }

  return { vertices, holeIndices };
}

const geojson = JSON.parse(readFileSync(GEOJSON_PATH, 'utf8'));
const buckets = { US: [], EMEA: [], APAC: [] };

let totalPolygons = 0;
let emittedTriangles = 0;
let skippedPolygons = 0;
let rejectedRings = 0;
let inwardFixed = 0;
let warnedDatelineJump = false;
let warnedImpossibleHoleBBox = false;
let warnedUncontainedHole = false;
// Per-triangle drop counters (all drops are now counted — no silent discards)
let earcutRaw = 0;
let droppedIdxBounds = 0;
let droppedDegenerate2D = 0;
let droppedAntarctica = 0;
let droppedNonFinite = 0;
let droppedDegenerate3D = 0;
// Densification + quality diagnostics
let densifiedPoints = 0;
let topPreSubdivEdges = []; // top-20 max-chord per earcut triangle, pre-subdivision
// Per-bucket centroid lon tracking for verification (normalized lon range per region)
const bucketLonRange = { US: [Infinity, -Infinity], EMEA: [Infinity, -Infinity], APAC: [Infinity, -Infinity] };
let unknownRegion = 0;
let mixedVoteCount = 0;
let centroidTieBreakCount = 0;
const boundarySamples = [];
const wedgeSamples = [];
const WEDGE_SAMPLE_MAX = 30;

// Spherical subdivision: flat earcut triangles sag below the sphere surface for large arcs,
// causing the ocean sphere (radius ~1.0) to occlude them via depth test → phantom holes.
// Fix: split any edge whose chord exceeds MAX_EDGE_CHORD, projecting the midpoint back to
// the sphere surface. Chord 0.1 ≈ 5.7° arc; at RADIUS=1.005 the sag is ~0.00125
// (effective min radius ≈ 1.0038, safely above ocean at 1.0). Worst-case recursion: ~4 levels.
const MAX_EDGE_CHORD_SQ = 0.01; // 0.1² — chord in 3-D Euclidean space

function chordSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return (dx * dx) + (dy * dy) + (dz * dz);
}

function sphereMidpoint(a, b) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const mz = (a.z + b.z) / 2;
  const len = Math.sqrt((mx * mx) + (my * my) + (mz * mz));
  return { x: (mx / len) * RADIUS, y: (my / len) * RADIUS, z: (mz / len) * RADIUS };
}

function vector3ToLonLat(v) {
  const r = Math.sqrt((v.x * v.x) + (v.y * v.y) + (v.z * v.z));
  if (!Number.isFinite(r) || r <= 1e-12) return null;
  const lat = Math.asin(Math.max(-1, Math.min(1, v.y / r))) * (180 / Math.PI);
  const lon = normalizeLon(Math.atan2(-v.z, v.x) * (180 / Math.PI));
  return [lon, lat];
}

function classifyTriangleRegion(a, b, c) {
  const ll0 = vector3ToLonLat(a);
  const ll1 = vector3ToLonLat(b);
  const ll2 = vector3ToLonLat(c);
  if (!ll0 || !ll1 || !ll2) return null;

  const vr0 = centroidToRegion(ll0[0], ll0[1]);
  const vr1 = centroidToRegion(ll1[0], ll1[1]);
  const vr2 = centroidToRegion(ll2[0], ll2[1]);
  const vote = { US: 0, EMEA: 0, APAC: 0 };
  if (vr0) vote[vr0]++;
  if (vr1) vote[vr1]++;
  if (vr2) vote[vr2]++;

  const cx = a.x + b.x + c.x;
  const cy = a.y + b.y + c.y;
  const cz = a.z + b.z + c.z;
  const cLen = Math.sqrt((cx * cx) + (cy * cy) + (cz * cz));
  if (!Number.isFinite(cLen) || cLen <= 1e-12) return null;
  const cnx = cx / cLen;
  const cny = cy / cLen;
  const cnz = cz / cLen;
  const sphLat = Math.asin(Math.max(-1, Math.min(1, cny))) * (180 / Math.PI);
  const sphLon = normalizeLon(Math.atan2(-cnz, cnx) * (180 / Math.PI));
  const centroidRegion = centroidToRegion(sphLon, sphLat);

  const maxVotes = Math.max(vote.US, vote.EMEA, vote.APAC);
  const winners = ['US', 'EMEA', 'APAC'].filter((k) => vote[k] === maxVotes && maxVotes > 0);
  const tie = winners.length !== 1;
  const boundary = nearBoundary(sphLon);
  const voteWinner = tie ? null : winners[0];
  const region = centroidRegion;

  if (!region) return null;
  return {
    region,
    sphLon,
    sphLat,
    vote: `${vr0 ?? 'N'}/${vr1 ?? 'N'}/${vr2 ?? 'N'}`,
    v0: ll0,
    v1: ll1,
    v2: ll2,
    voteWinner,
    usedTieBreak: tie || boundary || (voteWinner !== null && voteWinner !== region),
    tie,
    boundary,
    reason: tie ? 'tie->centroid' : (boundary ? 'boundary->centroid' : (voteWinner === region ? 'centroid' : 'vote!=centroid')),
  };
}

function pushSubdivided(a, b, c, sourceCell) {
  const ab = chordSq(a, b);
  const bc = chordSq(b, c);
  const ac = chordSq(a, c);
  if (ab <= MAX_EDGE_CHORD_SQ && bc <= MAX_EDGE_CHORD_SQ && ac <= MAX_EDGE_CHORD_SQ) {
    const cls = classifyTriangleRegion(a, b, c);
    if (!cls) { droppedAntarctica++; return; }
    if (cls.tie || (cls.voteWinner !== null && cls.voteWinner !== cls.region)) mixedVoteCount++;
    if (cls.usedTieBreak) centroidTieBreakCount++;

    const bucket = buckets[cls.region];
    bucket.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const rng = bucketLonRange[cls.region];
    if (cls.sphLon < rng[0]) rng[0] = cls.sphLon;
    if (cls.sphLon > rng[1]) rng[1] = cls.sphLon;

    if (nearBoundary(cls.sphLon) && boundarySamples.length < 8) {
      boundarySamples.push({
        v0: cls.v0,
        v1: cls.v1,
        v2: cls.v2,
        centroid: [cls.sphLon, cls.sphLat],
        vote: cls.vote,
        reason: cls.reason,
        region: cls.region,
      });
    }

    if (
      wedgeSamples.length < WEDGE_SAMPLE_MAX
      && cls.sphLon >= 50 && cls.sphLon <= 80
      && cls.sphLat >= 10 && cls.sphLat <= 50
    ) {
      wedgeSamples.push({
        centroid: [cls.sphLon, cls.sphLat],
        vLons: [cls.v0[0], cls.v1[0], cls.v2[0]],
        vLats: [cls.v0[1], cls.v1[1], cls.v2[1]],
        vote: cls.vote,
        reason: cls.reason,
        region: cls.region,
        cell: [
          +sourceCell.minLon.toFixed(2),
          +sourceCell.maxLon.toFixed(2),
          +sourceCell.minLat.toFixed(2),
          +sourceCell.maxLat.toFixed(2),
        ],
      });
    }
    emittedTriangles++;
    return;
  }
  if (ab >= bc && ab >= ac) {
    const m = sphereMidpoint(a, b);
    pushSubdivided(a, m, c, sourceCell);
    pushSubdivided(m, b, c, sourceCell);
  } else if (bc >= ac) {
    const m = sphereMidpoint(b, c);
    pushSubdivided(a, b, m, sourceCell);
    pushSubdivided(a, m, c, sourceCell);
  } else {
    const m = sphereMidpoint(a, c);
    pushSubdivided(a, b, m, sourceCell);
    pushSubdivided(m, b, c, sourceCell);
  }
}

function triangulateSinglePolygon({ polygon }) {
  totalPolygons++;
  const rawOuter = polygon[0];

  // Skip Antarctica: cheap centroid check on the raw ring before any processing.
  {
    let sumLat = 0;
    for (const p of rawOuter) sumLat += p[1];
    if (sumLat / rawOuter.length < ANTARCTICA_LAT) { skippedPolygons++; return; }
  }

  const outerRawJump = maxAbsLonJump(rawOuter);
  if (!warnedDatelineJump && outerRawJump > 180) {
    warnedDatelineJump = true;
    console.warn(`[LandFill] WARNING dateline jump > 180 on outer ring: jump=${outerRawJump.toFixed(2)}`);
  }
  const outerSanitized = sanitizeRing(rawOuter);
  if (!outerSanitized) { skippedPolygons++; rejectedRings++; return; }

  // Normalize outer CCW (not densified yet — densification happens per band).
  const outerWound = enforceWinding(outerSanitized, false);
  const outerBBoxFull = ringBBox(outerWound);

  // Collect validated holes (CW, not densified yet) for later per-band clipping.
  const holesWound = [];
  for (let i = 1; i < polygon.length; i++) {
    const rawHole = polygon[i];
    const holeRawJump = maxAbsLonJump(rawHole);
    if (!warnedDatelineJump && holeRawJump > 180) {
      warnedDatelineJump = true;
      console.warn(`[LandFill] WARNING dateline jump > 180 on hole ring: jump=${holeRawJump.toFixed(2)}`);
    }
    const holeSanitized = sanitizeRing(rawHole);
    if (!holeSanitized) { rejectedRings++; continue; }
    const hole = enforceWinding(holeSanitized, true);
    const holeBBox = ringBBox(hole);
    const impossibleHole = holeBBox.minLon < outerBBoxFull.minLon
      || holeBBox.maxLon > outerBBoxFull.maxLon
      || holeBBox.minLat < outerBBoxFull.minLat
      || holeBBox.maxLat > outerBBoxFull.maxLat;
    if (impossibleHole) {
      if (!warnedImpossibleHoleBBox) {
        warnedImpossibleHoleBBox = true;
        console.warn('[LandFill] WARNING hole bbox exceeds outer bbox; skipping impossible hole ring');
      }
      continue;
    }
    if (!pointInRing(hole[0], outerWound)) {
      if (!warnedUncontainedHole && DEBUG_TRIANGULATION) {
        warnedUncontainedHole = true;
        console.warn('[LandFill] WARNING ring not contained by outer; not treated as hole');
      }
      continue;
    }
    holesWound.push(hole);
  }

  // Split outer ring into BAND_STEP_LON × BAND_STEP_LAT degree grid cells.
  // Max earcut diagonal within a cell ≈ sqrt(LON²+LAT²) ≈ 14.1° → chord ≈ 0.25.
  // Bounds diagonal length in BOTH horizontal and vertical directions.
  const cells = splitRingIntoCells(outerWound);

  for (const bandOuter of cells) {
    const bandBBox = ringBBox(bandOuter);

    // Clip each validated hole to this cell (lon + lat bounds), then densify.
    const bandHoles = [];
    for (const hole of holesWound) {
      let clipped = clipRingByLon(hole, bandBBox.maxLon, true);
      if (!clipped) continue;
      clipped = clipRingByLon(clipped, bandBBox.minLon, false);
      if (!clipped) continue;
      clipped = clipRingByLat(clipped, bandBBox.maxLat, true);
      if (!clipped) continue;
      clipped = clipRingByLat(clipped, bandBBox.minLat, false);
      if (clipped && clipped.length >= 4) bandHoles.push(densifyRing(clipped));
    }

    const outerDense = densifyRing(bandOuter);
    const { vertices, holeIndices } = flattenPolygon(outerDense, bandHoles);
    const indices = earcut(vertices, holeIndices.length ? holeIndices : undefined, 2);
    if (indices.length < 3) { skippedPolygons++; continue; }

    earcutRaw += indices.length / 3;
    const maxIdx = vertices.length / 2;
    for (let t = 0; t < indices.length; t += 3) {
      let i0 = indices[t];
      let i1 = indices[t + 1];
      let i2 = indices[t + 2];
      if (i0 >= maxIdx || i1 >= maxIdx || i2 >= maxIdx) { droppedIdxBounds++; continue; }

      const p0 = [vertices[i0 * 2], vertices[i0 * 2 + 1]];
      const p1 = [vertices[i1 * 2], vertices[i1 * 2 + 1]];
      const p2 = [vertices[i2 * 2], vertices[i2 * 2 + 1]];
      if (triArea2D(p0, p1, p2) <= MIN_TRI_AREA) { droppedDegenerate2D++; continue; }

      const v0 = latLngToVector3(p0[1], p0[0], RADIUS);
      const v1 = latLngToVector3(p1[1], p1[0], RADIUS);
      const v2 = latLngToVector3(p2[1], p2[0], RADIUS);
      if (![v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z].every(Number.isFinite)) { droppedNonFinite++; continue; }

      if (!isOutward(v0, v1, v2)) {
        inwardFixed++;
        [i1, i2] = [i2, i1];
      }

      const a = [vertices[i0 * 2], vertices[i0 * 2 + 1]];
      const b = [vertices[i1 * 2], vertices[i1 * 2 + 1]];
      const c = [vertices[i2 * 2], vertices[i2 * 2 + 1]];
      const va = latLngToVector3(a[1], a[0], RADIUS);
      const vb = latLngToVector3(b[1], b[0], RADIUS);
      const vc = latLngToVector3(c[1], c[0], RADIUS);
      const abx = vb.x - va.x;
      const aby = vb.y - va.y;
      const abz = vb.z - va.z;
      const acx = vc.x - va.x;
      const acy = vc.y - va.y;
      const acz = vc.z - va.z;
      const nx = (aby * acz) - (abz * acy);
      const ny = (abz * acx) - (abx * acz);
      const nz = (abx * acy) - (aby * acx);
      const nLen = Math.sqrt((nx * nx) + (ny * ny) + (nz * nz));
      if (!Number.isFinite(nLen) || nLen < 1e-10) { droppedDegenerate3D++; continue; }

      // Track top-20 longest earcut edges (pre-subdivision) for quality diagnostics.
      const preMax = Math.sqrt(Math.max(chordSq(va, vb), chordSq(vb, vc), chordSq(va, vc)));
      if (topPreSubdivEdges.length < 20 || preMax > topPreSubdivEdges[topPreSubdivEdges.length - 1]) {
        topPreSubdivEdges.push(preMax);
        topPreSubdivEdges.sort((a, b) => b - a);
        if (topPreSubdivEdges.length > 20) topPreSubdivEdges.pop();
      }

      pushSubdivided(va, vb, vc, bandBBox);
    }
  }
}

for (const feature of geojson.features) {
  const { type, coordinates } = feature.geometry;
  if (type === 'Polygon') {
    triangulateSinglePolygon({ polygon: coordinates });
    continue;
  }
  if (type === 'MultiPolygon') {
    for (const polygon of coordinates) {
      triangulateSinglePolygon({ polygon });
    }
    continue;
  }
}

// Build summary stats before writing (included in _meta for diffability).
const usCount   = (buckets.US.length   / 9) | 0;
const emeaCount = (buckets.EMEA.length / 9) | 0;
const apacCount = (buckets.APAC.length / 9) | 0;
const rndRng = (rng) => rng[0] === Infinity ? null : [+rng[0].toFixed(2), +rng[1].toFixed(2)];
const meta = {
  params: { RADIUS, DENSIFY_MAX_DEG, BAND_STEP_LON, BAND_STEP_LAT, MIN_TRI_AREA, BOUNDARY_SNAP_DEG },
  triangles: { US: usCount, EMEA: emeaCount, APAC: apacCount, total: usCount + emeaCount + apacCount },
  lonRange: { US: rndRng(bucketLonRange.US), EMEA: rndRng(bucketLonRange.EMEA), APAC: rndRng(bucketLonRange.APAC) },
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(
  OUTPUT_PATH,
  JSON.stringify({ _meta: meta, US: buckets.US, EMEA: buckets.EMEA, APAC: buckets.APAC }),
);

const totalDropped = droppedIdxBounds + droppedDegenerate2D + droppedAntarctica + droppedNonFinite + droppedDegenerate3D;
const arcDeg = (chord) => (2 * Math.asin(Math.min(chord / (2 * RADIUS), 1)) * 180 / Math.PI).toFixed(1);
console.log('\n=== preprocess-land summary ===');
console.log(`Polygons processed        : ${totalPolygons}`);
console.log(`Polygons skipped          : ${skippedPolygons}`);
console.log(`Rings rejected            : ${rejectedRings}`);
console.log(`Densified points added    : ${densifiedPoints}  (DENSIFY_MAX_DEG=${DENSIFY_MAX_DEG})`);
console.log(`--- Triangle pipeline ---`);
console.log(`Earcut triangles (raw)    : ${earcutRaw}`);
console.log(`  Dropped idx-out-bounds  : ${droppedIdxBounds}`);
console.log(`  Dropped degenerate (2D) : ${droppedDegenerate2D}`);
console.log(`  Dropped Antarctica      : ${droppedAntarctica}`);
console.log(`  Dropped non-finite      : ${droppedNonFinite}`);
console.log(`  Dropped degenerate (3D) : ${droppedDegenerate3D}`);
console.log(`  Total dropped           : ${totalDropped}`);
console.log(`Triangles to subdivide    : ${earcutRaw - totalDropped}`);
console.log(`Triangles emitted (final) : ${emittedTriangles}`);
console.log(`Inward triangles fixed    : ${inwardFixed}`);
console.log(`--- Pre-subdivision edge quality (top 20 longest earcut edges) ---`);
topPreSubdivEdges.forEach((chord, i) =>
  console.log(`  ${String(i + 1).padStart(2)}. chord=${chord.toFixed(4)}  arc=${arcDeg(chord)}°`)
);
const formatRng = (rng) => rng[0] === Infinity ? '(empty)' : `[${rng[0].toFixed(1)}, ${rng[1].toFixed(1)}]`;
console.log(`--- Per region (triangles + centroid lon range — verify no overlap) ---`);
console.log(`US   triangles: ${usCount.toString().padStart(5)}  lon ${formatRng(bucketLonRange.US)}  (expected [-180,-25])`);
console.log(`EMEA triangles: ${emeaCount.toString().padStart(5)}  lon ${formatRng(bucketLonRange.EMEA)}  (expected [-25,65])`);
console.log(`APAC triangles: ${apacCount.toString().padStart(5)}  lon ${formatRng(bucketLonRange.APAC)}  (expected [65,180])`);
console.log(`Mixed-vote triangles      : ${mixedVoteCount}`);
console.log(`Centroid tie-break used   : ${centroidTieBreakCount}`);
if (boundarySamples.length > 0) {
  console.log('--- Boundary samples (vertex lon/lat, spherical centroid lon/lat, assigned region) ---');
  boundarySamples.forEach((s, i) => {
    console.log(
      `  #${i + 1} v0=${s.v0[0].toFixed(2)},${s.v0[1].toFixed(2)} `
      + `v1=${s.v1[0].toFixed(2)},${s.v1[1].toFixed(2)} `
      + `v2=${s.v2[0].toFixed(2)},${s.v2[1].toFixed(2)} `
      + `cent=${s.centroid[0].toFixed(2)},${s.centroid[1].toFixed(2)} `
      + `vote=${s.vote} (${s.reason}) -> ${s.region}`,
    );
  });
}
if (wedgeSamples.length > 0) {
  console.log('--- Wedge samples (lon 50..80, lat 10..50) ---');
  wedgeSamples.forEach((s, i) => {
    console.log(
      `  #${i + 1} cent=${s.centroid[0].toFixed(2)},${s.centroid[1].toFixed(2)} `
      + `reg=${s.region} vote=${s.vote} (${s.reason}) `
      + `vLon=[${s.vLons.map((v) => v.toFixed(2)).join(',')}] `
      + `vLat=[${s.vLats.map((v) => v.toFixed(2)).join(',')}] `
      + `cell=[${s.cell.join(',')}]`,
    );
  });
}
if (unknownRegion > 0) console.warn(`⚠  unknownRegion: ${unknownRegion} (should be 0)`);
// Alignment assertions: each bucket must have a whole number of triangles
console.assert(buckets.US.length   % 9 === 0, 'US bucket misaligned (length % 9 !== 0)');
console.assert(buckets.EMEA.length % 9 === 0, 'EMEA bucket misaligned');
console.assert(buckets.APAC.length % 9 === 0, 'APAC bucket misaligned');
console.log(`Output                    : ${OUTPUT_PATH}`);
