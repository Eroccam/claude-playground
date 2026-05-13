import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGlobe } from '../../context/globeContext.ts';
import { latLngToVector3 } from '../../utils/coordinates.ts';

const GLOW_RADIUS = 0.15;
const GLOW_COLOR = '#3388ff';

const glowVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFrag = /* glsl */ `
  varying vec2 vUv;
  uniform float uPulse;
  uniform vec3 uColor;
  void main() {
    float dist = length(vUv - 0.5) * 2.0;
    float alpha = smoothstep(1.0, 0.0, dist) * uPulse * 0.6;
    gl_FragColor = vec4(uColor * 1.5, alpha);
  }
`;

export function BeaconGlow() {
  const { selectedEvent } = useGlobe();
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current || !matRef.current || !selectedEvent) return;
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3);
    matRef.current.uniforms.uPulse.value = pulse;
    // Slight scale pulse
    const s = GLOW_RADIUS * (0.9 + 0.2 * pulse);
    meshRef.current.scale.set(s, s, 1);
  });

  if (!selectedEvent) return null;

  const surfacePos = latLngToVector3(selectedEvent.lat, selectedEvent.lng, 1.0005);
  const normal = surfacePos.clone().normalize();
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

  const color = new THREE.Color(GLOW_COLOR);

  return (
    <mesh
      ref={meshRef}
      position={surfacePos}
      quaternion={quaternion}
      renderOrder={6}
    >
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={glowVert}
        fragmentShader={glowFrag}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uPulse: { value: 0.5 },
          uColor: { value: color },
        }}
      />
    </mesh>
  );
}
