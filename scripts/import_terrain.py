"""Import a bounded, attributed DMR 5G height raster using only the standard library."""

import json
import math
import pathlib
import struct
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVICE = "https://ags.cuzk.cz/arcgis2/rest/services/dmr5g/ImageServer"


def read_float_tiff(data):
    endian = "<" if data[:2] == b"II" else ">"
    if struct.unpack_from(endian + "H", data, 2)[0] != 42:
        raise ValueError("Expected classic TIFF.")
    offset = struct.unpack_from(endian + "I", data, 4)[0]
    count = struct.unpack_from(endian + "H", data, offset)[0]
    tags = {}
    formats = {3: "H", 4: "I", 12: "d"}
    for i in range(count):
        entry = offset + 2 + i * 12
        tag, kind, length, value_offset = struct.unpack_from(endian + "HHII", data, entry)
        if kind not in formats:
            continue
        fmt = formats[kind]
        size = struct.calcsize(fmt) * length
        tags[tag] = struct.unpack_from(endian + fmt * length, data, entry + 8 if size <= 4 else value_offset)
    if tags[259] != (1,) or tags[258] != (32,) or tags[339] != (3,) or tags[277] != (1,):
        raise ValueError("Expected uncompressed single-band float32 elevation TIFF.")
    width, height = tags[256][0], tags[257][0]
    tile_width, tile_height = tags[322][0], tags[323][0]
    tiles_across = math.ceil(width / tile_width)
    values = []
    for y in range(height):
        for x in range(width):
            tile = (y // tile_height) * tiles_across + x // tile_width
            index = (y % tile_height) * tile_width + x % tile_width
            value = struct.unpack_from(endian + "f", data, tags[324][tile] + index * 4)[0]
            if not math.isfinite(value) or not 100 < value < 600:
                raise ValueError(f"Missing or invalid terrain sample at {x}, {y}: {value}")
            values.append(round(value, 2))
    return width, height, values


def main():
    world = json.loads((ROOT / "src/data/world.json").read_text())
    lat, lon = world["meta"]["origin"]
    east_scale = 111320 * math.cos(math.radians(lat))
    bbox = [lon - 850 / east_scale, lat - 750 / 111320, lon + 850 / east_scale, lat + 750 / 111320]
    query = urllib.parse.urlencode({
        "f": "pjson", "bbox": ",".join(map(str, bbox)), "bboxSR": 4326,
        "imageSR": 4326, "size": "320,182", "format": "tiff",
        "pixelType": "F32", "interpolation": "RSP_BilinearInterpolation",
    })
    with urllib.request.urlopen(SERVICE + "/exportImage?" + query, timeout=90) as response:
        exported = json.load(response)
    if "error" in exported:
        raise RuntimeError(exported["error"])
    with urllib.request.urlopen(exported["href"], timeout=90) as response:
        raster = response.read()
    width, height, values = read_float_tiff(raster)
    extent = exported["extent"]
    grid = {
        "width": width, "height": height,
        "minX": round((extent["xmin"] - lon) * east_scale, 4),
        "maxX": round((extent["xmax"] - lon) * east_scale, 4),
        "minZ": round((lat - extent["ymax"]) * 111320, 4),
        "maxZ": round((lat - extent["ymin"]) * 111320, 4),
        "datum": 185,
        "values": values,
        "meta": {
            "source": "ČÚZK DMR 5G",
            "sourceUrl": SERVICE,
            "license": "CC-BY-4.0",
            "attribution": "Terrain © ČÚZK",
            "retrieved": datetime.now(timezone.utc).isoformat(),
            "termsUrl": "https://geoportal.cuzk.gov.cz/Default.aspx?mode=TextMeta&side=vyskopis&metadataID=CZ-CUZK-DMR5G-V&mapid=8&menu=302",
            "processing": "Bilinear raster resampling; local meter projection; building foundations and surfaces are adjusted for gameplay.",
        },
    }
    destination = ROOT / "src/data/terrain.json"
    destination.write_text(json.dumps(grid, ensure_ascii=False, separators=(",", ":")) + "\n")
    raw = ROOT / "public/data/vysehrad-terrain.tif"
    raw.write_bytes(raster)
    print(f"Imported {width} × {height} real terrain samples, {min(values):.2f}–{max(values):.2f} m Bpv.")


if __name__ == "__main__":
    main()
