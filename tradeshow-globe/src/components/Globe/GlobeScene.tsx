import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OceanSphere } from './OceanSphere.tsx';
import { Starfield } from './Starfield.tsx';
import { GlobeControls } from './GlobeControls.tsx';
import type { GlobeControlsHandle } from './GlobeControls.tsx';
import { Coastlines } from './Coastlines.tsx';
import { CountryBorders } from './CountryBorders.tsx';
import { LandGlow } from './LandGlow.tsx';
import { Atmosphere } from './Atmosphere.tsx';
import { EventPins } from './EventPins.tsx';
import { BeaconGlow } from './BeaconGlow.tsx';
import { OrbitingSatellite } from './OrbitingSatellite.tsx';
import { CameraAnimator } from './CameraAnimator.tsx';
import { SelectedPinTracker } from './SelectedPinTracker.tsx';
import { WebGLFallback } from '../WebGLFallback.tsx';
import { useGlobe } from '../../context/globeContext.ts';
import { GLOBE_Y_OFFSET } from '../../utils/cameraTargets.ts';

function Scene() {
  const { selectedRegion, selectedEvent, isSearchMode, isCalendarMode } = useGlobe();
  const controlsRef = useRef<GlobeControlsHandle>(null);
  const showRegionFill = !isCalendarMode && (!isSearchMode || Boolean(selectedEvent));

  return (
    <>
      <OceanSphere />
      <Atmosphere />
      <LandGlow highlightedRegion={selectedRegion} visible={showRegionFill} />
      <CountryBorders />
      <Coastlines />
      <Starfield />
      <OrbitingSatellite />
      <EventPins />
      <BeaconGlow />
      <GlobeControls ref={controlsRef} />
      <CameraAnimator controlsRef={controlsRef} />
      <SelectedPinTracker />
    </>
  );
}

export function GlobeScene() {
  return (
    <Canvas
      camera={{ position: [0, GLOBE_Y_OFFSET, 2.5], fov: 50 }}
      style={{ background: '#0a0a1a' }}
      fallback={<WebGLFallback />}
      onError={(e) => console.error('[Canvas] scene error:', e)}
      onCreated={({ gl }) => console.log('[Canvas] WebGL context created, renderer:', gl.getContext().constructor.name)}
    >
      <Scene />
    </Canvas>
  );
}
