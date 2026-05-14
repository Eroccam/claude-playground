import { useMemo, useRef } from 'react';
import { Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const STARFIELD_RADIUS = 100;
const MIN_INTERVAL_SECONDS = 15;
const MAX_INTERVAL_SECONDS = 25;
const TRAIL_DURATION_SECONDS = 1.05;

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function ShootingStar() {
  const groupRef = useRef<THREE.Group>(null);
  const headMeshRef = useRef<THREE.Mesh>(null);
  const tailMeshRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.MeshBasicMaterial>(null);
  const tailRef = useRef<THREE.MeshBasicMaterial>(null);
  const nextLaunchRef = useRef(randomRange(MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS));
  const activeSinceRef = useRef<number | null>(null);
  const startRef = useRef(new THREE.Vector3());
  const endRef = useRef(new THREE.Vector3());
  const trailLengthRef = useRef(5.2);
  const headSizeRef = useRef(0.22);
  const speedRef = useRef(1);
  const angleRef = useRef(0);
  const { camera, size } = useThree();

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-1, 0.045);
    shape.lineTo(-1, -0.045);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);

  const scheduleNext = (now: number) => {
    activeSinceRef.current = null;
    nextLaunchRef.current = now + randomRange(MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS);
    if (groupRef.current) groupRef.current.visible = false;
  };

  const projectToStarfield = (point: THREE.Vector3) => {
    return point
      .sub(camera.position)
      .normalize()
      .multiplyScalar(STARFIELD_RADIUS)
      .add(camera.position);
  };

  const launch = (now: number) => {
    const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov ?? 50);
    const viewportHeight = 2 * Math.tan(fov / 2) * STARFIELD_RADIUS;
    const viewportWidth = viewportHeight * (size.width / size.height);
    const startX = randomRange(-0.62, 0.62) * viewportWidth;
    const startY = randomRange(0.18, 0.58) * viewportHeight;
    const angle = THREE.MathUtils.degToRad(randomRange(-15, -34));
    const distance = randomRange(0.24, 0.36) * viewportWidth;
    const direction = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();

    camera.getWorldDirection(forward);
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

    startRef.current
      .copy(camera.position)
      .addScaledVector(forward, STARFIELD_RADIUS)
      .addScaledVector(right, startX)
      .addScaledVector(up, startY);
    projectToStarfield(startRef.current);

    endRef.current
      .copy(startRef.current)
      .addScaledVector(right, direction.x * distance)
      .addScaledVector(up, direction.y * distance);
    projectToStarfield(endRef.current);

    trailLengthRef.current = randomRange(4.2, 6.4);
    headSizeRef.current = randomRange(0.18, 0.26);
    speedRef.current = randomRange(0.9, 1.2);
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
    }

    if (tailMeshRef.current) tailMeshRef.current.scale.set(trailLengthRef.current, 1, 1);
    if (headMeshRef.current) {
      headMeshRef.current.scale.setScalar(headSizeRef.current);
    }
    if (headRef.current) headRef.current.opacity = opacity * 0.9;
    if (tailRef.current) tailRef.current.opacity = opacity * 0.55;
  });

  return (
    <group ref={groupRef} visible={false} renderOrder={1}>
      <mesh ref={tailMeshRef} geometry={geometry}>
        <meshBasicMaterial
          ref={tailRef}
          color="#b8d6ff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={headMeshRef} position={[0.05, 0, 0.001]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          ref={headRef}
          color="#ffffff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          depthTest
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
