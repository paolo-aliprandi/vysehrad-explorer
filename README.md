# Vyšehrad Explorer

An original, desktop-first 3D browser playground around Vyšehrad, Prague.
Inspired by the real-city exploration idea of Helsinki Online, not a copy of its
interface, code, or assets. Built with React, TypeScript, Three.js, Vite, and Nx.

**Play:** https://paolo-aliprandi.github.io/vysehrad-explorer/

**Source:** https://github.com/paolo-aliprandi/vysehrad-explorer

## Start

```sh
npm install
npm start
```

Open **http://127.0.0.1:5173**. A modern browser with WebGL2 and hardware
acceleration is required. The server binds to loopback, not the local network.

## Play

- WASD or arrows: move; Shift: faster; Space: jump.
- Drag: turn camera; scroll: zoom.
- Touch screens: drag to look; double-tap and hold the scene to walk forward.
  Release to stop. Drag during the hold to steer; cancellation or an extra finger
  stops walking.
- Choose Chill Exploration or Knight Adventure on the home screen.
- Chill: Walking / Flying changes mode; E or Space rises and Q descends in flight.
- Adventure: collect a stick, sword or bow; R attacks, Z aims, C switches weapons.
- Pick up finite arrow bundles and buy healing food from the three local shops.
- Switch Pro controller: left stick moves, right stick looks, B jumps, A interacts,
  Y attacks, ZL aims, ZR shoots, L switches weapons and X toggles the hidden UI.
- M: map and fast travel; P: photo mode; Escape: close a dialog / leave photo mode.
- Visit glowing landmark markers to discover regions. Adventure disables flight
  and fast travel; cleared raids can be restarted without losing equipment or discoveries.

Progress is saved in this browser's local storage. There are no accounts,
multiplayer, analytics, external font requests, or runtime OSM API calls.
Photo mode hides most UI; use your browser or OS screenshot tool to capture it.

## Private map reports

The in-world **Report / contribute a photo** form freezes the avatar's native map
coordinates (not the 1.5x rendering coordinates), heading, interior and build
revision. Phone GPS is optional and requested only after an explicit button press.
The form previews the locations, requires permission to share the photo, resizes
it to at most 1280 pixels, and re-encodes it without source EXIF metadata.

`api/reporting` is a Cloudflare Workers Free + D1 service. It verifies Turnstile,
limits and validates the multipart request, strips JPEG application metadata,
stores photos privately, and returns a receipt only after durable storage.
Limits are three reports per connection per hour, 20 reports globally per UTC day,
256 KiB per photo and 30-day photo access. Daily cleanup also deletes the stored
report payload; private GitHub issue metadata persists for human review.
There is no background location collection and no automated model modification.

The private `paolo-aliprandi/vysehrad-reports` repository runs the
`api/reporting/review-reports.yml` workflow every 30 minutes. Its repo-scoped
`GITHUB_TOKEN` has only issue-write permission. A separate random service secret
allows the workflow to lease queued reports and acknowledge delivery. Failed or
interrupted deliveries are retried; existing report IDs are reconciled before
creating issues. GitHub scheduling may be delayed. No GitHub token reaches the
website or Worker, and visitors never need a GitHub account.

Private photo links are random, report-specific bearer links, not authenticated
owner sessions. Anyone given a link can view that photo until it expires. They are
not embedded through GitHub's image proxy, are not cached, and must not be shared
publicly. D1 backup retention can outlast the live record's deletion.

### Reporting operations

```sh
npm run reporting:dev
npx wrangler d1 migrations apply vysehrad-reports --remote --config api/reporting/wrangler.jsonc
npm run reporting:deploy
```

Worker secrets: `TURNSTILE_SECRET_KEY` and `REVIEW_SERVICE_KEY`. The latter must
match the private review repository's `REPORT_REVIEW_KEY` Actions secret.
Use `wrangler secret put` and `gh secret set`; never commit credentials.
The private review repository's `REPORT_API_URL` variable points at the Worker.
The website's public Actions variables `REPORT_API_URL` and `TURNSTILE_SITE_KEY`
enable the form during the Pages build. Missing settings keep it hidden rather
than displaying a non-working upload feature. `VITE_MODEL_REVISION` records the
deployed commit.

Monitor the private delivery workflow for failures and the Worker's `/health`
endpoint for configuration readiness. Run its workflow manually to drain a queue
immediately. Reports and photos never belong in the public model repository.
Stay on the free plans: Workers includes 100,000 requests/day; D1 allows 500 MB per
free database. The bounded 30-day photo set is about 150 MiB at the daily maximum.
The 30-minute private workflow uses at most about 1,488 minimum-billed minutes in
a 31-day month if every job finishes within one minute, against GitHub Free's
shared private Actions allowance. Scheduled jobs are not a delivery-time SLA.
No paid plan or automatic upgrade is configured.

## Deployment

Pushes to `main` run type-checks, lint, unit tests and a production build before
deploying to GitHub Pages in the personal `paolo-aliprandi` account. Browser
regressions can be run locally with `npm run test:e2e`. `VITE_BASE_PATH` sets the
deployment subdirectory; local development defaults to `/`.

## Art direction

The world uses an original, Breath of the Wild-inspired painterly treatment,
guided by the local landscape and Gothic-building references: soft cel-shaded
light, sage meadows, varied broadleaf and evergreen silhouettes, wind-swaying
grass and foliage, muted masonry, blue-green water with animated painted
highlights, drifting clouds and atmospheric distance. Day, golden-hour and
blue-night presets share the same treatment. The mapped city, intact buildings,
terrain, passages and controls are preserved; this is a stylized reconstruction,
not a reproduction of game assets or a ruined version of Vyšehrad. Reference
screenshots are not bundled, uploaded or used as textures.

## Data and fidelity

The bundled OSM snapshot covers `14.410,50.0585,14.429,50.070` and includes 984 buildings. Real footprints,
building parts, paths, wall lines, fences, and mapped trees are projected into local meters.
The basilica's mapped parts include two 60 m towers and roof-height tags.

Paving is assembled into non-overlapping footprints rather than independently
overlaid road ribbons. Separately mapped sidewalks join their adjacent street
where support levels agree; garden footpaths share gravel, pedestrian plazas
use filled polygons, and steep rock banks and upper paths outside the ramparts
are excluded. Genuine lower paths, stairs and tunnel levels remain independent.
These are visual interpretations of the map, not surveyed pavement boundaries.

Terrain uses 58,240 resampled **ČÚZK DMR 5G** elevation samples. Buildings share
graded foundations; paths, parks, movement and continuous walls use the same
5 m terrain triangle surface. Real river geometry replaces the placeholder.
The main mapped rampart ring has a graded promenade terrace: the wall and
adjacent path sit on a cross-level bench, with the hillside falling away outside.
Levels follow the higher, inner DMR samples and vary along the circuit; these
engineered breaks are an approximate correction to the resampled terrain.
Walls no longer share one low height: mapped heights take precedence; untagged
city-wall and retaining faces rise to the adjacent upper bank where the terrain
shows a level difference. Ordinary boundary walls and low promenade parapets
stay low. These terrain-derived face heights are estimates, not measured masonry.
The chapter-garden enclosure opposite the cemetery near Saint Sebastian is
modeled as a taller wall, separately from the low riverside promenade parapets.
Cihelná brána has three lower gallery passages and a separate grass-covered upper
deck with an uninterrupted promenade. Height-aware walking keeps the two levels
independent. Its floor is inferred from DMR samples beyond both entrances.
Three mapped postern routes toward Táborská brána have vaulted shells, portals,
and upper ground covers; their underground depths are estimates, not surveys.
Leopold Gate shares a graded road and foundation, rather than sinking into a
rampart terrace. Short false troughs at narrow bastion corners are filled without
flattening the outside hillside.
Mapped tennis grounds have local pads: the active clay court has markings and
a net; inactive grounds retain grass. Raised vegetable beds on one former court
near the mapped garden exit are illustrative, not OSM crop records. The open
garden doorway connects the inside and outside paths. Two mapped stair flights
have actual treads and risers, including the 35-step access to the postern routes.
V Pevnosti follows a smooth, cross-level roadbed from Leopold to Tabor, retaining
a gentle longitudinal rise. The garden-side shoulder breaks into a steeper bank
without raising the garden plots. Gate foundations share the road grade rather
than following DMR samples affected by the gate roofs. A continuous upper road
deck spans the postern crossing; the lower passage, its connecting paths, and the
35-step flight have independent support levels. These engineered grades and
underground clearances remain inferred, not surveyed.
The Leopold approach has a local 1 m terrain mesh shared by its street,
sidewalks, and walking support, instead of letting the surrounding 5 m grid
pull its edges into the banks. The garden-side transition stays steep without
widening the road pad. The detailed mesh blends into the coarse mesh at its boundary.
Masonry crests use connected straight grades between mapped wall corners, rather
than following every terrain ripple. Crest runs retain support above the upper
bank, while the rampart's adjoining terrace follows the same corner grades.
This includes both exterior wings beyond Táborská Gate; terrain-following wall
foundations and lower tunnel clearances are preserved.
At Leopold Gate, the rampart stops at the full gatehouse sides rather than
overlapping its stone façade. The central opening leaves a shared pier beside
the mapped pedestrian arches, so their decorative columns do not obstruct them.
Lower exterior tennis-court pads cannot grade across the rampart into the park;
the bridge-facing inner earthworks keep their upper terrace level.
The eastern bank mesh is split at the actual rampart outline: upper grass stops
behind the masonry instead of forming coarse-grid spikes over the lower courts.
V Pevnosti's mapped U Vratislava, Obchůdek Borůvka and Na hradbách now have
original procedural shopfronts, awnings and signage, with planters and pub seating
kept off the mapped paths. Existing stairways have low stone cheek walls and
coping, and the short shop-side boundary is kept low and capped. Dimensions and
furnishings are inferred, not surveyed interiors or current business verification.
At Cihelná Gate, surrounding masonry and cover edges stay above the lower
gatehouse façade; the independent upper promenade and three lower arches remain.
Its short approach retaining wall uses the lower street level and ends at the
gatehouse, rather than inheriting the promenade height and covering a façade pier.
Its full lower approach wall now has a low, straight-graded crest; distant hillside
samples no longer pull an unsupported spike up beside the gate. Untagged retaining
walls use immediately adjacent soil rather than borrowing heights from remote banks.
The main ramparts have asymmetric, sloping masonry sections: the outer footing
meets the mapped cliff edge and the wider structural base extends into the hill,
leaving a narrow promenade parapet above. These profiles are inferred, not surveyed.
Local wall, aerial and gate photographs inform the earth-backed construction;
the reference images remain local and are neither bundled nor used as textures.
The importer now also retains mapped `natural=cliff` lines and the riverside
`bare_rock` polygon. That polygon has an original fractured-rock material, with
grass overlays and generated trees excluded. A separately sampled exterior rock
surface meets the battered bastion foundations below the retained upper earth;
its mesh is split at the actual rampart, rather than stretching a grassy skirt
across the masonry. The exposed-rock wall bases widen outward below grade while
their structural mass and the upper park remain connected. The local rock-seat
grading and batter are approximations, not a scan or a geological survey.
The vegetable-garden exit beside Leopold has a thicker brick enclosure with a
single straight crest grade and stone coping. Its stone-framed arch is aligned
to the mapped wall, with a matching masonry header instead of a grass-topped
protruding tunnel block. A local 1 m terrain mesh keeps the doorway floor and its
approaches independent of the retained upper bank.
The garden bank and its grass overlays are split at the main rampart as well:
upper soil no longer stretches pointed curtains down into the lower plots.
Saint Sebastian's niche stands clear of the reconstructed inner rampart face;
its pedestal collision follows the same placement. The two mapped riverside
doorways have solid arched headers rather than full-height breaks.
The cemetery's three mapped arcade wings retain their roofs and rear walls,
with open column-supported bays on the cemetery side. Their level porch slabs have
independent walking support; exact terrain cutouts with sealed earth-cut faces beneath the mapped footprints
keep uphill soil outside the rear retaining walls without burying the porch.
The solid Slavín enclosure
is preserved. A local interior photograph informs the reconstruction but is not
bundled or used as a texture.
Vyšehradský tunel has a separate lower road and pedestrian passage, vaulted
shell and masonry portals with dressed arch surrounds, an arched corbel frieze
and a round crenellated riverside turret informed by the local tunnel photograph.
Its approach cuts remove terrain plugs without
removing the rock over the tunnel. Clearance, grading and architecture are
inferred from mapped alignments and nearby terrain, not a tunnel survey.
Nuselský most is an original background landmark on the midpoint alignment of
its two mapped OSM carriageways, with an elevated road deck, enclosed box girder,
four paired-pier supports, pedestrian edges, barriers and lane markings. Its
central structural section is approximately 485 m long and 26.5 m wide, with mapped
approaches at either end. Heights follow the endpoint terrain rather than
draping the bridge onto the valley floor. It is not a drivable/walkable extension
of the play area, and its structural details are schematic.
Bridge alignment data in `src/data/nuselsky-bridge.json` is also ODbL-licensed
OpenStreetMap data, separate from the original procedural modeling code.
The stairwell is cut through both the upper deck and sidewalk, with adjacent
portal masonry capped below the treads rather than crossing the stair flight.
The initial walk starts outside Leopold Gate, facing its main passage. Saint
Martin's rotunda has separate mapped drum/apse volumes, round-arched windows, a
south portal with columns and steps, tiled roof courses, a paired-window lantern,
and a metal finial. Exterior proportions and decoration are approximate; the
[architectural reference](https://pragitecture.eu/rotunda-of-saint-martin/) was
viewed locally, not used as a texture or bundled image.
Narrow park depressions are softened after terrace grading; wall edges, building
pads and the lower gate cut retain their separate levels.
Procedural stone, brick, plaster, cobbles and roof materials, facade details,
gothic portals, gate arches and fuller trees make the world more connected.
Multipart boundaries now include Vyšehrad Cemetery and its chapel. Grave plots
and headstones are procedural, not records of actual individual burials.
Mapped cemetery fences have open metal railings, posts and collision; existing
walls and arcade buildings complete the enclosure. Mapped gates remain open.
Táborská Gate has taller, approximately 3 m thick exposed-brick flanking walls,
tapering into the existing fortifications, with coping and a pale gatehouse,
stone arch, pilasters, and tiled roof. Entrance-wall heights and thicknesses
are inferred, not mapped measurements.
The garden-side cemetery boundary is a taller solid stone enclosure, with coping
and pilasters rather than railings. Slavín faces into the graveyard with broad
walkable steps, memorial plaques, a sarcophagus, schematic allegorical figures,
and an altar with a cross. Its dimensions and sculpture are original approximations.
Nearby procedural graves and added trees leave the memorial approach clear;
headstones have decorative inscription marks, flowers, and votive lights, not
invented burial names. Local-only photographs informed these details and are
neither bundled nor used as textures.
Mapped trees and tree rows are supplemented with park vegetation.
Mapped point monuments now include the four Myslbek groups, Mikuláš Karlach,
Saint Sebastian and Charles IV. Original stylized sculptures use paired figures,
poses and attributes, not scans or replicas of the original works. Charles IV
remains at its mapped location near Karlov, northeast of the cathedral gardens;
the playable boundary includes that location. Procedural trees leave the
pedestals clear, and walking collides with their bases.
The four Myslbek groups are enlarged by 35% for readability. Mapped benches and
streetlamps replace the sparse furniture placeholders, with lamps glowing at night.
The medieval well, Romanesque stone-bridge remains, and U Vratislava cafe use
their mapped locations. The well enclosure, low bridge-remains display, cafe
terrace, tables, parasols, and small animated fire bowl are original schematic
models. The bridge display is not a reconstruction of a complete bridge or the
buried excavation; the fire bowl is an illustrative detail requested for the scene.
The mapped remains of the Baroque armory portal are rendered as an open garden
arch, with the adjoining boundary wall interrupted at the passage.
Roof end walls close pitched roofs down to their supporting facades; low parent
building volumes fill areas not covered by mapped building parts.
Part edges within 0.5 m of their parent outline are aligned for shared façades;
this is a rendering adjustment, not a correction to the source OSM data.

**This is a simplified present-day MVP, not a surveyed or photorealistic reconstruction.**
Elevation is bilinearly resampled and adjusted near foundations and rampart terraces;
source survey accuracy does not describe this mesh. The mapped river channel is
lowered beneath an illustrative, flat water level; this is not a water-level or
bathymetric survey. Missing boundary-wall heights use defaults; retaining-face
heights are inferred from the resampled upper ground.
Gate details, materials, roof geometry, and added park trees remain approximate.
Mapped courtyard holes are preserved where available; building interiors, the
full casemate network and historical buildings are not reconstructed. Flying ignores building
collision; walking respects mapped building outlines, wall lines and grave plots.
Lighting presets are visual, not a solar simulation.

Map data **© OpenStreetMap contributors**, licensed under
[ODbL 1.0](https://www.openstreetmap.org/copyright). The derivative dataset in
`src/data/world.json` retains that license. A source geometry export is available
at `public/data/vysehrad.osm.xml` and through the app's attribution link.
Contributor account metadata is removed from the downloadable export.
OSM-derived data is not covered by the project's source-code license.

Terrain **© ČÚZK**, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
`src/data/terrain.json` and `public/data/vysehrad-terrain.tif` retain that license.
[Official product and reuse terms](https://geoportal.cuzk.gov.cz/Default.aspx?mode=TextMeta&side=vyskopis&metadataID=CZ-CUZK-DMR5G-V&mapid=8&menu=302).
Heights are sourced in metres Bpv; rendering subtracts a local 185 m datum.
The app includes attribution and downloads for both source datasets.

Local reference footage informed the original modeled details and procedural
materials. Videos and extracted frames are not uploaded, bundled, or used as textures.
This is reference-informed modeling, not photogrammetry.

To refresh the snapshot:

```sh
curl --fail 'https://www.openstreetmap.org/api/0.6/map?bbox=14.410,50.0585,14.429,50.070' -o /tmp/vysehrad.osm.xml
python3 scripts/import_osm.py /tmp/vysehrad.osm.xml
python3 scripts/import_terrain.py
npx prettier --write src/data/world.json src/data/terrain.json
```

The importer uses Python's standard library. It records the retrieval time and
preserves only the tags needed for the scene. Large downloads should use regional
extracts rather than repeatedly calling the OSM editing API.

## Verify

Native geometry diagnostics (no browser or renderer required):

```sh
GEOMETRY_AUDIT_OUTPUT=geometry-audit.json node scripts/geometry-audit.mjs
```

The JSON records finite geometry, facade/door alignment, supported building floors,
mapped furniture clearance, tree/road proximity, courtyard voids, gate openings and
one-metre static walking connectivity. Mapped overlaps and outer-city steep paths
are reported for review, not automatically erased. Building floors share the final
terrain support envelope; retaining-wall foundations and cemetery arcades remain
intentional joins. The duplicate deanery roof outline is retained as a building part.
Bench repairs stay within four metres of mapped positions and on the same path side;
sites without a supported, clear placement are omitted rather than replaced by
arbitrary scenic benches. Doorsteps are flat local slabs, not terrain-flattening pads.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
python3 scripts/test_import_osm.py
```

If Playwright reports a missing browser, run `npx playwright install chromium`.
Browser tests use an isolated server on port 5174 and exercise rendering, walking,
flight, all four discoveries, persistence, lighting, photo mode, and graphics errors.
Screenshots are saved under the ignored `test-results/` directory.
Production output is `dist/vysehrad-explorer/`.
Browser tests use native Metal on macOS and SwiftShader elsewhere. To repeat the
interactive cemetery, roof, park and rampart inspection against the running app:

```sh
node scripts/inspect-scene.mjs test-results/inspection
node scripts/inspect-scene.mjs test-results/walls --walls
node scripts/inspect-scene.mjs test-results/details --details
node scripts/inspect-scene.mjs test-results/passages --passages
node scripts/inspect-scene.mjs test-results/road --road
```

The inspection uses native Metal on macOS, moves through the real controls and
records aerial views, cemetery railings and a walking-height rampart traverse.
The details route inspects the sculptures, taller Sebastian-side wall, garden
portal and both Brick Gate levels, including walking through the two arches.
The passages route walks the upper deck and lower gallery separately, Leopold
Gate, the garden exit, all three posterns, and the 35-step flight. It also inspects
the court, garden, enlarged sculptures, bridge remains, well, cafe, and night lamps.

Further fidelity would require surveyed landmark assets or properly licensed
photogrammetry. Multiplayer and the rest of Prague remain out of scope.

## Dependency audit

The runtime dependency audit is clean. The generated Nx / ESLint toolchain has
26 moderate npm advisory entries rooted in a transitive `minimatch` glob
denial-of-service advisory. These are development dependencies, not shipped
application code. npm currently reports no non-breaking complete fix; do not
apply `npm audit fix --force` blindly, as it proposes downgrading Nx packages.
