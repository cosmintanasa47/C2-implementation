#!/usr/bin/env python3
"""Prepare Geofabrik Romania Shortbread as browser-readable static tile packs.

No database is needed at runtime. The SQLite source is read only during this
build step. Run with --download to fetch the complete source in one request.
An existing downloaded source is reused; partial files are never resumed.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys


ROOT = Path(__file__).resolve().parent.parent
SOURCE_URL = "https://download.geofabrik.de/europe/romania-shortbread-1.0.mbtiles"
BOUNDARY_URL = "https://download.geofabrik.de/europe/romania.poly"
PACK_BYTES = 4 * 1024 * 1024


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def download(url: str, destination: Path) -> None:
    if destination.exists():
        print(f"Reusing {destination} ({destination.stat().st_size:,} bytes)", flush=True)
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".part")
    headers = destination.with_suffix(destination.suffix + ".headers")
    print(f"Downloading one complete response: {url}", flush=True)
    # Intentionally no --continue-at: upstream proxy snapshots can differ.
    subprocess.run([
        "curl", "--fail", "--location", "--show-error", "--silent",
        "--connect-timeout", "30", "--max-time", "1800",
        "--dump-header", str(headers), "--output", str(partial), url,
    ], check=True)
    if partial.stat().st_size == 0:
        raise RuntimeError("Downloaded file is empty")
    partial.replace(destination)


def sha256(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def source_date(source: Path) -> str:
    headers = source.with_suffix(source.suffix + ".headers")
    if headers.exists():
        from email.utils import parsedate_to_datetime
        values = [line.split(":", 1)[1].strip() for line in headers.read_text().splitlines()
                  if line.lower().startswith("last-modified:")]
        if values:
            return parsedate_to_datetime(values[-1]).astimezone(timezone.utc).isoformat()
    return datetime.fromtimestamp(source.stat().st_mtime, timezone.utc).isoformat()


def prepare(source: Path, output: Path, source_url: str = SOURCE_URL,
            pack_bytes: int = PACK_BYTES, boundary: Path | None = None) -> dict:
    if not source.is_file():
        raise RuntimeError(f"Source not found: {source}. Run again with --download.")
    if pack_bytes < 1:
        raise ValueError("pack_bytes must be positive")
    if output.exists():
        raise RuntimeError(f"Output already exists: {output}. Choose a new --output directory.")
    staging = output.with_name(output.name + ".preparing")
    if staging.exists():
        raise RuntimeError(f"Staging directory already exists: {staging}. Inspect and remove it before retrying.")
    connection = sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)
    try:
        print("Checking SQLite integrity…", flush=True)
        checks = [row[0] for row in connection.execute("PRAGMA integrity_check")]
        if checks != ["ok"]:
            raise RuntimeError("SQLite integrity check failed: " + "; ".join(checks[:5]))
        metadata = dict(connection.execute("SELECT name,value FROM metadata"))
        if metadata.get("format") != "pbf":
            raise RuntimeError(f"Expected pbf tiles, received {metadata.get('format')!r}")
        if metadata.get("version") != "1.0" or "shortbread" not in metadata.get("name", "").lower():
            raise RuntimeError("This exporter requires the Shortbread 1.0 schema")
        bounds = [float(value) for value in metadata["bounds"].split(",")]
        if len(bounds) != 4 or not (-180 <= bounds[0] < bounds[2] <= 180 and -90 <= bounds[1] < bounds[3] <= 90):
            raise RuntimeError("Invalid dataset bounds")
        count = connection.execute("SELECT count(*) FROM tiles").fetchone()[0]
        if not count:
            raise RuntimeError("Source contains no tiles")
        staging.mkdir(parents=True)
        packs = staging / "packs"
        packs.mkdir()
        pack = None
        pack_number = -1
        pack_size = 0
        total_bytes = 0
        largest_tile = 0
        oversized_tiles = []
        group = None
        index = {}
        zoom_counts = Counter()
        print(f"Exporting {count:,} tiles into {pack_bytes:,}-byte packs…", flush=True)
        try:
            rows = connection.execute("SELECT zoom_level,tile_column,tile_row,tile_data FROM tiles ORDER BY zoom_level,tile_column,tile_row DESC")
            for completed, (z, x, tms_y, tile) in enumerate(rows, 1):
                if not (0 <= z <= 30 and 0 <= x < 2 ** z and 0 <= tms_y < 2 ** z):
                    raise RuntimeError(f"Invalid tile coordinate: {z}/{x}/{tms_y}")
                xyz_y = 2 ** z - 1 - tms_y
                if not tile.startswith(b"\x1f\x8b"):
                    raise RuntimeError(f"Tile {z}/{x}/{xyz_y} is not gzip-compressed")
                try:
                    raw = gzip.decompress(tile)
                except (OSError, EOFError) as exc:
                    raise RuntimeError(f"Invalid gzip tile {z}/{x}/{xyz_y}: {exc}") from exc
                # Empty protobuf messages are valid tiles with no features.
                size = len(tile)
                largest_tile = max(largest_tile, size)
                if size > pack_bytes:
                    oversized_tiles.append({"z": z, "x": x, "y": xyz_y, "bytes": size})
                if group is not None and group != (z, x):
                    write_json(staging / "index" / str(group[0]) / f"{group[1]}.json", index)
                    index = {}
                group = (z, x)
                if pack is None or (pack_size and pack_size + size > pack_bytes):
                    if pack:
                        pack.close()
                    pack_number += 1
                    pack_name = f"{pack_number:06d}.bin"
                    pack = (packs / pack_name).open("wb")
                    pack_size = 0
                key = str(xyz_y)
                if key in index:
                    raise RuntimeError(f"Duplicate tile: {z}/{x}/{xyz_y}")
                index[key] = [pack_name, pack_size, size]
                pack.write(tile)
                pack_size += size
                total_bytes += size
                zoom_counts[z] += 1
                if completed % 10000 == 0:
                    print(f"{completed:,}/{count:,} tiles; {total_bytes / 1024 ** 2:.1f} MiB packed", flush=True)
            if group is not None:
                write_json(staging / "index" / str(group[0]) / f"{group[1]}.json", index)
        finally:
            if pack:
                pack.close()
        if completed != count:
            raise RuntimeError(f"Tile count mismatch: expected {count}, exported {completed}")
        manifest = {
            "version": 1, "bounds": bounds,
            "minzoom": min(zoom_counts), "maxzoom": max(zoom_counts),
            "format": "pbf", "compression": "gzip", "schema": "shortbread-1.0",
            "attribution": "© OpenStreetMap contributors · Geofabrik · ODbL 1.0",
            "source": source_url, "date": source_date(source), "tileCount": count,
            "packBytes": pack_bytes, "packCount": pack_number + 1,
            "compressedBytes": total_bytes, "largestTileBytes": largest_tile,
            "oversizedTiles": oversized_tiles,
            "tilesByZoom": {str(z): zoom_counts[z] for z in sorted(zoom_counts)},
            "sourceBytes": source.stat().st_size, "sourceSha256": sha256(source),
            "buildingHeights": "not-in-source", "gazetteer": "cities.json",
        }
        write_json(staging / "metadata.json", metadata)
        write_json(staging / "manifest.json", manifest)
        if boundary and boundary.is_file():
            shutil.copyfile(boundary, staging / "romania.poly")
        if output.exists():
            raise RuntimeError(f"Output already exists: {output}. New verified data is in {staging}; replace explicitly.")
        staging.replace(output)
        print(json.dumps(manifest, ensure_ascii=False, indent=2), flush=True)
        return manifest
    finally:
        connection.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="Download missing source and country boundary, without resuming")
    parser.add_argument("--input", type=Path, default=ROOT / ".cache/maps/romania-shortbread-1.0.mbtiles")
    parser.add_argument("--output", type=Path, default=ROOT / "dist/maps/romania")
    parser.add_argument("--source-url", default=SOURCE_URL)
    parser.add_argument("--boundary", type=Path, default=ROOT / ".cache/maps/romania.poly")
    args = parser.parse_args()
    try:
        if args.download:
            download(args.source_url, args.input)
            download(BOUNDARY_URL, args.boundary)
        prepare(args.input, args.output, args.source_url, boundary=args.boundary)
    except (RuntimeError, OSError, sqlite3.Error, subprocess.CalledProcessError, ValueError, KeyError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
