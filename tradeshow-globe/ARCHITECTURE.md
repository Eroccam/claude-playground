# Tradeshow Globe — Architecture Document
**Date:** February 27, 2026
**Branch:** CR-008
**Status:** Working prototype — visual layer complete, data integration pending

---

## 1. Overview

The tradeshow globe is a standalone interactive 3D globe visualization for Safran's tradeshow event portfolio. It is a separate application from the main event dashboard and currently runs independently on its own Vite dev server. The globe renders all tradeshow locations as clickable pins on a Three.js globe, organized by three global regions. Selecting a region or pin animates the camera to the appropriate view and shows event details in a side panel.

**To run:** `npm run dev` from `tradeshow-globe/` — serves at `http://localhost:5173`

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| UI framework | React | 19.2 |
| Language | TypeScript | 5.9 |
| Build tool | Vite | 7.3 |
| 3D rendering | Three.js | 0.182 |
| React/Three bridge | @react-three/fiber | 9.5 |
| Three.js helpers | @react-three/drei | 10.7 |
| Polygon triangulation | earcut | 3.0 |
| Date formatting | date-fns | 4.1 |

This project uses a **build-tool stack** (Vite + npm) — unlike every other app in the platform, which are single-file HTML with no build step. It requires `npm install` before first run.

---

## 3. Directory Structure

```
tradeshow-globe/
├── public/
│   ├── safran-logo.png          # Top-center logo overlay
│   └── vite.svg
├── src/
│   ├── main.tsx                 # React root mount
│   ├── App.tsx                  # Root layout: GlobeProvider, globe + panel
│   ├── App.css                  # Layout: .app-layout, .globe-container, .side-panel
│   ├── index.css                # Global resets, body background
│   ├── types.ts                 # TradeshowEvent, Region, AttendanceType types
│   ├── context/
│   │   └── GlobeContext.tsx     # Global state: region, selected event, filtered list
│   ├── data/
│   │   ├── events.json          # 119 tradeshow events (standalone, not shared)
│   │   └── ne_110m_admin_0_countries.json  # Natural Earth country GeoJSON (1:110m)
│   ├── components/
│   │   ├── ErrorBoundary.tsx    # React error boundary wrapper
│   │   ├── WebGLFallback.tsx    # Shown when WebGL is unavailable
│   │   ├── Globe/
│   │   │   ├── GlobeScene.tsx   # Canvas root, assembles all globe layers
│   │   │   ├── OceanSphere.tsx  # Base sphere (dark blue ocean)
│   │   │   ├── LandGlow.tsx     # Filled country polygons, region-colored
│   │   │   ├── CoastlineGlow.tsx  # Multi-pass FBO blur glow around coastlines
│   │   │   ├── Coastlines.tsx   # Sharp coastline + region-border line segments
│   │   │   ├── Atmosphere.tsx   # GLSL shader rim glow (backside sphere)
│   │   │   ├── Starfield.tsx    # Background star field (drei Stars)
│   │   │   ├── EventPins.tsx    # Manages all pins + city-clustering offsets
│   │   │   ├── EventPin.tsx     # Single pin: frustum mesh, hover/select states
│   │   │   ├── BeaconGlow.tsx   # Pulsing GLSL halo on selected event
│   │   │   ├── GlobeControls.tsx  # OrbitControls wrapper with exposed ref
│   │   │   └── CameraAnimator.tsx # Smooth spherical camera lerp on state change
│   │   └── Panel/
│   │       ├── SidePanel.tsx    # Desktop panel host (tabs + list or detail)
│   │       ├── MobileDrawer.tsx # Mobile swipe-up drawer (same content)
│   │       ├── RegionTabs.tsx   # US / EMEA / APAC tab switcher
│   │       ├── EventList.tsx    # Scrollable list of filtered events
│   │       ├── EventListItem.tsx  # Single event row with badge
│   │       ├── EventDetail.tsx  # Expanded event view with close button
│   │       ├── Panel.css        # All panel component styles
│   │       └── MobileDrawer.css # Mobile drawer styles
│   └── utils/
│       ├── coordinates.ts       # latLngToVector3() — lat/lng → Three.js Vector3
│       ├── dates.ts             # formatEventDateRange(), isPastEvent()
│       ├── geoJsonParser.ts     # GeoJSON → Three.js geometry (earcut + edge dedup)
│       ├── regions.ts           # Region detection, REGION_COLORS, REGION_BASE_COLORS
│       └── cameraTargets.ts     # Camera spherical targets per region/event, lerpSpherical()
├── package.json
├── vite.config.ts
├── tsconfig.app.json / tsconfig.json / tsconfig.node.json
└── eslint.config.js
```

---

## 4. Data Layer

### 4.1 events.json

The globe uses its own standalone data file at `src/data/events.json`. It is **not connected** to `_shared/data/master-events.json`.

**119 total events:**
- US: 54
- EMEA: 46
- APAC: 19

**Schema per event:**
```ts
{
  id: string;            // e.g. "sna2026"
  name: string;          // Full event name
  region: 'US' | 'EMEA' | 'APAC';
  city: string;
  stateProvince: string; // Optional, used for US/CA events
  country: string;
  lat: number;           // Decimal degrees
  lng: number;           // Decimal degrees
  startDate: string;     // ISO 8601 date "YYYY-MM-DD"
  endDate: string;       // ISO 8601 date "YYYY-MM-DD"
  description: string;
  eventUrl?: string;     // Optional external website link
  attendanceType: 'Exhibition' | 'Walking';
}
```

Events with non-finite lat/lng are silently filtered out at load time in `GlobeContext`.

### 4.2 ne_110m_admin_0_countries.json

Natural Earth 1:110m country polygon GeoJSON, used for:
- Rendering filled land masses (LandGlow)
- Rendering coastline and region border lines (Coastlines)
- Generating the blurred glow mask (CoastlineGlow)

This file is large and is imported as a static JSON asset bundled by Vite.

---

## 5. State Management

All application state lives in a single React context: `GlobeContext` (`src/context/GlobeContext.tsx`).

### State
| Field | Type | Default | Description |
|---|---|---|---|
| `selectedRegion` | `Region` | Auto-detected from timezone | Currently active region tab |
| `selectedEventId` | `string \| null` | `null` | ID of the selected event, if any |

### Derived values (memoized)
| Field | Description |
|---|---|
| `filteredEvents` | Events for `selectedRegion`, sorted by `startDate` then `name` |
| `selectedEvent` | Full event object for `selectedEventId`, or `null` |
| `events` | All 119 valid events (unfiltered) |

### Actions
| Action | Behavior |
|---|---|
| `setSelectedRegion(region)` | Changes region, clears selected event |
| `setSelectedEventId(id)` | Sets selected event without changing region |
| `selectEventFromPin(id, region)` | Atomically sets both region and event in the same React batch — prevents race condition where a pin click on an out-of-region event would briefly render with mismatched state |

### Region auto-detection
On first load, `detectRegionFromTimezone()` reads `Intl.DateTimeFormat().resolvedOptions().timeZone` and maps it to `US`, `EMEA`, or `APAC`. Defaults to `US` on failure.

---

## 6. Globe Rendering Architecture

The globe is rendered inside a `@react-three/fiber` `<Canvas>` component. All globe layers are assembled in `GlobeScene.tsx`. They render at specific `renderOrder` values to control transparency sorting.

### 6.1 Layer Stack (bottom to top)

| renderOrder | Component | Description |
|---|---|---|
| 0 (default) | `OceanSphere` | Solid dark blue sphere (`#0d1b3e`), radius 1.0, 64×64 segments |
| 0 (default) | `Atmosphere` | Backside sphere at 1.15× scale with GLSL rim shader — blue haze at limb |
| 10 | `LandGlow` | Filled country triangles, one mesh per region, semi-transparent (opacity 0.18). Active region uses bright color, inactive uses dark base color |
| 20 | `CoastlineGlow` | FBO-blurred halo around coastlines (see §6.3) |
| 2 | `BeaconGlow` | Pulsing radial gradient plane at selected event location |
| 30 | `Coastlines` | Line segments for coastlines and region borders, vertex-colored per region |
| 40 | `EventPins` | Tapered frustum pins per event |
| — | `Starfield` | `@react-three/drei` Stars — 3000 stars, radius 100, depth 50 |
| — | `GlobeControls` | `@react-three/drei` OrbitControls (no renderOrder) |
| — | `CameraAnimator` | Renders nothing, manages camera position via `useFrame` |

### 6.2 Atmosphere Shader

A custom GLSL fragment shader on a backside sphere at 1.15× globe radius. Intensity is computed as `pow(0.65 - dot(vNormal, cameraDir), 2.5)`, producing a bright halo at the limb that fades to nothing at the center. Uses additive blending.

### 6.3 CoastlineGlow — FBO Pipeline

The most complex rendering component. Creates a glowing halo along coastlines using a multi-pass framebuffer pipeline executed every frame in `useFrame`:

1. **Mask pass** — renders filled country polygons (by region color) into an offscreen FBO, with a black occluder sphere to hide back-hemisphere land
2. **Blur passes** — applies a 9-tap separable Gaussian blur (3 iterations) at half canvas resolution into ping-pong FBOs (blurA / blurB)
3. **Composite pass** — the blurred texture is projected back onto a sphere at radius 1.006 using screen-space UVs, blended additively over the main scene

FBOs are created lazily on the first frame and recreated when canvas dimensions change. They are disposed on component unmount.

### 6.4 LandGlow Geometry (geoJsonParser — parseBaseFill)

Country polygons are earcut-triangulated from GeoJSON in `geoJsonParser.ts`:

- Polygons are pre-sorted into US / EMEA / APAC buckets based on continent
- Each polygon is normalized (antimeridian continuity fix) and degenerate points removed before earcut
- Sliver triangles (area < 1e-6 degrees²) are discarded post-earcut
- French Guiana override: France is EMEA by continent, but its South American polygon centroid falls in the Americas longitude range, so it is reassigned to US
- Output: one `Float32Array` of pre-projected 3D vertex positions per region (no index buffer — positions are directly Triangle List)
- Placed at radius 1.003 to sit just above the ocean sphere

### 6.5 Coastlines Geometry (geoJsonParser — parseGeoJson)

Uses a two-pass edge classification algorithm on GeoJSON outer polygon rings:

- **Pass 1**: catalogue every edge with an undirected canonical key (rounded to 4 d.p. to absorb floating-point noise), tracking which regions share each edge
- **Pass 2**: emit only:
  - `count === 1` → coastline edge (shared with ocean)
  - `count >= 2` AND `regions.size >= 2` → region border (shared between different regions)
  - Suppress internal country-to-country borders within the same region
- Output: `Float32Array` of line segment endpoint pairs + per-vertex Region tag
- Placed at radius 1.008, rendered as `<lineSegments>` with vertex colors

### 6.6 EventPins

- Each pin is a tapered `CylinderGeometry` (frustum: base radius 0.005, top radius 0.002, height 0.06, 8 sides) placed at `latLngToVector3(lat, lng, 1.002)` and oriented outward using `Quaternion.setFromUnitVectors`
- **City clustering**: events sharing the same lat/lng (rounded to 2 d.p.) get radial offsets at 0.015 radius spacing to prevent stacking
- **Color states:**
  - Selected: `#55aaff`
  - Hovered: `#55aaff`
  - In active region, upcoming: `#1a6aff` (Safran blue) at 70% opacity
  - In active region, past: `#1a6aff` at 35% opacity
  - Out-of-region: `#0e4fbf` at reduced opacity
- **Selected animation**: 1.5× scale + sinusoidal pulse (`1.5 + 0.08 * sin(t * 3)`), smoothly lerps back to 1.0 on deselect

### 6.7 BeaconGlow

A billboard plane (`PlaneGeometry 1×1`) at the selected event's surface position, face-normal aligned using `setFromUnitVectors`. A GLSL fragment shader computes a radial smooth gradient keyed to a `uPulse` uniform (sinusoidal, 0–1 at 3 Hz). Uses additive blending, no depth write.

---

## 7. Coordinate System

```ts
// src/utils/coordinates.ts
function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi   = (90 - lat)   * (Math.PI / 180);   // polar angle from +Y
  const theta = (lng + 180)  * (Math.PI / 180);   // azimuth
  x = -(radius * sin(phi) * cos(theta));
  y =   radius * cos(phi);
  z =   radius * sin(phi) * sin(theta);
}
```

Three.js uses Y-up convention. The globe center is at the world origin (0, 0, 0). The orbit target is offset to `(0, 0.45, 0)` — this shifts the camera's focus point upward so the globe appears in the lower portion of the canvas, leaving the top ~20% for the Safran logo.

---

## 8. Camera System

### 8.1 GlobeControls

Wraps `@react-three/drei` `OrbitControls` with:
- Target: `(0, 0.45, 0)` (GLOBE_Y_OFFSET)
- Pan disabled
- Zoom: 1.6 – 4.0 distance
- Polar angle: 15% – 85% of π (prevents gimbal flip at poles)
- Damping: 0.08 factor
- Exposes `controls` ref via `useImperativeHandle` so `CameraAnimator` can disable/enable it during animation

### 8.2 CameraAnimator

Triggers on `selectedRegion` or `selectedEvent` change. Computes camera positions as `THREE.Spherical` coordinates, then lerps between them using ease-out cubic easing over ~0.67 seconds (progress += delta × 1.5). OrbitControls is disabled for the duration.

**Region targets** (preset lat/lng lookpoints):
| Region | Lat | Lng |
|---|---|---|
| US | 15° | −90° |
| EMEA | 25° | 15° |
| APAC | 20° | 115° |

**Event targets**: rather than aiming at the globe center from the pin direction, the camera target is computed as a ray from the orbit target `(0, 0.45, 0)` through the pin position. This ensures the selected pin appears at the visual center of the canvas (accounting for the Y offset).

**Spherical interpolation**: shortest-angle theta (wraps delta into [−π, π]) to avoid the camera spinning the long way around the globe.

---

## 9. Region Model

The globe uses a simplified 3-region model, distinct from the 4-region taxonomy in the main dashboard:

| Globe Region | Covers | Color (active) | Color (base) |
|---|---|---|---|
| US | Americas (North, South, Central America) | `#e63946` (red) | `#8c2a38` |
| EMEA | Europe, Africa, Middle East | `#9b5de5` (purple) | `#5e3890` |
| APAC | Asia, Oceania, Australia | `#06d6a0` (teal) | `#1a7a5a` |

Continent-to-region mapping happens in `geoJsonParser.ts → continentToRegion()`. The French Guiana polygon override (an EMEA-continent feature with a polygon in the Americas longitude band) reassigns it to US.

---

## 10. UI / Panel Architecture

### 10.1 Layout

The app uses absolute positioning with three overlapping layers:
1. **Globe** (`.globe-container`): `position: absolute; inset: 0` — fills the full viewport
2. **Logo** (`.top-logo`): absolute, top center, `z-index: 20`, pointer-events none
3. **Side panel** (`.side-panel`): absolute, right-anchored, `top: 25%; right: 16px; bottom: 16px; width: 400px; z-index: 10`, frosted glass (`backdrop-filter: blur(20px)`, dark semi-transparent background)

### 10.2 Desktop Panel (SidePanel)

Visible only on screens wider than 768px. Contains:
- `RegionTabs` — three equal-width tab buttons; active tab has a colored bottom border (`--tab-color` CSS variable set to the region color)
- `EventList` or `EventDetail` depending on whether an event is selected

### 10.3 Mobile Drawer (MobileDrawer)

Visible only on screens 768px and narrower. A bottom sheet that slides in/out using CSS transform. In its "closed" state it peeks up 56px (handle + label visible). Tap the handle to open to full `max-height: 70vh`. Contains the same RegionTabs + EventList/EventDetail content as the desktop panel.

### 10.4 EventListItem

Each row shows: event name, date range, location (city, state, country), and an attendance type badge (`Exhibition` in blue, `Walking` in dim). Past events are rendered at 45% opacity. Selected item has a blue left border and dark blue background tint.

### 10.5 EventDetail

Shows: event name, formatted date range, location, optional image, description text, optional "Visit Event Website" link button. Close button (×) returns to the event list by calling `setSelectedEventId(null)`.

---

## 11. Error Handling & Fallbacks

- **`ErrorBoundary`**: React class component wrapping the entire app. Catches React render errors and displays a fallback message.
- **`WebGLFallback`**: Shown by `@react-three/fiber` Canvas when WebGL is unavailable (old browser or hardware). Displays a Safran-branded message instructing the user to use a modern browser.

---

## 12. Date Utilities

`src/utils/dates.ts` provides two functions:

- `formatEventDateRange(start, end)` — produces human-readable ranges:
  - Same day: `"23 March 2026"`
  - Same month: `"23–26 March 2026"`
  - Cross-month: `"28 February – 3 March 2026"`
- `isPastEvent(endDate)` — returns `true` if endDate is before `new Date()` (used to dim past pins and list items)

---

## 13. What Is Not Yet Built

The following capabilities are absent from the current implementation:

| Gap | Notes |
|---|---|
| Data connection to master-events.json | Uses its own `src/data/events.json` with a simpler schema. No link to `_shared/data/master-events.json` or the serve.js API |
| Pin color-coding by event status | All pins render in Safran blue regardless of status (upcoming / active / past only affects opacity) |
| Filter by year or event type | No filter controls exist beyond region tabs |
| Attendance type filter | Badge shown in list but not filterable |
| Deadlines and contacts in detail view | `TradeshowEvent` type has no deadline or contact fields |
| Timeline view | Not implemented |
| PDF / PNG export | Not implemented |
| Search | No text search within events |
| Booth / venue information | Not in the data schema |
| Connection to the research agent proposals | No proposal or approval data surfaced |
| Sub-region model (US & Canada, Latin America, etc.) | Globe uses a single "US" bucket for all Americas |
| Event count / summary header in panel | Panel shows no aggregate statistics |
