import * as THREE from 'three';
import type { Region } from '../types.ts';
import { latLngToVector3 } from './coordinates.ts';

/** Lat/lng presets for each region view */
const REGION_TARGETS: Record<Region, { lat: number; lng: number }> = {
  US: { lat: 15, lng: -90 },
  EMEA: { lat: 25, lng: 15 },
  APAC: { lat: 20, lng: 115 },
};

const CAMERA_DISTANCE = 2.5;
const EVENT_CAMERA_DISTANCE = 2.2;

/**
 * Vertical offset applied to the orbit target so the globe
 * sits below center, reserving ~20% at the top for a logo.
 * Positive value = camera looks above globe center = globe appears lower.
 */
export const GLOBE_Y_OFFSET = 0.45;

/**
 * Convert lat/lng to a THREE.Spherical by going through latLngToVector3
 * so the camera target matches exactly where pins are placed.
 */
function latLngToCameraSpherical(lat: number, lng: number, distance: number): THREE.Spherical {
  const dir = latLngToVector3(lat, lng, 1).normalize();
  const pos = dir.multiplyScalar(distance);
  const spherical = new THREE.Spherical();
  spherical.setFromVector3(pos);
  return spherical;
}

export function getRegionCameraTarget(region: Region): THREE.Spherical {
  const { lat, lng } = REGION_TARGETS[region];
  return latLngToCameraSpherical(lat, lng, CAMERA_DISTANCE);
}

export function getEventCameraTarget(lat: number, lng: number): THREE.Spherical {
  // The orbit target is T = (0, GLOBE_Y_OFFSET, 0) but the pin is on the
  // globe centered at origin. For the pin to appear at screen center, the
  // camera must lie on the ray from T through the pin position.
  const pinPos = latLngToVector3(lat, lng, 1);
  const target = new THREE.Vector3(0, GLOBE_Y_OFFSET, 0);
  const dir = pinPos.clone().sub(target).normalize();
  // Camera position = target + dir * distance (relative to target for spherical)
  const cameraRel = dir.multiplyScalar(EVENT_CAMERA_DISTANCE);
  const spherical = new THREE.Spherical();
  spherical.setFromVector3(cameraRel);
  return spherical;
}

/**
 * Lerp between two spherical coordinates with shortest-angle theta interpolation.
 */
export function lerpSpherical(
  from: THREE.Spherical,
  to: THREE.Spherical,
  t: number,
): THREE.Spherical {
  const radius = THREE.MathUtils.lerp(from.radius, to.radius, t);
  const phi = THREE.MathUtils.lerp(from.phi, to.phi, t);

  // Shortest angle for theta
  let dTheta = to.theta - from.theta;
  if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
  if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
  const theta = from.theta + dTheta * t;

  return new THREE.Spherical(radius, phi, theta);
}
