import { useMemo } from 'react';
import * as THREE from 'three';
import geojsonData from '../../data/ne_110m_admin_0_countries.json';
import { parseGeoJson } from '../../utils/geoJsonParser.ts';

export function Coastlines() {
  const parsed = useMemo(() => parseGeoJson(geojsonData as never, 1.004), []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(parsed.positions, 3));
    return geo;
  }, [parsed]);

  return (
    <lineSegments geometry={geometry} renderOrder={4}>
      <lineBasicMaterial color="#cccccc" transparent opacity={0.5} depthTest depthWrite={false} />
    </lineSegments>
  );
}
