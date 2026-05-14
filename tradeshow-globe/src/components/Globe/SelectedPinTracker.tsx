import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGlobe } from '../../context/globeContext.ts';
import { latLngToVector3 } from '../../utils/coordinates.ts';

const PIN_RADIUS = 1.006;
const GLOBE_RADIUS = 1;
const WORLD_ORIGIN = new THREE.Vector3(0, 0, 0);

export interface SelectedPinScreenEventDetail {
  x: number;
  y: number;
  visible: boolean;
}

export function SelectedPinTracker() {
  const { selectedEvent } = useGlobe();
  const { camera, size } = useThree();
  const projected = new THREE.Vector3();

  useFrame(() => {
    if (!selectedEvent || selectedEvent.hasPin === false) {
      window.dispatchEvent(new CustomEvent<SelectedPinScreenEventDetail>('selected-pin-screen', {
        detail: { x: 0, y: 0, visible: false },
      }));
      return;
    }

    const surfacePos = latLngToVector3(selectedEvent.lat, selectedEvent.lng, PIN_RADIUS);
    const cameraToPin = surfacePos.clone().sub(camera.position);
    const cameraToCenter = WORLD_ORIGIN.clone().sub(camera.position);
    const closestT = THREE.MathUtils.clamp(
      cameraToCenter.dot(cameraToPin) / cameraToPin.lengthSq(),
      0,
      1,
    );
    const closest = camera.position.clone().add(cameraToPin.multiplyScalar(closestT));
    const occludedByGlobe = closest.distanceTo(WORLD_ORIGIN) < GLOBE_RADIUS;

    projected.copy(surfacePos).project(camera);
    const onScreen = projected.z < 1
      && projected.x >= -1.1
      && projected.x <= 1.1
      && projected.y >= -1.1
      && projected.y <= 1.1;

    window.dispatchEvent(new CustomEvent<SelectedPinScreenEventDetail>('selected-pin-screen', {
      detail: {
        x: ((projected.x + 1) / 2) * size.width,
        y: ((1 - projected.y) / 2) * size.height,
        visible: onScreen && !occludedByGlobe,
      },
    }));
  });

  return null;
}
