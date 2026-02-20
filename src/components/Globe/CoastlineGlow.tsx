import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import geojsonData from '../../data/ne_110m_admin_0_countries.json';
import { parseBaseFill } from '../../utils/geoJsonParser.ts';
import { REGION_COLORS } from '../../utils/regions.ts';
import type { Region } from '../../types.ts';

const REGIONS: Region[] = ['US', 'EMEA', 'APAC'];

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const blurVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 9-tap Gaussian blur (separable)
const blurFrag = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 uDirection;
  varying vec2 vUv;
  void main() {
    vec4 sum = texture2D(tInput, vUv) * 0.227027;
    sum += texture2D(tInput, vUv + uDirection * 1.0) * 0.194596;
    sum += texture2D(tInput, vUv - uDirection * 1.0) * 0.194596;
    sum += texture2D(tInput, vUv + uDirection * 2.0) * 0.121621;
    sum += texture2D(tInput, vUv - uDirection * 2.0) * 0.121621;
    sum += texture2D(tInput, vUv + uDirection * 3.0) * 0.054054;
    sum += texture2D(tInput, vUv - uDirection * 3.0) * 0.054054;
    sum += texture2D(tInput, vUv + uDirection * 4.0) * 0.016216;
    sum += texture2D(tInput, vUv - uDirection * 4.0) * 0.016216;
    gl_FragColor = sum;
  }
`;

// Projects the blurred halo onto the globe sphere via screen-space UVs
const compositeVert = /* glsl */ `
  varying vec4 vClipPos;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vClipPos = gl_Position;
  }
`;

// Simple additive blend of the blurred halo — outer glow is visible
// against the dark ocean; interior is additive-brightened under LandGlow
const compositeFrag = /* glsl */ `
  uniform sampler2D tBlur;
  uniform float uIntensity;
  varying vec4 vClipPos;
  void main() {
    vec2 uv = (vClipPos.xy / vClipPos.w) * 0.5 + 0.5;
    vec4 blur = texture2D(tBlur, uv);
    gl_FragColor = vec4(blur.rgb * uIntensity, blur.a);
  }
`;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BLUR_ITERATIONS = 3;
const FBO_SCALE = 0.5;   // blur FBOs at half-res for performance
const GLOW_INTENSITY = 1.2;


// ---------------------------------------------------------------------------
// FBO bundle
// ---------------------------------------------------------------------------
interface FBOBundle {
  mask:  THREE.WebGLRenderTarget;
  blurA: THREE.WebGLRenderTarget;
  blurB: THREE.WebGLRenderTarget;
}

function createFBOs(w: number, h: number, bw: number, bh: number): FBOBundle {
  const opts = {
    format:    THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  };
  return {
    mask:  new THREE.WebGLRenderTarget(w,  h,  opts),
    blurA: new THREE.WebGLRenderTarget(bw, bh, opts),
    blurB: new THREE.WebGLRenderTarget(bw, bh, opts),
  };
}

function disposeFBOs(fbos: FBOBundle | null) {
  if (!fbos) return;
  fbos.mask.dispose();
  fbos.blurA.dispose();
  fbos.blurB.dispose();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CoastlineGlow() {
  // ---- Land mask geometry (parsed once, pre-merged by region) ----
  const regionFills = useMemo(() => parseBaseFill(geojsonData as never, 1.003), []);

  // ---- Offscreen mask scene: one mesh per region with uniform region color ----
  const maskScene = useMemo(() => {
    const scene = new THREE.Scene();
    // Occluder: blocks far-hemisphere land from appearing in the FBO.
    // Without this, land at r=1.003 on the back of the globe is visible at
    // screen positions where the near hemisphere has ocean, and the blurred
    // result composites far-side country patterns onto the near hemisphere.
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 64, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    ));
    for (const region of REGIONS) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(regionFills[region], 3));
      const mat = new THREE.MeshBasicMaterial({ color: REGION_COLORS[region], side: THREE.FrontSide });
      scene.add(new THREE.Mesh(geo, mat));
    }
    return scene;
  }, [regionFills]);

  // ---- Blur pass infrastructure (no WebGL framebuffer resources here) ----
  const blurQuadGeo = useMemo(() => new THREE.PlaneGeometry(2, 2), []);
  const blurCamera  = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  const blurHMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   blurVert,
    fragmentShader: blurFrag,
    uniforms: {
      tInput:     { value: null },
      uDirection: { value: new THREE.Vector2(1, 0) },
    },
  }), []);

  const blurVMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   blurVert,
    fragmentShader: blurFrag,
    uniforms: {
      tInput:     { value: null },
      uDirection: { value: new THREE.Vector2(0, 1) },
    },
  }), []);

  const blurHScene = useMemo(() => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(blurQuadGeo, blurHMat));
    return scene;
  }, [blurQuadGeo, blurHMat]);

  const blurVScene = useMemo(() => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(blurQuadGeo, blurVMat));
    return scene;
  }, [blurQuadGeo, blurVMat]);

  // ---- Composite material (attaches to the sphere in JSX) ----
  const compositeMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   compositeVert,
    fragmentShader: compositeFrag,
    transparent:    true,
    depthWrite:     false,
    depthTest:      false,
    blending:       THREE.AdditiveBlending,
    side:           THREE.FrontSide,
    uniforms: {
      tBlur:      { value: null },
      uIntensity: { value: GLOW_INTENSITY },
    },
  }), []);

  // ---- FBOs: lazily created inside useFrame to survive React Strict Mode ----
  // Strict Mode disposes useMemo-created render targets via useEffect cleanup,
  // leaving stale references. Creating them lazily in useFrame avoids this:
  // the ref is null after cleanup and fresh FBOs are built on the next frame.
  const fbosRef    = useRef<FBOBundle | null>(null);
  const prevSize   = useRef({ w: 0, h: 0 });
  const savedColor = useMemo(() => new THREE.Color(), []);

  // Dispose FBOs when the component unmounts
  useEffect(() => {
    return () => {
      disposeFBOs(fbosRef.current);
      fbosRef.current = null;
    };
  }, []);

  // ---- Per-frame FBO pipeline ----
  useFrame((state) => {
    const { gl, camera, size } = state;

    // Bail out if WebGL context is lost
    if (gl.getContext().isContextLost()) return;

    const dpr = gl.getPixelRatio();
    const w   = Math.max(1, Math.floor(size.width  * dpr));
    const h   = Math.max(1, Math.floor(size.height * dpr));
    const bw  = Math.max(1, Math.floor(w * FBO_SCALE));
    const bh  = Math.max(1, Math.floor(h * FBO_SCALE));

    // Create or resize FBOs when canvas dimensions change
    const prev = prevSize.current;
    if (!fbosRef.current || prev.w !== w || prev.h !== h) {
      disposeFBOs(fbosRef.current);
      fbosRef.current  = createFBOs(w, h, bw, bh);
      prevSize.current = { w, h };
      blurHMat.uniforms.uDirection.value.set(1.0 / bw, 0);
      blurVMat.uniforms.uDirection.value.set(0, 1.0 / bh);
    }

    const { mask, blurA, blurB } = fbosRef.current;

    // Save renderer state
    const prevRT        = gl.getRenderTarget();
    const prevAutoClear = gl.autoClear;
    gl.getClearColor(savedColor);
    const prevAlpha = gl.getClearAlpha();
    gl.autoClear = false;

    try {
      // Pass 1: render land with region colors into mask FBO
      gl.setRenderTarget(mask);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, true, false);
      gl.render(maskScene, camera);

      // Pass 2: iterative separable Gaussian blur
      let input: THREE.WebGLRenderTarget = mask;
      for (let i = 0; i < BLUR_ITERATIONS; i++) {
        blurHMat.uniforms.tInput.value = input.texture;
        gl.setRenderTarget(blurA);
        gl.clear(true, false, false);
        gl.render(blurHScene, blurCamera);

        blurVMat.uniforms.tInput.value = blurA.texture;
        gl.setRenderTarget(blurB);
        gl.clear(true, false, false);
        gl.render(blurVScene, blurCamera);

        input = blurB;
      }

      // Pass 3: hand the blurred texture to the composite sphere
      compositeMat.uniforms.tBlur.value = blurB.texture;
    } catch (e) {
      console.error('[CoastlineGlow] FBO pass failed:', e);
    } finally {
      // Always restore renderer state so the main scene can render
      gl.setRenderTarget(prevRT);
      gl.setClearColor(savedColor, prevAlpha);
      gl.autoClear = prevAutoClear;
    }
  }, -1);

  // The sphere sits just outside the globe; its shader projects the blurred
  // halo back onto screen space, creating the glowing coastline outline.
  return (
    <mesh material={compositeMat} renderOrder={20}>
      <sphereGeometry args={[1.006, 64, 32]} />
    </mesh>
  );
}
