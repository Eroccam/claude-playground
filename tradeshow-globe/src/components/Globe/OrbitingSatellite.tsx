import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const ORBIT_RADIUS = 1.17;
const ORBIT_INCLINATION = THREE.MathUtils.degToRad(24);
const ORBIT_SPEED = 0.18;
const SATELLITE_SCALE = 0.21;
const BEACON_DELAY_SECONDS = 3;
const SUN_DIRECTION = new THREE.Vector3(-0.35, 0.2, 1).normalize();

export function OrbitingSatellite() {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.MeshBasicMaterial>(null);
  const beaconRef = useRef<THREE.MeshBasicMaterial>(null);

  const orbitTilt = useMemo(
    () => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ORBIT_INCLINATION),
    [],
  );

  const materials = useMemo(
    () => ({
      body: new THREE.MeshBasicMaterial({ color: '#7f8792' }),
      panel: new THREE.MeshBasicMaterial({ color: '#17375f' }),
      panelEdge: new THREE.MeshBasicMaterial({ color: '#52677f' }),
      antenna: new THREE.MeshBasicMaterial({ color: '#8f96a1' }),
    }),
    [],
  );

  useFrame(({ clock, camera }) => {
    if (!groupRef.current) return;

    const elapsed = clock.elapsedTime * ORBIT_SPEED + 2.4;
    const orbitPosition = new THREE.Vector3(
      Math.cos(elapsed) * ORBIT_RADIUS,
      0,
      Math.sin(elapsed) * ORBIT_RADIUS,
    ).applyQuaternion(orbitTilt);

    const tangent = new THREE.Vector3(
      -Math.sin(elapsed),
      0,
      Math.cos(elapsed),
    ).applyQuaternion(orbitTilt).normalize();

    const outward = orbitPosition.clone().normalize();
    const up = new THREE.Vector3().crossVectors(tangent, outward).normalize();
    const lookAt = orbitPosition.clone().add(tangent);

    groupRef.current.position.copy(orbitPosition);
    groupRef.current.up.copy(up);
    groupRef.current.lookAt(lookAt);

    const distanceFade = 1 - THREE.MathUtils.smoothstep(camera.position.distanceTo(orbitPosition), 1.4, 3.4);
    const darkSideGlow = THREE.MathUtils.smoothstep(-outward.dot(SUN_DIRECTION), 0.05, 0.75);
    const glint = Math.max(0, Math.sin(elapsed * 3.2)) * 0.025;
    const scale = SATELLITE_SCALE * (0.96 + darkSideGlow * 0.04);

    groupRef.current.scale.setScalar(scale);
    groupRef.current.visible = distanceFade > 0.04;

    if (glowRef.current) {
      glowRef.current.opacity = distanceFade * (0.01 + darkSideGlow * 0.055 + glint);
    }

    if (beaconRef.current) {
      const beaconTime = clock.elapsedTime - BEACON_DELAY_SECONDS;
      const pulse = beaconTime > 0 ? Math.pow(Math.max(0, Math.sin(beaconTime * 4.4)), 3) : 0;
      beaconRef.current.opacity = distanceFade * pulse * 0.9;
    }
  });

  return (
    <group ref={groupRef} renderOrder={4}>
      <mesh>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshBasicMaterial
          ref={glowRef}
          color="#5f8fd8"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh material={materials.body}>
        <boxGeometry args={[0.045, 0.028, 0.028]} />
      </mesh>
      <mesh position={[0.018, 0.017, 0.014]}>
        <sphereGeometry args={[0.014, 8, 8]} />
        <meshBasicMaterial
          ref={beaconRef}
          color="#ff4d5e"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh position={[-0.061, 0, 0]} material={materials.panel}>
        <boxGeometry args={[0.075, 0.003, 0.035]} />
      </mesh>
      <mesh position={[0.061, 0, 0]} material={materials.panel}>
        <boxGeometry args={[0.075, 0.003, 0.035]} />
      </mesh>
      <mesh position={[-0.102, 0.0035, 0]} material={materials.panelEdge}>
        <boxGeometry args={[0.004, 0.004, 0.039]} />
      </mesh>
      <mesh position={[0.102, 0.0035, 0]} material={materials.panelEdge}>
        <boxGeometry args={[0.004, 0.004, 0.039]} />
      </mesh>

      <mesh position={[0, 0.024, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.antenna}>
        <cylinderGeometry args={[0.002, 0.002, 0.04, 8]} />
      </mesh>
      <mesh position={[0, 0.046, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.antenna}>
        <coneGeometry args={[0.012, 0.01, 12]} />
      </mesh>
    </group>
  );
}
