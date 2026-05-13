import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGlobe } from '../../context/globeContext.ts';
import { getRegionCameraTarget, getEventCameraTarget, lerpSpherical, GLOBE_Y_OFFSET } from '../../utils/cameraTargets.ts';
import type { GlobeControlsHandle } from './GlobeControls.tsx';

const TARGET = new THREE.Vector3(0, GLOBE_Y_OFFSET, 0);

interface CameraAnimatorProps {
  controlsRef: React.RefObject<GlobeControlsHandle | null>;
}

export function CameraAnimator({ controlsRef }: CameraAnimatorProps) {
  const { selectedRegion, selectedEvent } = useGlobe();
  const { camera } = useThree();

  const animating = useRef(false);
  const progress = useRef(0);
  const fromSpherical = useRef(new THREE.Spherical());
  const toSpherical = useRef(new THREE.Spherical());

  // Trigger animation when region or event changes
  const prevRegion = useRef(selectedRegion);
  const prevEventId = useRef(selectedEvent?.id ?? null);

  useEffect(() => {
    const regionChanged = prevRegion.current !== selectedRegion;
    const eventChanged = prevEventId.current !== (selectedEvent?.id ?? null);

    if (!regionChanged && !eventChanged) return;

    prevRegion.current = selectedRegion;
    prevEventId.current = selectedEvent?.id ?? null;

    // Compute current camera spherical (relative to offset target)
    fromSpherical.current.setFromVector3(camera.position.clone().sub(TARGET));

    // Compute target
    if (selectedEvent) {
      toSpherical.current = getEventCameraTarget(selectedEvent.lat, selectedEvent.lng);
    } else {
      toSpherical.current = getRegionCameraTarget(selectedRegion);
    }

    progress.current = 0;
    animating.current = true;

    // Disable controls during animation
    if (controlsRef.current?.controls) {
      controlsRef.current.controls.enabled = false;
    }
  }, [selectedRegion, selectedEvent, camera, controlsRef]);

  useFrame((_, delta) => {
    if (!animating.current) return;

    // Smooth ease-out over ~1 second
    progress.current = Math.min(1, progress.current + delta * 1.5);
    const t = 1 - Math.pow(1 - progress.current, 3); // ease-out cubic

    const interpolated = lerpSpherical(fromSpherical.current, toSpherical.current, t);
    const newPos = new THREE.Vector3().setFromSpherical(interpolated).add(TARGET);

    camera.position.copy(newPos);
    camera.lookAt(TARGET);

    if (controlsRef.current?.controls) {
      controlsRef.current.controls.target.copy(TARGET);
    }

    if (progress.current >= 1) {
      animating.current = false;
      if (controlsRef.current?.controls) {
        controlsRef.current.controls.enabled = true;
      }
    }
  });

  return null;
}
