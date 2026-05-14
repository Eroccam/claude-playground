import { useMemo, useRef } from 'react';
import { Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const MIN_INTERVAL_SECONDS = 15;
const MAX_INTERVAL_SECONDS = 25;
const TRAIL_DURATION_SECONDS = 1.25;

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function ShootingStar() {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.MeshBasicMaterial>(null);
  const tailRef = useRef<THREE.MeshBasicMaterial>(null);
  const nextLaunchRef = useRef(randomRange(MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS));
  const activeSinceRef = useRef<number | null>(null);
  const startRef = useRef(new THREE.Vector3());
  const endRef = useRef(new THREE.Vector3());
  const trailLengthRef = useRef(0.42);
  const speedRef = useRef(1);
  const angleRef = useRef(0);
  const { camera } = useThree();

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-1, 0.018);
    shape.lineTo(-1, -0.018);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);

  const scheduleNext = (now: number) => {
    activeSinceRef.current = null;
    nextLaunchRef.current = now + randomRange(MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS);
    if (groupRef.current) groupRef.current.visible = false;
  };

  const launch = (now: number) => {
    const depth = randomRange(3.8, 5.2);
    const startX = randomRange(-1.5, 1.15);
    const startY = randomRange(0.35, 1.15);
    const angle = THREE.MathUtils.degToRad(randomRange(-18, -42));
    const distance = randomRange(1.35, 2.1);
    const direction = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();

    camera.getWorldDirection(forward);
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

    startRef.current
      .copy(camera.position)
      .addScaledVector(forward, depth)
      .addScaledVector(right, startX)
      .addScaledVector(up, startY);
    endRef.current
      .copy(startRef.current)
      .addScaledVector(right, direction.x * distance)
      .addScaledVector(up, direction.y * distance);
    trailLengthRef.current = randomRange(0.34, 0.56);
    speedRef.current = randomRange(0.85, 1.15);
    angleRef.current = angle;
    activeSinceRef.current = now;

    if (groupRef.current) groupRef.current.visible = true;
  };

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    const activeSince = activeSinceRef.current;

    if (activeSince === null) {
      if (now >= nextLaunchRef.current) launch(now);
      return;
    }

    const progress = (now - activeSince) / (TRAIL_DURATION_SECONDS / speedRef.current);
    if (progress >= 1) {
      scheduleNext(now);
      return;
    }

    const position = new THREE.Vector3().lerpVectors(startRef.current, endRef.current, progress);
    const fadeIn = THREE.MathUtils.smoothstep(progress, 0, 0.18);
    const fadeOut = 1 - THREE.MathUtils.smoothstep(progress, 0.5, 1);
    const opacity = fadeIn * fadeOut;

    if (groupRef.current) {
      groupRef.current.position.copy(position);
      groupRef.current.quaternion.copy(camera.quaternion);
      groupRef.current.rotateZ(angleRef.current);
      groupRef.current.scale.set(trailLengthRef.current, 1, 1);
    }

    if (headRef.current) headRef.current.opacity = opacity * 0.95;
    if (tailRef.current) tailRef.current.opacity = opacity * 0.35;
  });

  return (
    <group ref={groupRef} visible={false} renderOrder={1}>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          ref={tailRef}
          color="#b8d6ff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0.015, 0, 0.001]}>
        <sphereGeometry args={[0.018, 12, 12]} />
        <meshBasicMaterial
          ref={headRef}
          color="#ffffff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function Starfield() {
  return (
    <>
      <Stars
        radius={100}
        depth={50}
        count={3000}
        factor={4}
        saturation={0}
        fade
        speed={0.5}
      />
      <ShootingStar />
    </>
  );
}
