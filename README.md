# iso-tash — Tashkent Pixel Map 3D

A living isometric pixel-art map of the whole of Tashkent
The city is a real 3D scene (WebGL, three.js). It is rendered at low resolution, and a post-processing shader turns it into pixel art:

- dark outlines on depth edges;
- a limited palette with ordered dithering;
- a camera snapped to the pixel grid, so panning doesn't shimmer;
- a real sun with shadows, and a day/night cycle that follows Tashkent time.

Every building, road, park, river and tree comes from OpenStreetMap. The data is pre-baked into compact files that ship with the site, so the map works offline and loads fast.

## Features

- **The whole city.** About 390,000 OSM buildings with heights, windows and roof shapes (hipped and gabled roofs in the mahallas, domes on mosques). Roads have sidewalks and lane markings, and there are rails, canals, parks and about 3 million trees whose colours change with the season.
- **A living world.** Cars brake at about 2,000 real traffic lights from OSM. Street lamps and windows light up at night, the Ferris wheel turns, and construction cranes rotate. Cars (sedans, hatchbacks, SUVs, Damas vans) follow each other with smooth acceleration and braking, slow down for turns, take turns at unsignalled junctions and never drive into each other. Traffic thins out at night; buses and marshrutkas run from about 5:30 to 23:30.
- **28 landmarks with hand-built 3D models** placed on their real OSM footprints: Chorsu Bazaar, Kukeldash Madrasa, Hazrati Imam, NestOne, Hilton Tashkent City, Tashkent City Mall, the TV Tower, Romanov Palace, Magic City, Independence Square, Minor Mosque, Pakhtakor, Humo Arena, Milliy Stadium and more. Click one to fly there and open an info card. The card has a Wikimedia Commons photo credited to its author and licence, facts, tips and links to Google Maps.
- **Friendship of Peoples Palace and its square.** The 1981 palace has its colonnade of white pylons with lattice screens and a crown of hexagonal capitals with lamps underneath. The square in front has a tall flagpole with a waving Uzbek flag and the memorial to the Shomahmudov family, lit warm at night.
- **Stadiums matched against photos.** Pakhtakor has its sunken blue-and-yellow bowl, light-blue track and four lattice floodlight masts. Humo Arena has a flared media façade that glows violet at night. Milliy has its crown of white membrane "petals". All other OSM stadiums are drawn as stepped bowls with marked pitches.
- **Detailed landmark models matched against photos.** NestOne is four stepped volumes around a core with a spire and orange stripes, and its edges glow at night. The TV Tower has three curved fin legs, a lattice shaft, two observation pods and a red-and-white antenna. Minor Mosque has white marble, turquoise friezes, a blue dome and two 56 m minarets. Romanov Palace, Magic City, Independence Square, Hilton and Tashkent City Mall were rebuilt the same way.
- **Multi-level roads.** OSM bridges and flyovers rise above the ground on smooth ramps, with deck sides, parapets and pillars. Tunnels dip below ground with walled ramps and portals, and cars drive down into them. Each road class sits at its own height, and markings skip junctions, so roads no longer overlap. Bridges and flyovers are solid 3D structures: a thick deck with a girder underneath, concrete parapets, hammerhead piers, and retaining walls where the ramps meet the ground. The elevated metro runs on a box-girder viaduct, and tracks lie on a ballast bed. Tunnel approach walls rise as the road goes down.
- **Railways and metro.** Where the metro comes up to cross a canal (by the TV Tower, at the Ankhor and at the Salar), it runs in a covered concrete gallery with a skylight, and enters the ground through a portal under a grassy mound. Dead-end sidings and depot tracks end in red-and-white buffer stops.
- **Sports grounds.** About 1,450 football pitches between apartment blocks, tennis, basketball and volleyball courts from OSM, with the right surface (artificial turf, clay, hard court), markings, goals, nets, hoops and chain-link fences. Courts checked against satellite imagery are corrected in `tools/bake/pitches_extra.json` (for example the clay courts of the Yunusabad complex under the TV Tower).
- **Public transport.** Long green articulated buses, regular green buses and white Gazelle minibuses (marshrutkas) run on major roads in the outer lane and stop at bus stops.
- **Notable residential towers.** U-Tower, Modera Towers, Mirabad Avenue, the Kazakhstan complex, NRG Oybek, Xon Saroy Sayram, the experimental Zhemchug (Pearl) house the National Bank (NBU) tower and Tashkent International Airport (terminal, control tower and parked Uzbekistan Airways airliners) have detailed models built on their real OSM footprints. They are part of the city, not entries in the places list.
- **Night lighting.** Hilton, Tashkent City Mall and Nest One have neon strips that cycle through the colours of the Uzbek flag. The TV Tower is floodlit in warm gold at night, with cool-white lights twinkling along the shaft and pods.
- **Minimap** (top right), with a frame showing the current view.
- **"Where am I" box** (top left), showing the mahalla or quarter, district and city.
- **Guided tour**, a time-of-day switch (auto, day, night, cycle) and quality presets.

## Performance: levels of detail

The map is built to run on weak devices. It uses the same LOD techniques as games:

| Zoom | What is drawn |
|---|---|
| Close | Full 3D with real-time shadows, including tree shadows |
| Mid | Low-poly tree crowns (8 triangles instead of about 30); shadows switch off |
| Far | Each tile is one pre-drawn texture (an impostor) holding ground, roads, water, tree crowns and low roofs. Shadows come from a height map. Only tall buildings and landmarks stay 3D. |

Impostor textures are rasterised in a Web Worker with OffscreenCanvas. Levels switch with hysteresis, and the previous level stays visible until the next one is ready, so zooming never shows holes.

At far zoom, triangles dropped from about 15.5 million to about 0.3 million per frame, roughly 40 times fewer. This was measured at 1600×900 on the highest preset.

Other optimisations:

- **Tiles:** the city is split into 651 pre-baked tiles of about 1.8 × 1.8 km each. They are binary, use varint and delta encoding, and are deflate-compressed. Only visible tiles load, nearest first.
- **Background work:** tiles are decoded and built into geometry in Web Workers. Meshes are uploaded to the GPU with a per-frame time budget, so loading doesn't stutter.
- **Rendering:** each tile is a few large merged meshes. Trees, cars and traffic lights use instancing.
- **Memory:** unused tiles and unused detail levels are unloaded.
- **Quality presets:** "Eco", "Normal" and "Max". They set pixel size, FPS, shadows, the number of cars, tile limits and impostor resolution. "Auto" picks one for the device.

## Running

Open `index.html` in a browser. It works straight from disk via `file://`. You can also run `start-server.bat`, which needs Python 3, or any static web server.

You need a browser with WebGL 2: a recent Chrome, Edge, Firefox or Safari. The internet is only needed for card photos, fonts and Google Maps links.

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Pan | Drag | WASD / arrow keys |
| Zoom | Wheel / pinch, double-click | `+` / `−` |
| Rotate 90° | ⟲ ⟳ buttons | `Q` / `E` |
| Open a landmark | Click its model, label or list item | — |
| Close panels | — | `Esc` |

## Project structure

```
index.html, css/style.css
js/config.js        settings and quality presets
js/scene.js         camera, pixel-art post shader, lighting, input
js/geo-worker.js    worker: tile decoding → 3D geometry, far-LOD impostor raster
js/tiles.js         tile loading/unloading, LOD switching, materials, trees
js/models.js        landmark model builder, stadiums
js/models-detail.js detailed landmark models
js/models-decor.js  detailed residential towers (no info cards)
js/traffic.js       road graph, cars, traffic lights
js/city.js          day/night, frame loop
js/landmarks.js     landmark texts
js/ui.js, areas.js, minimap.js, photos.js, data.js, main.js
lib/                three.js r149, earcut 2.2.4
data/t/X_Y.js       pre-baked city tiles
data/               index, landmark placement, districts, minimap
tools/bake/         data baking scripts (Python 3 + numpy + Pillow)
```

## Rebaking the data

To refresh the map from OSM, for example once more of New Tashkent is mapped, run:

```
python tools/bake/fetch_tiles.py raw        # vector tiles: land, roads, water, places
python tools/bake/fetch_osm.py osm/bld      # all OSM buildings (Overpass)
python tools/bake/fetch_extra.py osm        # traffic lights, trees, district boundaries
python tools/bake/bake.py raw osm data      # build data/
python tools/bake/seams.py data             # bridge/tunnel heights across tile edges
python tools/bake/pitches.py fetch osm/pitches.json   # pitches and courts (Overpass)
python tools/bake/pitches.py bake osm/pitches.json data
```

Landmark placement is defined in `tools/bake/landmarks_spec.json`.

Default wall and roof colours (used when OSM has no `building:colour` / `roof:colour`) live in `tools/bake/palette.py`. Roof colours were sampled from satellite imagery of the old-city mahallas, Chilanzar panel blocks and the centre. To apply a changed palette to the already baked tiles without re-downloading OSM, run:

```
python tools/bake/recolor.py data
```

## Limitations

- Tashkent has no open LoD2 building models, so ordinary houses are generated from their OSM footprints and a set of rules. Where OSM has no height or levels, the height is estimated.
- New Tashkent is still mostly empty in OSM.
- Opening hours and prices on the cards change over time and may be out of date.

## Credits and licences

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL.
- Vector tiles: [OpenFreeMap](https://openfreemap.org) (OpenMapTiles schema).
- Buildings, traffic lights, trees and boundaries: Overpass API (maps.mail.ru mirror).
- [three.js](https://threejs.org) (MIT) and [earcut](https://github.com/mapbox/earcut) (ISC).
- Model references: photos on Wikimedia Commons and Wikipedia (used only as references; they are not shipped).
- Card photos: Wikimedia Commons and Wikipedia; the author and licence are shown under each photo.
- Fonts: Inter, Pixelify Sans and Press Start 2P (Google Fonts, OFL).
- Style reference: [Isometric Warsaw](https://bedirhanyildirim.com/warsaw-izo/) by Bedirhan Yıldırım.

All 3D models, shaders and graphics were made from scratch for this project.
