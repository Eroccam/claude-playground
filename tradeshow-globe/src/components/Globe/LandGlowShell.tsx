import { useMemo } from 'react';
import * as THREE from 'three';
import geojsonData from '../../data/ne_110m_admin_0_countries.json';
import { parseBaseFill } from '../../utils/geoJsonParser.ts';
import { REGION_COLORS, REGION_BASE_COLORS } from '../../utils/regions.ts';
import type { Region } from '../../types.ts';

const REGIONS: Region[] = ['US', 'EMEA', 'APAC'];

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = 1.0 - max(dot(vNormal, viewDir), 0.0);
    float glow = pow(rim, 2.5);
    gl_FragColor = vec4(uColor, glow * uOpacity);
  }
`;

interface LandGlowShellProps {
  highlightedRegion: Region;
}

export function LandGlowShell({ highlightedRegion }: LandGlowShellProps) {
  const regionFills = useMemo(() => parseBaseFill(geojsonData as never, 1.003), []);

  const geos = useMemo(() => {
    const result = {} as Record<Region, THREE.BufferGeometry>;
    for (const region of REGIONS) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(regionFills[region], 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(regionFills.normals[region], 3));
      result[region] = geo;
    }
    return result;
  }, [regionFills]);

  const materials = useMemo(() => {
    const result = {} as Record<Region, THREE.ShaderMaterial>;
    for (const region of REGIONS) {
      result[region] = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor:   { value: new THREE.Color() },
          uOpacity: { value: 0.6 },
        },
      });
    }
    return result;
  }, []);

  // Sync region colors to uniforms on every render — cheap .set() calls,
  // no allocations since the Color objects are reused from the material.
  for (const region of REGIONS) {
    const hex = region === highlightedRegion ? REGION_COLORS[region] : REGION_BASE_COLORS[region];
    materials[region].uniforms.uColor.value.set(hex);
  }

  return (
    <>
      {REGIONS.map(region => (
        <mesh
          key={region}
          geometry={geos[region]}
          material={materials[region]}
          scale={1.009}
          renderOrder={2}
        />
      ))}
    </>
  );
}
