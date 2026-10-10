"""Small fixtures exercise pack splitting, gzip preservation and XYZ indexing."""
import contextlib
import gzip
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest


SPEC = importlib.util.spec_from_file_location("prepare_romania", Path(__file__).parents[1] / "scripts/prepare-romania.py")
PREPARE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREPARE)


class PrepareRomaniaTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source.mbtiles"
        self.output = self.root / "romania"
        self.rows = [(2, 1, 0, gzip.compress(b"tile-a", mtime=0)),
                     (2, 1, 1, gzip.compress(b"tile-b", mtime=0)),
                     (2, 2, 2, gzip.compress(b"tile-c", mtime=0))]
        with contextlib.closing(sqlite3.connect(self.source)) as connection, connection:
            connection.execute("CREATE TABLE metadata(name TEXT,value TEXT)")
            connection.execute("CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB)")
            connection.executemany("INSERT INTO metadata VALUES(?,?)", [
                ("name", "Shortbread"), ("version", "1.0"), ("format", "pbf"),
                ("bounds", "20,43,30,49"),
            ])
            connection.executemany("INSERT INTO tiles VALUES(?,?,?,?)", self.rows)

    def run_prepare(self, pack_bytes=50):
        with contextlib.redirect_stdout(io.StringIO()):
            return PREPARE.prepare(self.source, self.output, pack_bytes=pack_bytes)

    def test_xyz_indices_reconstruct_original_gzip_bytes(self):
        manifest = self.run_prepare()
        self.assertEqual(manifest["tileCount"], 3)
        self.assertEqual(manifest["packCount"], 3)
        for z, x, tms_y, original in self.rows:
            index = json.loads((self.output / "index" / str(z) / f"{x}.json").read_text())
            name, offset, length = index[str(2 ** z - 1 - tms_y)]
            pack = (self.output / "packs" / name).read_bytes()
            self.assertLessEqual(len(pack), 50)
            self.assertEqual(pack[offset:offset + length], original)
        self.assertFalse((self.root / "romania.preparing").exists())

    def test_giant_tile_is_reported_and_not_split(self):
        manifest = self.run_prepare(pack_bytes=10)
        self.assertEqual(len(manifest["oversizedTiles"]), 3)
        self.assertEqual(manifest["largestTileBytes"], len(self.rows[0][3]))

    def test_rejects_non_gzip_without_publishing_manifest(self):
        with contextlib.closing(sqlite3.connect(self.source)) as connection, connection:
            connection.execute("UPDATE tiles SET tile_data=? WHERE tile_column=2", (b"not-gzip",))
        with self.assertRaisesRegex(RuntimeError, "not gzip"):
            self.run_prepare()
        self.assertFalse(self.output.exists())

    def test_rejects_truncated_gzip(self):
        with contextlib.closing(sqlite3.connect(self.source)) as connection, connection:
            connection.execute("UPDATE tiles SET tile_data=? WHERE tile_column=2", (self.rows[0][3][:-5],))
        with self.assertRaisesRegex(RuntimeError, "Invalid gzip"):
            self.run_prepare()
        self.assertFalse(self.output.exists())

    def test_preserves_valid_empty_vector_tile(self):
        with contextlib.closing(sqlite3.connect(self.source)) as connection, connection:
            connection.execute("UPDATE tiles SET tile_data=? WHERE tile_column=2", (gzip.compress(b"", mtime=0),))
        manifest = self.run_prepare()
        self.assertEqual(manifest["tileCount"], 3)
        entry = json.loads((self.output / "index/2/2.json").read_text())["1"]
        data = (self.output / "packs" / entry[0]).read_bytes()[entry[1]:entry[1]+entry[2]]
        self.assertEqual(gzip.decompress(data), b"")


if __name__ == "__main__":
    unittest.main()
