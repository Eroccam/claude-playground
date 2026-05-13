import { useMemo } from 'react';
import * as THREE from 'three';
import geojsonData from '../../data/ne_110m_admin_0_countries.json';
import { parseGeoJson } from '../../utils/geoJsonParser.ts';
import { REGION_BASE_COLORS, REGION_COLORS } from '../../utils/regions.ts';
import type { Region } from '../../types.ts';

interface RegionRimGlowProps {
  highlightedRegion: Region;
}

const vertexShader = /* glsl */ `
  varying vec3 vColor;
  varying float vRim;

  void main() {
    vColor = color;

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec3 normal = normalize(worldPosition.xyz);
    vec3 viewDirection = normalize(cameraPosition - worldPosition.xyz);
    float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);

    vRim = pow(1.0 - facing, 1.75);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vRim;

  uniform float opacity;
  uniform float floorGlow;

  void main() {
    float alpha = opacity * (floorGlow + vRim);
    gl_FragColor = vec4(vColor, alpha);
  }
`;

function buildGeometry(highlightedRegion: Region, radius: number): THREE.BufferGeometry {
  const parsed = parseGeoJson(geojsonData as never, radius);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(parsed.positions, 3));

  const colors = new Float32Array(parsed.regions.length * 3);
  const color = new THREE.Color();

  for (let i = 0; i < parsed.regions.length; i++) {
    const region = parsed.regions[i];
    color.set(region === highlightedRegion ? REGION_COLORS[region] : REGION_BASE_COLORS[region]);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function buildMaterial(opacity: number, floorGlow: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      opacity: { value: opacity },
      floorGlow: { value: floorGlow },
    },
    vertexColors: true,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function RegionRimGlow({ highlightedRegion }: RegionRimGlowProps) {
  const innerGeometry = useMemo(() => buildGeometry(highlightedRegion, 1.012), [highlightedRegion]);
  const outerGeometry = useMemo(() => buildGeometry(highlightedRegion, 1.026), [highlightedRegion]);
  const innerMaterial = useMemo(() => buildMaterial(0.58, 0.18), []);
  const outerMaterial = useMemo(() => buildMaterial(0.24, 0.05), []);

  return (
    <>
      <lineSegments geometry={outerGeometry} material={outerMaterial} renderOrder={2} />
      <lineSegments geometry={innerGeometry} material={innerMaterial} renderOrder={3} />
    </>
  );
}
