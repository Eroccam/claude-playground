import { useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { REGION_BASE_COLORS, REGION_COLORS } from '../../utils/regions.ts';
import type { Region } from '../../types.ts';

interface LandGlowProps {
  highlightedRegion: Region;
}

const REGIONS: Region[] = ['US', 'EMEA', 'APAC'];

type RegionArrays = Record<Region, number[]>;

/** Extract region arrays from either the new { _meta, US, EMEA, APAC } format
 *  or the legacy { US, EMEA, APAC } format (backward compat). */
function extractRegionArrays(json: unknown): RegionArrays | null {
  if (!json || typeof json !== 'object') return null;
  const raw = json as Record<string, unknown>;
  const result = {} as RegionArrays;
  for (const region of REGIONS) {
    const arr = raw[region];
    if (!Array.isArray(arr)) {
      console.error(`[LandGlow] Missing or invalid array for region "${region}" in response`);
      return null;
    }
    result[region as Region] = arr as number[];
  }
  return result;
}

export function LandGlow({ highlightedRegion }: LandGlowProps) {
  const proofMode = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('fillProof') === '1';

  const [regionArrays, setRegionArrays] = useState<RegionArrays | null>(null);

  useEffect(() => {
    // BASE_URL ensures the path is correct whether the app is served from /
    // or a subpath like /tradeshow-globe/ (set by vite.config base option).
    const url = `${import.meta.env.BASE_URL}land/land-triangles.json`;
    console.log('[LandGlow] fetching:', url);

    fetch(url)
      .then((res) => {
        console.log(`[LandGlow] response: ${res.status} ${res.ok ? 'ok' : 'NOT OK'} | content-type: ${res.headers.get('content-type')}`);
        if (!res.ok) {
          res.text().then((t) =>
            console.error(`[LandGlow] fetch failed (${res.status}), first 200 chars: ${t.slice(0, 200)}`)
          );
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (!json) return;
        const arrays = extractRegionArrays(json);
        if (!arrays) {
          console.error('[LandGlow] Could not extract region arrays from JSON. Keys found:', Object.keys(json as object));
          return;
        }
        setRegionArrays(arrays);
      })
      .catch((err) => console.error('[LandGlow] fetch/parse error:', err));
  }, []);

  const geometries = useMemo(() => {
    if (!regionArrays) return null;
    const result = {} as Record<Region, THREE.BufferGeometry>;
    const stats: string[] = [];
    let totalTriangles = 0;

    for (const region of REGIONS) {
      const arr = regionArrays[region];
      if (arr.length % 9 !== 0) {
        console.error(`[LandFill] ALIGNMENT ERROR: ${region} length ${arr.length} not divisible by 9`);
      }
      if (arr.length === 0) {
        console.warn(`[LandFill] WARNING: ${region} bucket is empty`);
      }

      const geo = new THREE.BufferGeometry();
      const position = new THREE.Float32BufferAttribute(arr, 3);
      geo.setAttribute('position', position);
      result[region] = geo;

      const triangleCount = position.count / 3;
      totalTriangles += triangleCount;
      stats.push(`${region}:tri=${triangleCount}`);
    }

    console.log(`[LandFill] loaded - ${stats.join(' | ')}  total=${totalTriangles}`);
    return result;
  }, [regionArrays]);

  if (!geometries) return null;

  return (
    <>
      {REGIONS.map((region) => (
        <mesh key={region} geometry={geometries[region]} renderOrder={1}>
          {/* Z-fighting guard:
              - Land triangles at radius 1.002, above the ocean sphere at 1.0.
              - solid material prevents antialiased earcut edges from blending with ocean.
              - depthTest={true}: land behind the globe is correctly occluded by ocean.
              - polygonOffset(-1,-1): additional forward bias in the depth buffer. */}
          <meshBasicMaterial
            color={proofMode ? '#ff1493' : (region === highlightedRegion ? REGION_COLORS[region] : REGION_BASE_COLORS[region])}
            wireframe={proofMode}
            depthTest
            depthWrite
            side={THREE.FrontSide}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ))}
    </>
  );
}
