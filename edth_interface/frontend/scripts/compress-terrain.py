#!/usr/bin/env python3
"""Re-encode prepared Terrarium PNGs as lossless WebP, preserving every height byte."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import shutil
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, default=ROOT / 'dist/maps/terrain')
parser.add_argument('--output', type=Path, default=ROOT / '.cache/maps/terrain-webp')
args = parser.parse_args()
manifest = json.loads((args.input / 'manifest.json').read_text())
assert manifest['complete'] and manifest['format'] == 'terrarium'
sources = list(json.loads((args.input / 'checksums.json').read_text()))
assert sources and all(name.endswith('.png') for name in sources)
args.output.mkdir(parents=True, exist_ok=True)

def convert(name):
    source = args.input / name
    target = args.output / Path(name).with_suffix('.webp')
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        original = image.convert('RGB')
        valid = False
        if target.exists():
            try:
                with Image.open(target) as existing:
                    valid = existing.convert('RGB').tobytes() == original.tobytes()
            except (OSError, ValueError):
                pass
        if not valid:
            original.save(target, format='WEBP', lossless=True, quality=90, method=4)
        with Image.open(target) as check:
            assert check.convert('RGB').tobytes() == original.tobytes(), f'Height bytes changed: {name}'
    return str(target.relative_to(args.output)), hashlib.sha256(target.read_bytes()).hexdigest(), target.stat().st_size

results = []
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for item in pool.map(convert, sources):
        results.append(item)
        if len(results) % 400 == 0: print(f'{len(results)}/{len(sources)} verified', flush=True)
manifest.update(imageFormat='webp', encoding='Terrarium RGB in lossless WebP; identical decoded height bytes',
                originalPngBytes=manifest['totalBytes'], totalBytes=sum(item[2] for item in results))
(args.output / 'checksums.json').write_text(json.dumps({name:checksum for name,checksum,_ in results}, indent=2)+'\n')
shutil.copyfile(args.input / 'ATTRIBUTION.txt', args.output / 'ATTRIBUTION.txt')
(args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(json.dumps({'tiles':len(results),'bytes':manifest['totalBytes'],'original':manifest['originalPngBytes']}), flush=True)
