import { useMemo } from 'react';
import * as THREE from 'three';
import geojsonData from '../../data/ne_110m_admin_0_countries.json';
import { parseGeoJson } from '../../utils/geoJsonParser.ts';
import { REGION_COLORS, REGION_BASE_COLORS } from '../../utils/regions.ts';
import type { Region } from '../../types.ts';

interface CoastlinesProps {
  highlightedRegion: Region;
}

export function Coastlines({ highlightedRegion }: CoastlinesProps) {
  const parsed = useMemo(() => parseGeoJson(geojsonData as never, 1.008), []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(parsed.positions, 3));

    // Build vertex colors: selected region gets bright color, others get dim base color
    const colors = new Float32Array(parsed.regions.length * 3);
    const tmp = new THREE.Color();

    for (let i = 0; i < parsed.regions.length; i++) {
      const region = parsed.regions[i];
      if (region === highlightedRegion) {
        tmp.set(REGION_COLORS[region]);
      } else {
        tmp.set(REGION_BASE_COLORS[region]);
      }
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [parsed, highlightedRegion]);

  return (
    <lineSegments geometry={geometry} renderOrder={30}>
      <lineBasicMaterial vertexColors transparent opacity={0.85} depthWrite={false} />
    </lineSegments>
  );
}
