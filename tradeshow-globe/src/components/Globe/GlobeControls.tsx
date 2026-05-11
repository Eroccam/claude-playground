import { OrbitControls } from '@react-three/drei';
import { useRef, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GLOBE_Y_OFFSET } from '../../utils/cameraTargets.ts';

export interface GlobeControlsHandle {
  controls: OrbitControlsImpl | null;
}

export const GlobeControls = forwardRef<GlobeControlsHandle>(function GlobeControls(_, ref) {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useImperativeHandle(ref, () => ({
    get controls() {
      return controlsRef.current;
    },
  }));

  return (
    <OrbitControls
      ref={controlsRef}
      target={new THREE.Vector3(0, GLOBE_Y_OFFSET, 0)}
      enableZoom
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      minDistance={1.6}
      maxDistance={4.0}
      minPolarAngle={Math.PI * 0.15}
      maxPolarAngle={Math.PI * 0.85}
    />
  );
});
