# yichang3d-toolkit

Small, self-contained web tools and Python scripts built while making
**[yichang-3d](https://github.com/Radiosky-bilibili/yichang-3d)** — a single-file 3D map of the
Three Gorges / Yichang area.

Everything here is written from scratch and **works on its own**: open the HTML files directly,
no server, no build step, no dependencies.

---

## tools/ — three browser tools

| File | What it does |
|---|---|
| **`draw-river.html`** | **Draw a polyline on a map by hand.** Click to drop a point, drag to nudge it, long-press to delete, pinch to zoom. Exports the coordinates as JSON. The 82.4 km river route in yichang-3d was traced with this — placing points by hand turned out to be far more accurate than any automatic water detection I tried. |
| **`check-page.html`** | **Verify a route against the map, pixel by pixel.** Overlays the drawn route on the base map and lets you tap anywhere to read out *distance along the route + offset from it + geographic coordinates*. Built to answer "where exactly should this line be?" — you tap the spot, copy the numbers, and feed them back. |
| **`preview.html`** | **Before/after preview of route smoothing**: the raw hand-drawn line vs the smoothed one, plus an elevation profile along the route. |

Open any of them by double-clicking the file. `basemap.jpg` must sit next to them.

> The base map is **rendered from elevation data**, not satellite imagery — see `scripts/basemap/`.
> That keeps these tools free of any third-party imagery.

---

## scripts/ — Python (and a bit of JS)

### `scripts/dem/` — building an elevation dataset

| Script | Purpose |
|---|---|
| `mosaic_dem.py` | Stitch a grid of Terrarium elevation tiles into one raster, cropped exactly to a bounding box. |
| `build_dem_reg.py` | Rebuild the DEM at a target resolution **and register it** to an existing frame. Registration matters: the raw tiles sat ~555 m east / ~370 m south of the frame the imagery and the hand-drawn route agreed on. Skip that step and the whole terrain shifts against everything else. |
| `build_dem_app.py` | Encode a DEM as a Terrarium RGB PNG for embedding in a web page, quantised to 1 m. Quantising to whole metres makes the blue channel constant, which roughly halves the PNG size for free. |

### `scripts/basemap/` — turning a DEM into a map image

| Script | Purpose |
|---|---|
| `make_base.py` | First attempt: hillshade + hypsometric tints + contours. |
| `make_base2.py` | Second attempt — multi-scale relief, fractal detail noise, and **river width measured from the DEM** (marching outward until the ground rises), so reservoirs come out wide and gorges narrow. |
| `make_base3.py` | Current version. Works in row chunks to keep memory down, and every parameter is defined in **metres**, so output resolution is independent of the look. |

Two styles are included: a modern hypsometric/contour map and an ink-wash one.

### `scripts/release/` — GitHub automation

| Script | Purpose |
|---|---|
| `create_release_v13.py` | Create a release and stream an asset up to it, idempotently. |
| `patch_idletour.py` / `patch_vcloud.py` | Inject a JS module into a built HTML file at a verified top-level anchor. |

### `scripts/snap_server.py` + `snap-png.js`

A tiny local recording server: the page POSTs frames to it and it writes them to disk, so a
WebGL scene can be rendered out to video without a screen recorder.

---

## A few things learned the hard way

- **Register before you swap.** Two elevation datasets of the same area differed by ~500 m. Resampling the new one directly would have moved every ridge against the imagery. Cross-correlate first, compensate, then replace.
- **Anchor injections to top-level statements.** Finding an insertion point by brace-matching silently dropped one module *inside* a click handler — where it never ran, and never complained.
- **Quantise elevation.** 1 m resolution is plenty for terrain, and it makes the third byte constant — free compression.
- **Row-chunk your image pipeline.** A full-width float32 RGB buffer at 4096 px is ~200 MB per copy; the same work in 256-row strips is a non-event.
- **Check where "washed out" actually comes from.** A map that looked hazy at distance was not the geometry, the sky or the edges — it was the fog density sitting just slightly too high.

---

## Credits and licensing

- Code and tools here: written for this project. Use them however you like.
- Elevation data: **AWS Open Data — Terrain Tiles (Mapzen)**.
- The base map in `tools/` is generated from that elevation, so no third-party imagery is bundled.
- **No satellite imagery is included in this repository.**

Provided as is. Not for navigation or any safety-critical use.
