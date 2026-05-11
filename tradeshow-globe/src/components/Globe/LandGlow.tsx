import { useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { REGION_BASE_COLORS, REGION_COLORS } from '../../utils/regions.ts';
import type { Region } from '../../types.ts';

interface LandGlowProps {
  highlightedRegion: Region;
}

const REGIONS: Region[] = ['US', 'EMEA', 'APAC'];

type RegionArrays = Record<Region, number[]>;

function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function normalizeLon(lon: number): number {
  return ((lon % 360) + 540) % 360 - 180;
}

function vector3ToLatLng(v: THREE.Vector3): { lon: number; lat: number } {
  const r = v.length();
  const lat = Math.asin(Math.max(-1, Math.min(1, v.y / r))) * (180 / Math.PI);
  const lon = normalizeLon(Math.atan2(-v.z, v.x) * (180 / Math.PI));
  return { lon, lat };
}

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
  const regionDebugMode = import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('regionDebug') === '1';

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

    console.log(`[LandFill] loaded — ${stats.join(' | ')}  total=${totalTriangles}`);
    return result;
  }, [regionArrays]);

  const boundaryLines = useMemo(() => {
    if (!regionDebugMode) return null;
    const lons = [-180, -25, 0, 65, 180];
    return lons.map((lon) => {
      const points: THREE.Vector3[] = [];
      for (let lat = -89; lat <= 89; lat += 1) {
        points.push(latLngToVector3(lat, lon, 1.015));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 3;
      return { lon, line };
    });
  }, [regionDebugMode]);

  useEffect(() => {
    if (regionDebugMode) {
      console.log('[RegionDebug] meridian overlay enabled for lon=-180,-25,0,65,180');

      const refs = [
        { name: 'London', lon: 0, lat: 51.5 },
        { name: 'Cairo', lon: 31, lat: 30 },
        { name: 'Dubai', lon: 55, lat: 25 },
      ];
      refs.forEach((r) => {
        const xyz = latLngToVector3(r.lat, r.lon, 1);
        const back = vector3ToLatLng(xyz);
        const dLon = Math.abs(normalizeLon(back.lon - r.lon));
        const dLat = Math.abs(back.lat - r.lat);
        console.log(
          `[RegionDebug] roundtrip ${r.name}: in=(${r.lon.toFixed(2)},${r.lat.toFixed(2)}) `
          + `out=(${back.lon.toFixed(2)},${back.lat.toFixed(2)}) `
          + `delta=(${dLon.toFixed(4)},${dLat.toFixed(4)})`,
        );
      });
    }
  }, [regionDebugMode]);

  if (!geometries) return null;

  return (
    <>
      {REGIONS.map((region) => (
        <mesh key={region} geometry={geometries[region]} renderOrder={1}>
          {/* Z-fighting guard:
              - Land triangles at radius 1.005 (0.5% above ocean sphere at 1.0).
              - Spherical subdivision keeps effective min radius ≥ 1.0038 even at max chord.
              - depthWrite={false}: land triangles don't fight each other (all 3 regions blend).
              - depthTest={true}: land behind the globe is correctly occluded by ocean.
              - polygonOffset(-1,-1): additional forward bias in the depth buffer. */}
          <meshBasicMaterial
            color={proofMode ? '#ff1493' : (region === highlightedRegion ? REGION_COLORS[region] : REGION_BASE_COLORS[region])}
            transparent
            opacity={proofMode ? 1 : (region === highlightedRegion ? 0.72 : 0.22)}
            wireframe={proofMode}
            depthTest
            depthWrite={false}
            side={THREE.FrontSide}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ))}
      {boundaryLines?.map((line) => (
        <primitive key={`boundary-${line.lon}`} object={line.line} />
      ))}
    </>
  );
}
