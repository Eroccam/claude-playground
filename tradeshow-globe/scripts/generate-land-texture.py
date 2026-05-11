#!/usr/bin/env python3
"""
Generate a 4096×2048 equirectangular land fill texture.
Reads:  src/data/ne_110m_admin_0_countries.json
Output: public/land-fill.png

Run from any directory:
    python scripts/generate-land-texture.py
"""

import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import PathPatch
from matplotlib.path import Path as MplPath

# ---------------------------------------------------------------------------
# Region colours (mirrors regions.ts base colours)
# ---------------------------------------------------------------------------
REGION_COLORS = {
    'US':   '#e63946',
    'EMEA': '#9b5de5',
    'APAC': '#06d6a0',
}

SKIP_CONTINENTS = {'Seven seas (open ocean)', 'Antarctica'}

# ---------------------------------------------------------------------------
# Region classification — mirrors geoJsonParser.ts / preprocess-land.mjs
# ---------------------------------------------------------------------------
def continent_to_region(continent: str) -> str:
    if continent in ('North America', 'South America', 'Central America'):
        return 'US'
    if continent in ('Europe', 'Africa'):
        return 'EMEA'
    if continent in ('Asia', 'Oceania', 'Australia and New Zealand'):
        return 'APAC'
    return 'EMEA'


def polygon_is_in_americas(ring: list) -> bool:
    n = max(len(ring) - 1, 1)
    avg_lng = sum(p[0] for p in ring[:n]) / n
    avg_lat = sum(p[1] for p in ring[:n]) / n
    return -170 < avg_lng < -30 and -60 < avg_lat < 80


def get_region(continent: str, outer_ring: list) -> str:
    base = continent_to_region(continent)
    # French Guiana override: European feature whose polygon is in the Americas
    if base == 'EMEA' and polygon_is_in_americas(outer_ring):
        return 'US'
    return base

# ---------------------------------------------------------------------------
# Antimeridian unwrapping — same logic as normalizeRing in the JS scripts
# ---------------------------------------------------------------------------
def normalize_ring(ring: list) -> list:
    result = []
    prev_lng = ring[0][0]
    for pt in ring:
        lng = pt[0]
        while lng - prev_lng >  180: lng -= 360
        while lng - prev_lng < -180: lng += 360
        prev_lng = lng
        result.append((lng, pt[1]))
    return result

# ---------------------------------------------------------------------------
# Build a matplotlib compound path from an outer ring + optional hole rings
# ---------------------------------------------------------------------------
def make_path(outer: list, holes: list) -> MplPath | None:
    def ring_verts_codes(ring):
        # Drop duplicate closing vertex if present
        pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
        if len(pts) < 3:
            return None, None
        verts = list(pts) + [(0.0, 0.0)]          # dummy vertex for CLOSEPOLY
        codes = ([MplPath.MOVETO]
                 + [MplPath.LINETO] * (len(pts) - 1)
                 + [MplPath.CLOSEPOLY])
        return verts, codes

    all_verts, all_codes = [], []

    verts, codes = ring_verts_codes(outer)
    if verts is None:
        return None
    all_verts.extend(verts)
    all_codes.extend(codes)

    for hole in holes:
        verts, codes = ring_verts_codes(hole)
        if verts is not None:
            all_verts.extend(verts)
            all_codes.extend(codes)

    return MplPath(all_verts, all_codes)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
script_dir   = Path(__file__).resolve().parent
root_dir     = script_dir.parent
geojson_path = root_dir / 'src' / 'data' / 'ne_110m_admin_0_countries.json'
output_path  = root_dir / 'public' / 'land-fill.png'

# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------
with open(geojson_path) as f:
    geojson = json.load(f)

# ---------------------------------------------------------------------------
# Figure setup: 4096×2048, Plate Carrée (equirectangular), transparent bg
# Matplotlib saves images with y=0 at top, so lat 90 → row 0 which matches
# Three.js SphereGeometry UV where V=0 is the north pole.
# ---------------------------------------------------------------------------
WIDTH, HEIGHT = 4096, 2048
DPI = 100

fig = plt.figure(figsize=(WIDTH / DPI, HEIGHT / DPI), dpi=DPI)
ax  = fig.add_axes([0, 0, 1, 1])   # axes fills entire figure — no margins

fig.patch.set_alpha(0.0)
ax.set_facecolor((0, 0, 0, 0))
ax.set_xlim(-180, 180)
ax.set_ylim(-90, 90)
ax.set_aspect('equal')
ax.axis('off')

# ---------------------------------------------------------------------------
# Draw polygons
# ---------------------------------------------------------------------------
drawn = skipped = 0

for feature in geojson['features']:
    continent = feature['properties'].get('CONTINENT', '')
    if continent in SKIP_CONTINENTS:
        continue

    geo   = feature['geometry']
    polys = (geo['coordinates'] if geo['type'] == 'MultiPolygon'
             else [geo['coordinates']])

    for polygon in polys:
        outer_raw = polygon[0]
        if len(outer_raw) < 3:
            skipped += 1
            continue

        region = get_region(continent, outer_raw)
        color  = REGION_COLORS[region]

        outer = normalize_ring(outer_raw)
        holes = [normalize_ring(h) for h in polygon[1:]]

        path = make_path(outer, holes)
        if path is None:
            skipped += 1
            continue

        ax.add_patch(PathPatch(path, facecolor=color, edgecolor='none', linewidth=0))
        drawn += 1

# ---------------------------------------------------------------------------
# Save
# ---------------------------------------------------------------------------
output_path.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(output_path, dpi=DPI, transparent=True, bbox_inches=None, pad_inches=0)
plt.close(fig)

print(f'Polygons drawn : {drawn}')
print(f'Skipped        : {skipped}')
print(f'Output         : {output_path}')
print(f'Size           : {WIDTH}×{HEIGHT} px')
