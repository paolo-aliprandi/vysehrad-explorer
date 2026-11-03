"""Convert an OSM API XML export to the small, attributed MVP world dataset."""

import json
import math
import pathlib
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

ORIGIN = (50.0645, 14.4205)
ROOT = pathlib.Path(__file__).resolve().parents[1]


def project(lat, lon):
    return [
        round((lon - ORIGIN[1]) * 111320 * math.cos(math.radians(ORIGIN[0])), 2),
        round((ORIGIN[0] - lat) * 111320, 2),
    ]

def join_rings(segments):
    pending = [list(segment) for segment in segments if len(segment) >= 2]
    complete = []
    while pending:
        chain = pending.pop(0)
        while chain[0] != chain[-1]:
            for index, segment in enumerate(pending):
                if segment[0] == chain[-1]:
                    chain.extend(segment[1:])
                elif segment[-1] == chain[-1]:
                    chain.extend(reversed(segment[:-1]))
                else:
                    continue
                pending.pop(index)
                break
            else:
                break
        if len(chain) >= 4 and chain[0] == chain[-1]:
            complete.append(chain)
        else:
            print("An incomplete multipolygon ring was omitted; no artificial closing edge added.")
    return complete

def contains(point, ring):
    x, y = point
    result = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            result = not result
    return result


def main():
    source = pathlib.Path(sys.argv[1])
    xml = ET.parse(source).getroot()
    nodes = {
        n.attrib["id"]: project(float(n.attrib["lat"]), float(n.attrib["lon"]))
        for n in xml.findall("node")
    }
    features = []
    keep = (
        "building", "building:part", "building:levels", "height", "min_height",
        "roof:height", "roof:shape", "building:colour", "roof:colour",
        "highway", "barrier", "natural", "landuse", "leisure", "historic",
        "name", "name:en", "wikidata", "surface", "width", "layer", "tunnel", "bridge", "water",
        "area", "footway", "sidewalk", "sidewalk:both",
        "fence_type", "material", "tourism", "artwork_type", "memorial",
        "artist_name", "direction", "wayside_shrine",
        "sport", "step_count", "incline", "handrail", "note", "garden:type",
        "amenity", "shop", "man_made", "disused:man_made", "backrest", "seats", "outdoor_seating",
    )
    for way in xml.findall("way"):
        tags = {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")}
        if not (
            "building" in tags or "building:part" in tags or "highway" in tags
            or tags.get("barrier") in ("wall", "city_wall", "retaining_wall", "fence")
            or tags.get("natural") in ("water", "wood", "scrub", "tree_row", "cliff", "bare_rock")
            or tags.get("landuse") in ("grass", "forest", "cemetery")
            or tags.get("leisure") in ("park", "garden", "pitch", "playground")
            or tags.get("landuse") in ("allotments", "recreation_ground", "village_green")
        ):
            continue
        points = [nodes[n.attrib["ref"]] for n in way.findall("nd")]
        if len(points) < 2:
            continue
        features.append({
            "id": int(way.attrib["id"]),
            "points": points,
            "tags": {k: tags[k] for k in keep if k in tags},
            "holes": [],
        })
    ways = {way.attrib["id"]: way for way in xml.findall("way")}
    for relation in xml.findall("relation"):
        tags = {t.attrib["k"]: t.attrib["v"] for t in relation.findall("tag")}
        if tags.get("type") != "multipolygon" or not (
            tags.get("natural") in ("water", "wood", "scrub", "bare_rock")
            or tags.get("landuse") in ("grass", "forest", "cemetery")
            or tags.get("leisure") in ("park", "garden")
            or "building" in tags or "building:part" in tags
        ):
            continue
        rings = {"outer": [], "inner": []}
        for member in relation.findall("member"):
            role = member.attrib.get("role")
            if role not in rings:
                continue
            way = ways.get(member.attrib["ref"])
            if way is None:
                continue
            refs = [n.attrib["ref"] for n in way.findall("nd")]
            rings[role].append(refs)
        rings = {role: [[nodes[ref] for ref in ring] for ring in join_rings(segments)]
                 for role, segments in rings.items()}
        if not rings["outer"]:
            print(f"Relation {relation.attrib['id']} has no complete outer ring in this bounded extract; not reconstructed.")
        for index, ring in enumerate(rings["outer"]):
            features.append({
                "id": -int(relation.attrib["id"]) * 10 - index,
                "points": ring, "holes": [hole for hole in rings["inner"] if contains(hole[0], ring)],
                "tags": {k: tags[k] for k in keep if k in tags},
            })
    trees = [
        nodes[n.attrib["id"]] for n in xml.findall("node")
        if any(t.attrib.get("k") == "natural" and t.attrib.get("v") == "tree"
               for t in n.findall("tag"))
    ]
    bounds = xml.find("bounds").attrib
    bbox = ",".join(bounds[key] for key in ("minlon", "minlat", "maxlon", "maxlat"))
    data = {
        "meta": {
            "origin": list(ORIGIN),
            "source": "OpenStreetMap",
            "sourceUrl": "https://www.openstreetmap.org/api/0.6/map?bbox=" + bbox,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "license": "ODbL-1.0",
            "attribution": "© OpenStreetMap contributors",
            "terrain": "Procedural approximation, not surveyed elevation",
        },
        "features": features,
        "trees": trees,
        "details": [
            {
                "id": int(n.attrib["id"]),
                "point": nodes[n.attrib["id"]],
                "tags": {k: tags[k] for k in keep if k in tags},
            }
            for n in xml.findall("node")
            for tags in [{t.attrib["k"]: t.attrib["v"] for t in n.findall("tag")}]
            if tags.get("amenity") in ("bench", "cafe", "bar", "pub", "restaurant", "fast_food")
            or "shop" in tags
            or tags.get("highway") == "street_lamp"
            or tags.get("man_made") == "water_well"
            or tags.get("disused:man_made") == "water_well"
        ],
        "monuments": [
            {
                "id": int(n.attrib["id"]),
                "point": nodes[n.attrib["id"]],
                "tags": {k: tags[k] for k in keep if k in tags},
            }
            for n in xml.findall("node")
            for tags in [{t.attrib["k"]: t.attrib["v"] for t in n.findall("tag")}]
            if tags.get("artwork_type") in ("statue", "sculpture", "bust")
            or tags.get("memorial") in ("statue", "bust")
            or tags.get("historic") in ("monument", "ruins")
            or (tags.get("historic") == "wayside_shrine" and tags.get("wayside_shrine") == "column")
        ],
        "gates": [
            nodes[n.attrib["id"]] for n in xml.findall("node")
            if any(t.attrib.get("k") == "barrier" and t.attrib.get("v") in ("gate", "lift_gate", "entrance")
                   for t in n.findall("tag"))
        ],
    }
    destination = ROOT / "src/data/world.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    for element in xml:
        for key in ("user", "uid", "changeset"):
            element.attrib.pop(key, None)
    raw_destination = ROOT / "public/data/vysehrad.osm.xml"
    raw_destination.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(xml).write(raw_destination, encoding="utf-8", xml_declaration=True)
    print(f"Imported {len(features)} features and {len(trees)} mapped trees.")


if __name__ == "__main__":
    main()
