import { useMemo } from 'react';
import * as THREE from 'three';
import { useGlobe } from '../../context/globeContext.ts';
import { EventPin } from './EventPin.tsx';

/**
 * Compute small radial offsets for events sharing the same city
 * so pins don't stack on top of each other.
 */
function computeOffsets(events: { lat: number; lng: number; id: string }[]): Map<string, THREE.Vector3> {
  const offsets = new Map<string, THREE.Vector3>();
  const cityGroups = new Map<string, string[]>();

  for (const e of events) {
    const key = `${e.lat.toFixed(2)},${e.lng.toFixed(2)}`;
    if (!cityGroups.has(key)) cityGroups.set(key, []);
    cityGroups.get(key)!.push(e.id);
  }

  for (const [, ids] of cityGroups) {
    if (ids.length === 1) {
      offsets.set(ids[0], new THREE.Vector3(0, 0, 0));
    } else {
      const spreadRadius = 0.015;
      ids.forEach((id, i) => {
        const angle = (2 * Math.PI * i) / ids.length;
        offsets.set(id, new THREE.Vector3(
          Math.cos(angle) * spreadRadius,
          0,
          Math.sin(angle) * spreadRadius,
        ));
      });
    }
  }

  return offsets;
}

export function EventPins() {
  const { events, selectedRegion, selectedEventId, selectEventFromPin } = useGlobe();

  const offsets = useMemo(() => computeOffsets(events), [events]);

  return (
    <group>
      {events.map((event) => (
        <EventPin
          key={event.id}
          event={event}
          isSelected={event.id === selectedEventId}
          isInSelectedRegion={event.region === selectedRegion}
          offset={offsets.get(event.id) ?? new THREE.Vector3()}
          onClick={() => {
            if (event.id !== selectedEventId) selectEventFromPin(event.id, event.region);
          }}
        />
      ))}
    </group>
  );
}
