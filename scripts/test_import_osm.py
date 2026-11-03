import unittest
import json
import pathlib
import tempfile
from unittest.mock import patch
import import_osm
from import_osm import join_rings


class MultipolygonTests(unittest.TestCase):
    def test_preserves_paved_areas_and_separately_mapped_sidewalks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            source = root / "source.osm.xml"
            source.write_text("""<osm>
              <bounds minlon="14.410" minlat="50.0585" maxlon="14.429" maxlat="50.070"/>
              <node id="1" lat="50.0645" lon="14.4205"/>
              <node id="2" lat="50.0645" lon="14.4206"/>
              <node id="3" lat="50.0646" lon="14.4206"/>
              <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/>
                <tag k="highway" v="pedestrian"/><tag k="area" v="yes"/>
              </way>
              <way id="11"><nd ref="1"/><nd ref="2"/>
                <tag k="highway" v="footway"/><tag k="footway" v="sidewalk"/>
              </way>
              <way id="12"><nd ref="2"/><nd ref="3"/>
                <tag k="highway" v="pedestrian"/><tag k="sidewalk:both" v="separate"/>
              </way>
            </osm>""")
            with patch.object(import_osm, "ROOT", root), patch.object(
                import_osm.sys, "argv", ["import_osm.py", str(source)]
            ):
                import_osm.main()
            features = json.loads((root / "src/data/world.json").read_text())["features"]
            self.assertEqual(features[0]["tags"]["area"], "yes")
            self.assertEqual(features[1]["tags"]["footway"], "sidewalk")
            self.assertEqual(features[2]["tags"]["sidewalk:both"], "separate")

    def test_imports_tennis_grounds_and_stair_metadata(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            source = root / "source.osm.xml"
            source.write_text("""<osm>
              <bounds minlon="14.410" minlat="50.0585" maxlon="14.429" maxlat="50.070"/>
              <node id="1" lat="50.0645" lon="14.4205"/>
              <node id="2" lat="50.0645" lon="14.4206"/>
              <node id="3" lat="50.0646" lon="14.4206"/>
              <node id="4" lat="50.0646" lon="14.4205">
                <tag k="amenity" v="bench"/><tag k="direction" v="90"/>
              </node>
              <node id="5" lat="50.0646" lon="14.4207">
                <tag k="highway" v="street_lamp"/>
              </node>
              <node id="6" lat="50.0647" lon="14.4207">
                <tag k="disused:man_made" v="water_well"/>
              </node>
              <node id="7" lat="50.0648" lon="14.4207">
                <tag k="amenity" v="cafe"/><tag k="name" v="Example cafe"/>
              </node>
              <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/>
                <tag k="leisure" v="pitch"/><tag k="sport" v="tennis"/>
                <tag k="surface" v="grass"/><tag k="note" v="kurty mimo provoz"/>
              </way>
              <way id="11"><nd ref="1"/><nd ref="2"/>
                <tag k="highway" v="steps"/><tag k="step_count" v="35"/>
                <tag k="incline" v="up"/><tag k="handrail" v="yes"/>
              </way>
              <way id="12"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/>
                <tag k="leisure" v="playground"/><tag k="name" v="Old Czech Legends"/>
              </way>
            </osm>""")
            with patch.object(import_osm, "ROOT", root), patch.object(
                import_osm.sys, "argv", ["import_osm.py", str(source)]
            ):
                import_osm.main()
            features = json.loads((root / "src/data/world.json").read_text())["features"]
            self.assertEqual(len(features), 3)
            self.assertEqual(features[0]["tags"]["sport"], "tennis")
            self.assertEqual(features[0]["tags"]["note"], "kurty mimo provoz")
            self.assertEqual(features[1]["tags"]["step_count"], "35")
            self.assertEqual(features[1]["tags"]["incline"], "up")
            self.assertEqual(features[1]["tags"]["handrail"], "yes")
            self.assertEqual(features[2]["tags"]["leisure"], "playground")
            self.assertEqual(features[2]["tags"]["name"], "Old Czech Legends")
            details = json.loads((root / "src/data/world.json").read_text())["details"]
            self.assertEqual([detail["id"] for detail in details], [4, 5, 6, 7])
            self.assertEqual(details[0]["tags"]["direction"], "90")
            self.assertEqual(details[2]["tags"]["disused:man_made"], "water_well")
            self.assertEqual(details[3]["tags"]["name"], "Example cafe")

    def test_imports_point_statues_and_ruined_portals_without_burial_records(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            source = root / "source.osm.xml"
            source.write_text("""<osm>
              <bounds minlon="14.410" minlat="50.0585" maxlon="14.429" maxlat="50.070"/>
              <node id="1" lat="50.0645" lon="14.4205">
                <tag k="tourism" v="artwork"/><tag k="artwork_type" v="statue"/>
                <tag k="name" v="Sculptural group"/><tag k="material" v="sandstone"/>
                <tag k="artist_name" v="Sculptor"/>
              </node>
              <node id="2" lat="50.0646" lon="14.4205">
                <tag k="historic" v="ruins"/><tag k="name" v="Armory portal"/>
              </node>
              <node id="3" lat="50.0647" lon="14.4205">
                <tag k="historic" v="tomb"/><tag k="name" v="Not a statue"/>
              </node>
              <node id="4" lat="50.0648" lon="14.4205">
                <tag k="historic" v="wayside_shrine"/><tag k="wayside_shrine" v="column"/>
              </node>
            </osm>""")
            with patch.object(import_osm, "ROOT", root), patch.object(
                import_osm.sys, "argv", ["import_osm.py", str(source)]
            ):
                import_osm.main()
            monuments = json.loads((root / "src/data/world.json").read_text())["monuments"]
            self.assertEqual([m["id"] for m in monuments], [1, 2, 4])
            self.assertEqual(monuments[0]["point"], [0, 0])
            self.assertEqual(monuments[0]["tags"]["material"], "sandstone")
            self.assertEqual(monuments[0]["tags"]["artist_name"], "Sculptor")
            self.assertEqual(monuments[2]["tags"]["wayside_shrine"], "column")

    def test_imports_fences_and_preserves_heights_and_gate_locations(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            source = root / "source.osm.xml"
            source.write_text("""<osm>
              <bounds minlon="14.410" minlat="50.0585" maxlon="14.429" maxlat="50.070"/>
              <node id="1" lat="50.0645" lon="14.4205"/>
              <node id="2" lat="50.0645" lon="14.4206">
                <tag k="barrier" v="gate"/>
              </node>
              <way id="10"><nd ref="1"/><nd ref="2"/>
                <tag k="barrier" v="fence"/><tag k="height" v="3"/>
                <tag k="fence_type" v="railing"/>
              </way>
            </osm>""")
            with patch.object(import_osm, "ROOT", root), patch.object(
                import_osm.sys, "argv", ["import_osm.py", str(source)]
            ):
                import_osm.main()
            data = json.loads((root / "src/data/world.json").read_text())
            self.assertEqual(len(data["features"]), 1)
            fence = data["features"][0]
            self.assertEqual(fence["tags"], {
                "barrier": "fence", "height": "3", "fence_type": "railing"
            })
            self.assertEqual(data["gates"], [fence["points"][1]])

    def test_joins_shuffled_and_reversed_boundary_ways(self):
        rings = join_rings([["a", "b"], ["d", "c"], ["a", "d"], ["b", "c"]])
        self.assertEqual(rings, [["a", "b", "c", "d", "a"]])

    def test_preserves_separate_closed_rings(self):
        self.assertEqual(
            join_rings([["a", "b", "c", "a"], ["d", "e", "f", "d"]]),
            [["a", "b", "c", "a"], ["d", "e", "f", "d"]],
        )

    def test_does_not_fabricate_missing_boundaries(self):
        self.assertEqual(join_rings([["a", "b"], ["b", "c"]]), [])


if __name__ == "__main__":
    unittest.main()
