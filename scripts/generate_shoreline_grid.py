#!/usr/bin/env python3
"""Standalone AU shoreline grid generator v2 (state-split, compact output)."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import geopandas as gpd
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, Point, box
from shapely.strtree import STRtree
from tqdm import tqdm

EPSG_WGS84 = "EPSG:4326"
EPSG_AU_PROJECTED = "EPSG:3577"
AU_BOUNDS_WGS84 = (112.0, -44.0, 154.0, -10.0)  # lon_min, lat_min, lon_max, lat_max

STATE_BBOXES = [
    ("TAS", (-44.5, -39.0, 143.0, 149.0)),
    ("VIC", (-39.5, -33.8, 140.0, 150.5)),
    ("NSW", (-37.5, -28.0, 141.0, 154.5)),
    ("QLD", (-29.5, -10.0, 137.0, 154.5)),
    ("SA", (-38.5, -25.5, 129.0, 141.5)),
    ("WA", (-35.5, -10.0, 112.0, 129.5)),
    ("NT", (-26.5, -10.0, 129.0, 138.5)),
]
STATE_ORDER = [s for s, _ in STATE_BBOXES]

# Coarse coastal windows (lat_min, lat_max, lon_min, lon_max) used to skip deep inland cells.
# These are intentionally generous to keep coastline coverage while improving generation speed.
STATE_COASTAL_WINDOWS = {
    "TAS": [(-44.5, -39.0, 143.0, 149.0)],
    "VIC": [(-39.5, -33.8, 140.0, 146.8), (-39.5, -37.8, 146.8, 150.5)],
    "NSW": [(-37.5, -28.0, 149.0, 154.5)],
    "QLD": [(-29.5, -10.0, 142.5, 154.5), (-13.5, -10.0, 137.0, 142.5)],
    "SA": [(-38.5, -31.5, 135.0, 141.5), (-35.5, -25.5, 129.0, 136.0)],
    "WA": [(-35.5, -22.0, 114.0, 129.5), (-22.0, -10.0, 120.0, 129.5)],
    "NT": [(-26.5, -10.0, 129.0, 138.5)],
}


@dataclass
class SegmentInfo:
    geom: LineString
    shoreline_bearing_deg: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate AU shoreline lookup grid (state-split).")
    parser.add_argument("--input", required=True, help="Coastline input file path.")
    parser.add_argument("--output-dir", required=True, help="Output directory for per-state files.")
    parser.add_argument("--resolution", type=float, default=0.01, help="Grid resolution in degrees (default: 0.01).")
    parser.add_argument("--max-distance-km", type=float, default=25.0, help="Max coastline distance (default: 25km).")
    parser.add_argument("--land-polygon", default=None, help="Optional land polygon path.")
    parser.add_argument("--source-licence", default="Unknown", help="Source licence string.")
    parser.add_argument(
        "--state",
        default=None,
        choices=[s.lower() for s in STATE_ORDER],
        help="Optional single state code to generate (vic|nsw|qld|sa|wa|tas|nt).",
    )
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    input_path = Path(args.input)
    if not input_path.exists() or not input_path.is_file():
        raise FileNotFoundError(f"Input not found: {input_path}")
    if args.land_polygon:
        land_path = Path(args.land_polygon)
        if not land_path.exists() or not land_path.is_file():
            raise FileNotFoundError(f"Land polygon not found: {land_path}")
    if args.resolution <= 0:
        raise ValueError("--resolution must be > 0")
    if args.max_distance_km <= 0:
        raise ValueError("--max-distance-km must be > 0")
    Path(args.output_dir).mkdir(parents=True, exist_ok=True)


def normalize_bearing_deg(value: float) -> int:
    normalized = value % 360.0
    return int(round(normalized)) % 360


def bearing_from_two_points(x1: float, y1: float, x2: float, y2: float) -> int:
    angle_rad = math.atan2((x2 - x1), (y2 - y1))
    return normalize_bearing_deg(math.degrees(angle_rad))


def flatten_lines(geom) -> Iterable[LineString]:
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return [geom]
    if isinstance(geom, MultiLineString):
        return [line for line in geom.geoms if not line.is_empty]
    if hasattr(geom, "geoms"):
        output: List[LineString] = []
        for child in geom.geoms:
            output.extend(flatten_lines(child))
        return output
    return []


def explode_to_segments(lines: Iterable[LineString]) -> List[SegmentInfo]:
    segments: List[SegmentInfo] = []
    for line in lines:
        coords = list(line.coords)
        if len(coords) < 2:
            continue
        for idx in range(len(coords) - 1):
            a = coords[idx]
            b = coords[idx + 1]
            if a == b:
                continue
            seg = LineString([a, b])
            bearing = bearing_from_two_points(a[0], a[1], b[0], b[1])
            segments.append(SegmentInfo(geom=seg, shoreline_bearing_deg=bearing))
    return segments


def load_coast_segments(input_path: str) -> Tuple[List[SegmentInfo], str, int]:
    coastline = gpd.read_file(input_path)
    if coastline.empty:
        raise ValueError("Input coastline dataset is empty.")
    if coastline.crs is None:
        raise ValueError("Input coastline CRS is missing.")
    coastline_wgs84 = coastline.to_crs(EPSG_WGS84)
    coastline_au = gpd.clip(coastline_wgs84, box(*AU_BOUNDS_WGS84), keep_geom_type=False)
    if coastline_au.empty:
        raise ValueError("No coastline features intersect AU clip bounds.")
    coastline_projected = coastline_au.to_crs(EPSG_AU_PROJECTED)
    lines: List[LineString] = []
    for geom in coastline_projected.geometry:
        lines.extend(flatten_lines(geom))
    segments = explode_to_segments(lines)
    if not segments:
        raise ValueError("No valid coastline line segments found in input.")
    return segments, str(coastline.crs), len(coastline)


def load_land_union(land_path: Optional[str]):
    if not land_path:
        return None
    gdf = gpd.read_file(land_path)
    if gdf.empty:
        return None
    if gdf.crs is None:
        raise ValueError("Land polygon CRS is missing.")
    gdf_proj = gdf.to_crs(EPSG_AU_PROJECTED)
    # Natural Earth land polygons can contain invalid rings for GEOS unary union.
    # Repair first to avoid TopologyException during union.
    repaired = gdf_proj.geometry.make_valid()
    return repaired.union_all()


def move_point(point: Point, bearing_deg: float, distance_m: float) -> Point:
    theta = math.radians(bearing_deg)
    dx = distance_m * math.sin(theta)
    dy = distance_m * math.cos(theta)
    return Point(point.x + dx, point.y + dy)


def choose_sea_bearing(point_proj: Point, shoreline_bearing_deg: int, land_union) -> Tuple[Optional[int], int, bool]:
    candidate_a = normalize_bearing_deg(shoreline_bearing_deg + 90)
    candidate_b = normalize_bearing_deg(shoreline_bearing_deg - 90)
    if land_union is None:
        return candidate_a, 60, False
    test_a = move_point(point_proj, candidate_a, 500.0)
    test_b = move_point(point_proj, candidate_b, 500.0)
    in_land_a = bool(land_union.contains(test_a))
    in_land_b = bool(land_union.contains(test_b))
    if in_land_a and not in_land_b:
        return candidate_b, 95, True
    if in_land_b and not in_land_a:
        return candidate_a, 95, True
    return None, 35, False


def frange(start: float, stop: float, step: float) -> Iterable[float]:
    count = int(math.floor((stop - start) / step)) + 1
    for idx in range(count):
        yield start + idx * step


def write_json_atomic(path: Path, payload: Dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(path.parent), delete=False) as tmp:
        json.dump(payload, tmp, ensure_ascii=False, separators=(",", ":"))
        tmp.write("\n")
        tmp_path = Path(tmp.name)
    os.replace(tmp_path, path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def get_key_precision(resolution: float) -> int:
    if resolution >= 0.01:
        return 2
    # fallback for finer resolutions
    text = f"{resolution:.10f}".rstrip("0")
    if "." not in text:
        return 0
    return len(text.split(".")[1])


def assign_state(lat: float, lon: float) -> Optional[str]:
    for state, (lat_min, lat_max, lon_min, lon_max) in STATE_BBOXES:
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            return state
    return None


def in_coastal_window(state: str, lat: float, lon: float) -> bool:
    windows = STATE_COASTAL_WINDOWS.get(state)
    if not windows:
        return False
    for lat_min, lat_max, lon_min, lon_max in windows:
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            return True
    return False


def main() -> None:
    args = parse_args()
    validate_args(args)

    output_dir = Path(args.output_dir)
    input_path = Path(args.input)

    print("[shoreline-grid] Loading coastline and preparing segments...")
    segments, source_crs, source_feature_count = load_coast_segments(args.input)
    active_states = [args.state.upper()] if args.state else STATE_ORDER

    print("[shoreline-grid] Loading optional land polygon...")
    land_union = load_land_union(args.land_polygon)

    to_projected = Transformer.from_crs(EPSG_WGS84, EPSG_AU_PROJECTED, always_xy=True)
    state_grid_values: Dict[str, Tuple[List[float], List[float]]] = {}
    total_points = 0
    for state, (lat_min, lat_max, lon_min, lon_max) in STATE_BBOXES:
        if state not in active_states:
            continue
        lat_values = list(frange(lat_min, lat_max, args.resolution))
        lon_values = list(frange(lon_min, lon_max, args.resolution))
        state_grid_values[state] = (lat_values, lon_values)
        total_points += len(lat_values) * len(lon_values)
    max_distance_m = args.max_distance_km * 1000.0
    precision = get_key_precision(args.resolution)

    state_cells: Dict[str, Dict[str, List[int]]] = {s: {} for s in active_states}
    skipped_far = 0
    ambiguous_count = 0
    unavailable_count = 0
    dropped_no_state = 0

    print("[shoreline-grid] Evaluating grid points...")
    with tqdm(total=total_points, unit="cell") as progress:
        for state in active_states:
            lat_min, lat_max, lon_min, lon_max = dict(STATE_BBOXES)[state]
            expand_deg = 3.0
            bbox_wgs84 = box(
                max(AU_BOUNDS_WGS84[0], lon_min - expand_deg),
                max(AU_BOUNDS_WGS84[1], lat_min - expand_deg),
                min(AU_BOUNDS_WGS84[2], lon_max + expand_deg),
                min(AU_BOUNDS_WGS84[3], lat_max + expand_deg),
            )
            coastline_bbox_proj = gpd.GeoSeries([bbox_wgs84], crs=EPSG_WGS84).to_crs(EPSG_AU_PROJECTED).iloc[0]
            state_segments = [seg for seg in segments if seg.geom.intersects(coastline_bbox_proj)]
            if not state_segments:
                continue
            state_tree_geoms = [s.geom for s in state_segments]
            state_tree = STRtree(state_tree_geoms)
            state_segment_index_by_wkb = {geom.wkb: state_segments[idx] for idx, geom in enumerate(state_tree_geoms)}
            lat_values, lon_values = state_grid_values[state]
            for lat in lat_values:
                for lon in lon_values:
                    progress.update(1)
                    if not in_coastal_window(state, lat, lon):
                        continue
                    x, y = to_projected.transform(lon, lat)
                    point_proj = Point(x, y)

                    nearest_result = state_tree.nearest(point_proj)
                    if nearest_result is None:
                        unavailable_count += 1
                        continue

                    nearest_geom = None
                    info = None
                    if isinstance(nearest_result, (int,)):
                        idx = int(nearest_result)
                        if 0 <= idx < len(state_segments):
                            info = state_segments[idx]
                            nearest_geom = info.geom
                    elif hasattr(nearest_result, "item"):
                        idx = int(nearest_result.item())
                        if 0 <= idx < len(state_segments):
                            info = state_segments[idx]
                            nearest_geom = info.geom
                    else:
                        nearest_geom = nearest_result
                        info = state_segment_index_by_wkb.get(nearest_geom.wkb)

                    if info is None or nearest_geom is None:
                        unavailable_count += 1
                        continue

                    distance_m = point_proj.distance(nearest_geom)
                    if distance_m > max_distance_m:
                        skipped_far += 1
                        continue

                    sea_bearing, confidence_pct, unambiguous = choose_sea_bearing(
                        point_proj, info.shoreline_bearing_deg, land_union
                    )
                    if sea_bearing is None:
                        ambiguous_count += 1
                        unavailable_count += 1
                        continue
                    if not unambiguous and land_union is not None:
                        ambiguous_count += 1

                    key = f"{lat:.{precision}f},{lon:.{precision}f}"
                    state_cells[state][key] = [sea_bearing, int(round(distance_m)), int(confidence_pct)]

    source_hash = sha256_file(input_path)
    generated_at = datetime.now(timezone.utc).isoformat()
    common_diag = {
        "processedPoints": total_points,
        "skippedFar": skipped_far,
        "ambiguousCount": ambiguous_count,
        "unavailableCount": unavailable_count,
        "droppedNoState": dropped_no_state,
        "landPolygonUsed": bool(args.land_polygon),
        "sourceSha256": source_hash,
        "sourceFeatureCount": source_feature_count,
        "segmentCount": len(segments),
        "clipMode": "hard-au-bounds",
        "clipBoundsWgs84": {
            "lonMin": AU_BOUNDS_WGS84[0],
            "latMin": AU_BOUNDS_WGS84[1],
            "lonMax": AU_BOUNDS_WGS84[2],
            "latMax": AU_BOUNDS_WGS84[3],
        },
    }

    for state in active_states:
        cells = state_cells[state]
        runtime_payload = {
            "version": 2,
            "state": state,
            "resolutionDeg": args.resolution,
            "maxDistanceKm": args.max_distance_km,
            "encoding": "key -> [seaBearingDeg, distanceToCoastM, confidence]",
            "cells": cells,
        }
        meta_payload = {
            "generatedAt": generated_at,
            "state": state,
            "source": str(input_path),
            "sourceLicence": args.source_licence,
            "sourceCRS": source_crs,
            "resolutionDeg": args.resolution,
            "maxDistanceKm": args.max_distance_km,
            "cellCount": len(cells),
            "notes": "Generated for Windy land/sea orientation UI",
            "diagnostics": common_diag,
        }
        out_json = output_dir / f"shoreline-grid-{state.lower()}.json"
        out_meta = output_dir / f"shoreline-grid-{state.lower()}.meta.json"
        write_json_atomic(out_json, runtime_payload)
        write_json_atomic(out_meta, meta_payload)

    print(
        "[shoreline-grid] Complete. "
        + " ".join([f"{s.lower()}={len(state_cells[s])}" for s in active_states])
    )


if __name__ == "__main__":
    main()
