import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { TradeshowEvent } from '../../types.ts';
import { latLngToVector3 } from '../../utils/coordinates.ts';
import { isPastEvent } from '../../utils/dates.ts';

const SAFRAN_BLUE = '#1a6aff';
const SAFRAN_BLUE_MID = '#0e4fbf';
const SEARCH_GREEN = '#39d98a';
const PIN_HEIGHT = 0.06;
const BASE_RADIUS = 0.005;
const TOP_RADIUS = 0.002;

interface EventPinProps {
  event: TradeshowEvent;
  isSelected: boolean;
  isInSelectedRegion: boolean;
  isSearchMode: boolean;
  isSearchMatch: boolean;
  offset: THREE.Vector3;
  onClick: () => void;
}

export function EventPin({ event, isSelected, isInSelectedRegion, isSearchMode, isSearchMatch, offset, onClick }: EventPinProps) {
  const groupRef = useRef<THREE.Group>(null);
  const visibleRef = useRef(true);
  const [hovered, setHovered] = useState(false);

  const past = isPastEvent(event.endDate);
  const baseOpacity = past ? 0.35 : 0.7;

  // Region-aware brightness (CR-014 + CR-021/022: beacon look)
  const regionOpacity = isInSelectedRegion ? baseOpacity : baseOpacity * 0.6;
  const searchOpacity = isSearchMatch ? 0.92 : 0.18;
  const pinOpacity = isSelected ? 0.95 : isSearchMode ? searchOpacity : regionOpacity;
  const pinColor = isSelected
    ? '#55aaff'
    : hovered
      ? '#55aaff'
      : isSearchMode && isSearchMatch
        ? SEARCH_GREEN
        : isInSelectedRegion
          ? SAFRAN_BLUE
          : SAFRAN_BLUE_MID;

  // Position and orientation
  const surfacePos = latLngToVector3(event.lat, event.lng, 1.006);
  surfacePos.add(offset);
  const normal = surfacePos.clone().normalize();

  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

  // CR-013: 1.5x scale + pulse for selected pin
  // Back-face culling: hide pins on the far side of the globe
  useFrame(({ camera, clock }) => {
    if (!groupRef.current) return;
    visibleRef.current = camera.position.dot(normal) > 0;
    groupRef.current.visible = visibleRef.current;
    if (!visibleRef.current) return;
    if (isSelected) {
      const pulse = 1.5 + 0.08 * Math.sin(clock.elapsedTime * 3);
      groupRef.current.scale.setScalar(pulse);
    } else {
      const s = groupRef.current.scale.x;
      if (Math.abs(s - 1) > 0.001) {
        groupRef.current.scale.setScalar(THREE.MathUtils.lerp(s, 1, 0.1));
      } else if (s !== 1) {
        groupRef.current.scale.setScalar(1);
      }
    }
  });

  return (
    <group
      ref={groupRef}
      position={surfacePos}
      quaternion={quaternion}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
    >
      {/* Frustum: flat top, tapered sides */}
      <mesh position={[0, PIN_HEIGHT / 2, 0]} renderOrder={5}>
        <cylinderGeometry args={[TOP_RADIUS, BASE_RADIUS, PIN_HEIGHT, 8]} />
        <meshBasicMaterial
          color={pinColor}
          transparent
          opacity={pinOpacity}
        />
      </mesh>
    </group>
  );
}
