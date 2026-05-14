/**
 * validate-land-geometry.mjs
 *
 * Checks source GeoJSON ring quality and generated triangle mesh validity.
 * Exits with non-zero status if validation fails.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEOJSON_PATH = resolve(__dirname, '../src/data/ne_110m_admin_0_countries.json');
const TRIANGLES_PATH = resolve(__dirname, '../public/land/land-triangles.json');
const POINT_EPS = 1e-7;
const MIN_TRI_AREA_3D = 1e-12;

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

function sanitizeRing(rawRing) {
  const normalized = normalizeRing(rawRing);
  const deduped = removeNearDuplicates(normalized);
  const simplified = removeCollinear(deduped);
  const closed = closeRing(simplified);
  return closed.length >= 4 ? closed : null;
}

function orient(a, b, c) {
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
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

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

function triangleMetrics(flat) {
  let nanCount = 0;
  let tinyCount = 0;
  let inwardCount = 0;

  for (let i = 0; i < flat.length; i += 9) {
    const ax = flat[i];
    const ay = flat[i + 1];
    const az = flat[i + 2];
    const bx = flat[i + 3];
    const by = flat[i + 4];
    const bz = flat[i + 5];
    const cx = flat[i + 6];
    const cy = flat[i + 7];
    const cz = flat[i + 8];

    if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) {
      nanCount++;
      continue;
    }

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const nx = (aby * acz) - (abz * acy);
    const ny = (abz * acx) - (abx * acz);
    const nz = (abx * acy) - (aby * acx);
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!Number.isFinite(nLen) || nLen < MIN_TRI_AREA_3D * 2) {
      tinyCount++;
      continue;
    }

    const mx = (ax + bx + cx) / 3;
    const my = (ay + by + cy) / 3;
    const mz = (az + bz + cz) / 3;
    const dot = (nx * mx) + (ny * my) + (nz * mz);
    if (dot < 0) inwardCount++;
  }

  return { nanCount, tinyCount, inwardCount };
}

const geojson = JSON.parse(readFileSync(GEOJSON_PATH, 'utf8'));
const rings = [];
for (const feature of geojson.features) {
  const polygons = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates];
  for (const polygon of polygons) {
    for (const ring of polygon) rings.push(ring);
  }
}

let invalidShort = 0;
let selfIntersecting = 0;
for (const ring of rings) {
  const sanitized = sanitizeRing(ring);
  if (!sanitized) {
    invalidShort++;
    continue;
  }
  if (hasSelfIntersection(sanitized)) selfIntersecting++;
}

const triangles = JSON.parse(readFileSync(TRIANGLES_PATH, 'utf8'));
const regions = ['US', 'EMEA', 'APAC'];
let totalTriangles = 0;
let totalNan = 0;
let totalTiny = 0;
let totalInward = 0;

for (const region of regions) {
  const flat = triangles[region] || [];
  totalTriangles += flat.length / 9;
  const m = triangleMetrics(flat);
  totalNan += m.nanCount;
  totalTiny += m.tinyCount;
  totalInward += m.inwardCount;
  console.log(`[${region}] triangles=${(flat.length / 9) | 0} nan=${m.nanCount} tiny=${m.tinyCount} inward=${m.inwardCount}`);
}

console.log(`Rings total=${rings.length} invalidShort=${invalidShort} selfIntersecting=${selfIntersecting}`);
if (invalidShort > 0 || selfIntersecting > 0) {
  console.warn('WARNING: source GeoJSON contains invalid rings; preprocess step sanitizes/rejects them.');
}

const failures = [];
if (totalNan > 0) failures.push(`triangles with NaN: ${totalNan}`);
if (totalTiny > 0) failures.push(`degenerate triangles: ${totalTiny}`);
if (totalInward > 0) failures.push(`inward triangles: ${totalInward}`);
if (totalTriangles === 0) failures.push('no triangles emitted');

if (failures.length) {
  console.error(`VALIDATION FAILED: ${failures.join('; ')}`);
  process.exit(1);
}

console.log(`VALIDATION PASSED: triangles=${totalTriangles}`);
