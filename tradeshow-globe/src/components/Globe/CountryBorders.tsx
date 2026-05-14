import { useMemo } from 'react';
import * as THREE from 'three';
import geojsonData from '../../data/ne_110m_admin_0_countries.json';
import { parseCountryBorders } from '../../utils/geoJsonParser.ts';

export function CountryBorders() {
  const positions = useMemo(() => parseCountryBorders(geojsonData as never, 1.0045), []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [positions]);

  return (
    <lineSegments geometry={geometry} renderOrder={3}>
      <lineBasicMaterial color="#4f5663" transparent opacity={0.22} depthTest depthWrite={false} />
    </lineSegments>
  );
}
