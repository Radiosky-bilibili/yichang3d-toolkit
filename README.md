# yichang3d-toolkit

Small, self-contained tools and scripts built while making
**[yichang-3d](https://github.com/Radiosky-bilibili/yichang-3d)** — a single-file 3D map of the
Three Gorges / Yichang area.

Everything here works on its own: open the HTML files directly — no server, no build step.

> **📖 New here? Read [`MAKING-OF.md`](MAKING-OF.md)** (also in [English](MAKING-OF.en.md)) —
> the long version of how an 82 km flight route was made, including the three times the approach was wrong.
> **中文版见 [MAKING-OF.md](MAKING-OF.md)**

---

## route/ — the flight route story

The most interesting thing in this repo. A camera flies 82 km down the Yangtze, and getting the
route right took longer than anything else in the project.

### Data — the pipeline, end to end

| File | What it is |
|---|---|
| `route/raw/hand-drawn-32-points.json` | **The origin**: 32 points clicked by hand on the map |
| `route/data/path-smoothed-129-control-points.json` | After constrained smoothing (129 control points) |
| `route/data/path-snapped-688-points.json` | Final route, snapped to the valley floor (688 points @ 120 m) |

### Scripts — in the order they were used

| File | What it does |
|---|---|
| `01-smooth-route.py` | **The core algorithm.** Catmull-Rom subdivision → Gaussian smoothing → *pull back anything that strays more than 100 m from the original* → arc-length resample → RDP. Smooth **with a constraint**, so the human's intent survives. |
| `02-mosaic-dem.py` | Stitch a grid of Terrarium elevation tiles, cropped exactly to a bounding box. |
| `03-register-dem.py` | **Registration compensation.** The raw tiles sit ~555 m east / ~370 m south of this project's frame; without compensating, every ridge shifts against the imagery. |
| `04-draw-tool.html` | **Draw a polyline by hand.** Click / drag / long-press / pinch. Ten minutes to trace a river; far better than any automatic water detection I tried. |
| `05-check-page.html` | **Verify a route, pixel by pixel.** Tap anywhere: distance along the route, offset from it, texture pixel, lat/lon. Turns "it feels off here" into a number. |
| `06-preview.html` | Before/after smoothing, plus an elevation profile along the route. |
| `07-basemap.py` | DEM → map image (relief, hypsometric tints, contours, and river width **measured from the DEM**). |
| `08-route-body.js` | How the route is represented inside the app. |
| `09-fpv-camera.js` | The camera work: arc-length travel, FOV opening with speed, banking, landmark tracking, soft limits. |
| `10-hud.js` | The flight HUD, drawn on a **DOM canvas layer** rather than a WebGL texture — 1.37 ms/frame instead of 57 ms. |
| `11-build.py` | Injects the modules into the single-file HTML. |
| `12-recorder.py` | Renders frames out to disk and stitches them into video, without a screen recorder. |

---

## tools/ — the browser tools, ready to open

| File | What it does |
|---|---|
| `draw-river.html` | The drawing tool (same as `route/scripts/04`). |
| `check-page.html` | The route checker (`route/scripts/05`). |
| `preview.html` | Smoothing preview (`route/scripts/06`). |

`basemap.jpg` must sit beside them. **The base map is rendered from elevation data, not satellite
imagery** — see `scripts/basemap/`. That keeps these tools free of third-party imagery.

---

## scripts/ — other pieces

| Folder | Contents |
|---|---|
| `scripts/dem/` | Elevation: mosaic, register, encode to PNG for embedding |
| `scripts/basemap/` | DEM → map image, three iterations and two visual styles |
| `scripts/release/` | GitHub release automation; module injection into built HTML |
| `scripts/snap_server.py`, `snap-png.js` | A tiny local frame recorder for rendering a WebGL scene out to video |

---

## Short version of what went wrong

1. **Automatic water detection never worked.** Colour, elevation and flatness all failed for
   different reasons. 32 points clicked by hand beat all of it.
2. **Smoothing needs a leash.** Unconstrained smoothing cuts corners and flies over land.
   The fix is one line of intent: never stray more than 100 m from what the human drew.
3. **Two datasets can disagree about where things are.** The new elevation was ~555 m off the
   project's frame. Register first, then replace — I hit this exact trap twice.
4. **A feeling is not a number.** Building a tool that reads out *offset in metres at a given
   distance along the route* made the problem solvable in minutes.
5. **The same feature can be 40× cheaper elsewhere.** The HUD went from 57 ms/frame to
   1.37 ms/frame by being drawn on a different surface.

---

## Credits and licensing

- Code and tools here: written for this project. Use them however you like.
- Elevation data: **AWS Open Data — Terrain Tiles (Mapzen)**.
- The base map in `tools/` is generated from that elevation. **No satellite imagery is included
  in this repository.**

Provided as is. Not for navigation or any safety-critical use.
