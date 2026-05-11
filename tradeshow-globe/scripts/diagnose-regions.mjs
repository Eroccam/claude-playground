import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(__dirname, '../public/land/land-triangles.json'), 'utf8'));

// ---- Correct inverse for latLngToVector3(lat, lng, r) ----
// x = -(r*sin(phi)*cos(theta)), y = r*cos(phi), z = r*sin(phi)*sin(theta)
// phi=(90-lat)*PI/180, theta=(lng+180)*PI/180
// Inverse: theta = atan2(z, -x); lng = theta*180/PI - 180; if lng < -180 lng += 360
function xyzToLatLon(x, y, z) {
  const r = Math.sqrt(x*x + y*y + z*z);
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, y / r))) * 180 / Math.PI;
  let lon = Math.atan2(z, -x) * 180 / Math.PI - 180;
  if (lon < -180) lon += 360; // normalize to [-180, 180]
  return { lat, lon };
}

// Triangle counts
const US   = (data.US.length   / 9) | 0;
const EMEA = (data.EMEA.length / 9) | 0;
const APAC = (data.APAC.length / 9) | 0;
console.log(`Triangles — US: ${US}  EMEA: ${EMEA}  APAC: ${APAC}  total: ${US+EMEA+APAC}`);

// Per-bucket centroid lon ranges
const lonRanges = { US: [Infinity, -Infinity], EMEA: [Infinity, -Infinity], APAC: [Infinity, -Infinity] };
for (const [bucket, arr] of Object.entries(data)) {
  if (bucket === '_meta' || !Array.isArray(arr)) continue;
  for (let i = 0; i < arr.length; i += 9) {
    const { lon } = xyzToLatLon(
      (arr[i]+arr[i+3]+arr[i+6])/3,
      (arr[i+1]+arr[i+4]+arr[i+7])/3,
      (arr[i+2]+arr[i+5]+arr[i+8])/3
    );
    const rng = lonRanges[bucket];
    if (lon < rng[0]) rng[0] = lon;
    if (lon > rng[1]) rng[1] = lon;
  }
}
console.log('\n=== Back-projected centroid lon ranges (correct inverse) ===');
for (const [k, [lo, hi]] of Object.entries(lonRanges)) {
  console.log(`  ${k}  lon ∈ [${lo.toFixed(1)}, ${hi.toFixed(1)}]`);
}

// Must match BOUNDARY_SNAP_DEG in preprocess-land.mjs
const BOUNDARY_SNAP_DEG = 2.0;

// Expected region — mirrors the snap logic in preprocess-land.mjs so the
// diagnose report shows mismatches under the *same* rules used at build time.
function expectedRegion(lon, lat) {
  if (lat < -60) return null;
  if (lon < -25 + BOUNDARY_SNAP_DEG) return 'US';
  if (lon <  65 + BOUNDARY_SNAP_DEG) return 'EMEA';
  return 'APAC';
}

// Mismatch counts
const mismatch = { US: 0, EMEA: 0, APAC: 0 };
let totalChecked = 0;
const examples = { US: [], EMEA: [], APAC: [] };

for (const [bucket, arr] of Object.entries(data)) {
  if (bucket === '_meta' || !Array.isArray(arr)) continue;
  for (let i = 0; i < arr.length; i += 9) {
    const { lat, lon } = xyzToLatLon(
      (arr[i]+arr[i+3]+arr[i+6])/3,
      (arr[i+1]+arr[i+4]+arr[i+7])/3,
      (arr[i+2]+arr[i+5]+arr[i+8])/3
    );
    const exp = expectedRegion(lon, lat);
    if (exp && exp !== bucket) {
      mismatch[bucket]++;
      if (examples[bucket].length < 5) examples[bucket].push({ lon: lon.toFixed(1), lat: lat.toFixed(1), exp });
    }
    totalChecked++;
  }
}

console.log('\n=== Centroid/bucket mismatches ===');
let total = 0;
for (const [k, v] of Object.entries(mismatch)) {
  total += v;
  const pct = (v / ((data[k].length/9)|0) * 100).toFixed(1);
  console.log(`  ${k}: ${v} / ${(data[k].length/9)|0}  (${pct}%)`, v > 0 ? 'examples:' : '✓', examples[k]);
}
console.log(`  TOTAL: ${total} / ${totalChecked} (${(total/totalChecked*100).toFixed(2)}%)`);

// Extra check: any bucket has vertices that are not finite?
let nonFinite = 0;
for (const [key, arr] of Object.entries(data)) {
  if (key === '_meta' || !Array.isArray(arr)) continue;
  for (const v of arr) if (!isFinite(v)) nonFinite++;
}
console.log(`\n=== Non-finite values: ${nonFinite} (should be 0) ===`);
