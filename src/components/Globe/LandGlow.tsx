import { useMemo } from 'react';
import * as THREE from 'three';
import geojsonData from '../../data/ne_110m_admin_0_countries.json';
import { parseBaseFill } from '../../utils/geoJsonParser.ts';
import { REGION_BASE_COLORS, REGION_COLORS } from '../../utils/regions.ts';
import type { Region } from '../../types.ts';

const REGIONS: Region[] = ['US', 'EMEA', 'APAC'];

interface LandGlowProps {
  highlightedRegion: Region;
}

export function LandGlow({ highlightedRegion }: LandGlowProps) {
  const regionFills = useMemo(() => parseBaseFill(geojsonData as never, 1.003), []);

  const geos = useMemo(() => {
    const result = {} as Record<Region, THREE.BufferGeometry>;
    for (const region of REGIONS) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(regionFills[region], 3));
      result[region] = geo;
    }
    console.log(`[LandFill] LandFillMeshCount: ${REGIONS.length} | CountryFillMeshCount: 0`);
    for (const r of REGIONS) {
      const geo = result[r];
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const tris = geo.index ? geo.index.count / 3 : pos.count / 3;
      console.log(`  ${r} uuid:${geo.uuid.slice(0, 8)} triangles:${tris} material:MeshBasicMaterial vertexColors:false opacity:0.18`);
    }
    return result;
  }, [regionFills]);

  return (
    <>
      {REGIONS.map(region => (
        <mesh key={region} geometry={geos[region]} renderOrder={10}>
          <meshBasicMaterial
            color={region === highlightedRegion ? REGION_COLORS[region] : REGION_BASE_COLORS[region]}
            vertexColors={false}
            transparent
            opacity={0.18}
            depthWrite={true}
            depthTest={true}
            side={THREE.FrontSide}
          />
        </mesh>
      ))}
    </>
  );
}
