#!/usr/bin/env python3
"""Prepare a resumable, attributed Romania Terrarium package from AWS Open Data.

Requires Python 3 and Pillow. Uses system curl for its platform certificate store.
No OSM imagery server is queried. Downloads only public elevation data.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import io
import json
import math
import os
from pathlib import Path
import subprocess
import time

from PIL import Image

BOUNDS = [20.24181, 43.61247, 30.27896, 48.26948]
SOURCE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
CREDITS = [
    "Mapzen / Tilezen terrain, distributed through AWS Open Data.",
    "Produced using Copernicus data and information funded by the European Union - EU-DEM layers.",
    "SRTM and GMTED2010 elevation data courtesy of the U.S. Geological Survey.",
    "ETOPO1: DOC/NOAA/NESDIS/NCEI, National Centers for Environmental Information, NOAA, U.S. Department of Commerce.",
]


def tile_ranges(bounds, maximum, padding=0):
    west, south, east, north = bounds
    result = []
    for z in range(maximum + 1):
        scale = 2 ** z
        tx = lambda lon: int((lon + 180) / 360 * scale)
        ty = lambda lat: int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * scale)
        result.append({"z": z, "minX": max(0, tx(west) - padding),
                       "maxX": min(scale - 1, tx(east) + padding),
                       "minY": max(0, ty(north) - padding),
                       "maxY": min(scale - 1, ty(south) + padding)})
    return result


def valid_output(path):
    if not path.is_file():
        return False
    try:
        with Image.open(path) as image:
            image.load()
            return image.size == (256, 256) and image.mode == "RGB" and image.getchannel("B").getextrema() == (0, 0)
    except (OSError, ValueError):
        return False


def prepare_one(args):
    z, x, y, output = args
    path = output / str(z) / str(x) / f"{y}.png"
    if valid_output(path):
        return path, False
    source = SOURCE.format(z=z, x=x, y=y)
    last_error = None
    for attempt in range(4):
        try:
            response = subprocess.run([
                "curl", "--fail", "--silent", "--show-error", "--location",
                "--connect-timeout", "15", "--max-time", "60", source,
            ], check=True, capture_output=True)
            with Image.open(io.BytesIO(response.stdout)) as source_image:
                source_image.load()
                if source_image.size != (256, 256):
                    raise ValueError(f"Unexpected source dimensions: {source_image.size}")
                image = source_image.convert("RGB")
                # Round the encoded unsigned value (height + 32768) to nearest metre.
                # This retains the standard Terrarium decoder and adds <= 0.5 m error.
                pixels = bytearray(image.tobytes())
                for i in range(0, len(pixels), 3):
                    metres_offset = min(65535, pixels[i] * 256 + pixels[i + 1] + (pixels[i + 2] >= 128))
                    pixels[i] = metres_offset >> 8
                    pixels[i + 1] = metres_offset & 255
                    pixels[i + 2] = 0
                encoded = Image.frombytes("RGB", (256, 256), bytes(pixels))
                path.parent.mkdir(parents=True, exist_ok=True)
                temporary = path.with_suffix(".png.part")
                encoded.save(temporary, format="PNG", optimize=True)
                os.replace(temporary, path)
            return path, True
        except (subprocess.CalledProcessError, OSError, ValueError) as error:
            last_error = error
            time.sleep(min(2 ** attempt, 8))
    raise RuntimeError(f"Unable to prepare {z}/{x}/{y}: {last_error}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent.parent / "dist/maps/terrain")
    parser.add_argument("--max-zoom", type=int, default=11, choices=range(0, 13))
    parser.add_argument("--workers", type=int, default=6, choices=range(1, 9))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    coverage = tile_ranges(BOUNDS, args.max_zoom)
    stored = tile_ranges(BOUNDS, args.max_zoom, padding=1)
    jobs = [(r["z"], x, y, args.output) for r in stored
            for x in range(r["minX"], r["maxX"] + 1)
            for y in range(r["minY"], r["maxY"] + 1)]
    print(f"Preparing {len(jobs)} terrain PNGs, z0–{args.max_zoom}, {args.workers} workers", flush=True)
    paths, downloaded = [], 0
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(prepare_one, job) for job in jobs]
        for future in concurrent.futures.as_completed(futures):
            path, fresh = future.result()
            paths.append(path)
            downloaded += fresh
            if len(paths) % 100 == 0 or len(paths) == len(jobs):
                print(f"{len(paths)}/{len(jobs)} ready; {downloaded} downloaded; {time.monotonic()-started:.0f}s", flush=True)
    checksums = {str(path.relative_to(args.output)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(paths)}
    total_bytes = sum(path.stat().st_size for path in paths)
    manifest = {
        "version": 1, "complete": True, "format": "terrarium", "scheme": "xyz",
        "tileSize": 256, "bounds": BOUNDS, "minimumLevel": 0, "maximumLevel": args.max_zoom,
        "tileCount": len(paths), "totalBytes": total_bytes,
        "preparedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "source": SOURCE, "sourceRegistry": "https://registry.opendata.aws/terrain-tiles/",
        "license": "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
        "credits": CREDITS, "heightUnit": "metre", "roundingMetres": 1,
        "maximumAddedVerticalErrorMetres": 0.5,
        "nominalSourceResolutionMetres": 30,
        "gridSpacingMetresAt46N": 156543.03392804097 * math.cos(math.radians(46)) / 2 ** args.max_zoom,
        "sourceNotes": "Predominantly EU-DEM; legacy terrain release circa 2017. Terrain surface, not photogrammetric buildings. Grid spacing does not imply measurement accuracy.",
        "coverageTileRanges": coverage, "storedTileRanges": stored, "borderTiles": 1,
    }
    for name, content in [("checksums.json", checksums), ("manifest.json", manifest)]:
        target = args.output / name
        temp = target.with_suffix(".json.part")
        temp.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temp, target)
    (args.output / "ATTRIBUTION.txt").write_text("\n".join(CREDITS) + "\n\n" + manifest["license"] + "\n\nModified: rounded to nearest metre, adding at most 0.5 m vertical error.\n", encoding="utf-8")
    print(f"Complete: {len(paths)} PNGs, {total_bytes / 1000000:.2f} MB, {time.monotonic()-started:.1f}s", flush=True)


if __name__ == "__main__":
    main()
