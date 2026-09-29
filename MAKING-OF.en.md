# Making of: how an 82 km flight route grew

This is a **field log of things that went wrong**, not a tutorial.

The goal sounded simple: fly a camera 82 km down the Yangtze, low over the water.

It turned out to be the longest single stretch of the project, and the approach was **wrong in three directions** before it was right.

---

## Act 1 — Let a machine find the river. It didn't.

The obvious idea: the imagery is right there, so **detect the water automatically**.

What I tried:

- **Colour thresholding.** Water is blue, mountains are green. Except the river reflects the sky and goes white, tributaries and shadows go dark, and no threshold worked everywhere. Tune it for the gorge and it swallows the city.
- **Elevation.** Water is the lowest thing. Except above the Three Gorges Dam the river *is* a reservoir at 175 m, while downstream in the city it sits at 40 m — so "below this height" misses the entire upper half.
- **Local flatness.** Water is flat. So is farmland.

Layered together they produced a `water_mask`, and a centreline extracted from it.

**Result:** the centreline wandered onto the banks, and in places up a side valley. I spent a whole night tuning parameters, making an increasingly elaborate patch for a method that was simply wrong.

> What survives of that work is in `route/scripts/07-basemap.py` — asking the DEM for the flat low ground works *beautifully* for **drawing a base map** (reservoirs come out wide, gorges narrow). It just can't place a flight line.

**Conclusion: abandon automatic extraction.**

---

## Act 2 — Let a human draw it. That worked.

New idea: **a person clicks a few points on the map**, and the machine handles everything downstream.

So I wrote a drawing tool, `draw-river.html`:

- click to drop a point, drag to nudge, long-press to delete, pinch to zoom
- live readout of point count and total length
- one-click JSON export
- (later, a "send to me" button that POSTs straight to a little local server, skipping copy-paste)

**32 points.** Ten minutes of work.

Then something striking happened: **the line through those 32 points simply followed the river.**

Not "usable after cleanup" — visibly *better* than anything the automatic pass produced. A person can see where the valley is at a glance; a machine has to guess through thresholds.

> A small lesson: when an automatic method needs more and more human-tuned parameters to survive, the problem is probably not the parameters. It's the method.

---

## Act 3 — The polyline was too angular. But you may not sand off intent.

32 points make a chain of straight segments with sharp corners. Unusable for a flight.

So: smooth it. But **smoothing alone breaks things** — pushed hard enough, the line cuts the corner on a tight bend and flies over dry land.

The algorithm that actually worked (`01-smooth-route.py`):

```
1. Catmull-Rom subdivision   32 points → tens of thousands (polyline → smooth curve)
2. Gaussian smoothing        removes residual jitter (σ = 260 m)
3. ★ pull back if it strays ★ iterate: any point further than 100 m from the original
                             polyline gets dragged back along the normal to 100 m
4. Resample by arc length    even spacing, one point every 120 m
5. RDP simplification        drop redundancy → 129 control points
```

**Step 3 is the whole idea.** It is not "make the line smooth", it is "**make it as smooth as possible while staying within 100 m of what the human drew**".

The corners went from tens-of-metres kinks to something close to real river-bend curvature — and **every intention in those 32 clicks survived**.

> The script prints the receipts: 82.43 km long, median deviation from the original **1 m**, maximum 260 m, minimum radius of curvature 380 m.

**"Smooth with a constraint" turned out to be a reusable idea.**

---

## Act 4 — The route existed; the terrain didn't.

A flight line isn't enough: the camera needs to know **how high above the ground it is**, or it either clips a ridge or floats in space.

So: download 165 z13 terrain tiles → stitch into a 3840×2811 raster (`02-mosaic-dem.py`) → crop to the exact map frame → and then **register it**, which nearly went wrong.

Comparing the new raster against the one already in the project showed the two agree on the shape of the mountains but sit **about 555 m east / 370 m south of each other**.

Not a precision problem — a **registration** problem. The raw tiles and the "imagery + hand-drawn route" frame were not the same frame. Swapping without compensating would have shifted every ridge half a kilometre against the imagery: **worse than not swapping.**

The fix was a translation search (cross-correlation), then compensate in the opposite direction while sampling. Residual error dropped from 59.6 m to 9.8 m.

> **Lesson:** before replacing a dataset, confirm the two agree on *where things are*. I hit this exact trap a second time later.

---

## Act 5 — How do you know the line is right?

Once the route existed: **how do I confirm it lines up?**

It looked right. But by how much? So I wrote a second tool, `check-page.html`:

- overlays the route on the base map at **1:1 pixel alignment**
- tap anywhere to read **distance along the route + offset from it + texture pixel + lat/lon**
- one-click copy

So "I think it's off around here" becomes a number: *at 38.2 km, the line is 210 m north of where I tapped.*

**Turning a feeling into a number** made the whole conversation much faster.

---

## Act 6 — Making it feel like flight, not a slide

The route is coordinates; flight is **camera work**. From `09-fpv-camera.js`:

| Detail | Why |
|---|---|
| **Arc-length parameterisation** | Travel by distance, so speed is even. By index, the camera slows wherever points happen to be dense. |
| **FOV opens with speed** | 62° → 80°. Widening the view while accelerating is what eyes and lenses do; without it, motion reads as a slide. |
| **Bank into turns** | First attempt banked ±17° and made people queasy — dialled back to ±2–3°. |
| **Slight speed jitter** | Perfectly constant speed puts viewers to sleep. A little noise makes it alive. |
| **Landmarks introduce themselves** | The camera climbs, turns, pulls a longer lens, and fades in a card. |
| **Soft limits via tanh** | A hard clamp flips back and forth at the threshold and the image stutters. `maxYaw * tanh(need/maxYaw)` is continuous. |
| **Portrait gets its own compensation** | Portrait horizontal FOV is only ±15° (landscape ±31°), so landmarks kept falling off-screen. Cruise gets the wider FOV; the landmark close-up does not — otherwise the long lens is undone. |

**"It doesn't turn enough" took four rounds**: first I assumed the limit was too small and raised it; then that it started too late and moved it earlier; then that portrait FOV was the issue; and only then found that the soft limit and the distance tiers had to be fixed together. **Each round solved part of it.** That's normal.

---

## Act 7 — The HUD nearly ate the frame budget

The flight HUD (speed, altitude, heading, progress) started life drawn into a **WebGL texture**:

- offscreen render → read pixels → encode → upload
- **57 ms per frame** — 17 fps, for a static overlay ✗

Then it moved to a **DOM canvas layer**:

- the browser composites it; WebGL does nothing
- **1.37 ms per frame** ✓ — about 40× faster

**Same interface, different place to draw it, two orders of magnitude apart.**

Two smaller wins: cache the vignette as a small image and stretch it (never `createRadialGradient` full-screen every frame), and measure the control bar's height at runtime to place the HUD's bottom margin (or it covers the interface).

---

## Act 8 — Recording what it looks like

No usable screen recorder, so: the page renders to an offscreen target → reads pixels back → encodes JPEG → POSTs to a tiny local server (`12-recorder.py`) → frames land on disk → ffmpeg stitches them into a video.

Obstacles:

- **A background tab gets throttled**, and the recording loop dropped to 0.3 fps ✗ → drive it in batches from outside (60–120 frames per call)
- ffmpeg in this environment **only has the videotoolbox encoder** (no libx264) and no `eq` filter ✗
- ffmpeg's concat demuxer couldn't open the list file under `/tmp` → rename segment B's frames to follow segment A and encode once ✗

---

## Later: the same trap, again

Late in the project the embedded elevation went from 1024² to 2048² — and **there was that 555 m registration difference again**, same trap, different dataset.

Because it was written down the first time, the fix was immediate: run the translation search, confirm, compensate. A few minutes.

**Which is the whole reason for writing these things down.**

---

## What I'd carry forward

1. **When automation stalls, hand it to a human.** Let the machine do what it's good at — interpolation, smoothing, registration, rendering — and let eyes do the judging.
2. **Smooth with a constraint.** "As smooth as possible" betrays intent; "as smooth as possible *within 100 m*" is right. The limit is what makes it work.
3. **Check that two datasets share a frame** before swapping. They can look identical and be half a kilometre apart.
4. **Turn feelings into numbers.** "It feels off here" → "at 38.2 km it's 210 m north". Suddenly solvable.
5. **The same feature can differ 40× by implementation.** HUD in a WebGL texture vs a DOM canvas: 57 ms vs 1.37 ms.
6. **Write it down.** Future-you will meet the same trap.

---

## Where everything is

| Path | What |
|---|---|
| `route/raw/hand-drawn-32-points.json` | **Where it all starts**: the 32 hand-placed points (texture pixels) |
| `route/data/path-smoothed-129-control-points.json` | Smoothed control points |
| `route/data/path-snapped-688-points.json` | Final route, snapped to the valley floor (688 pts @ 120 m) |
| `route/scripts/01-smooth-route.py` | Constrained smoothing (subdivide + Gaussian + pull-back + RDP) |
| `route/scripts/02-mosaic-dem.py` | Stitch terrain tiles |
| `route/scripts/03-register-dem.py` | **Registration compensation** (the 555 m trap) |
| `route/scripts/04-draw-tool.html` | The drawing tool |
| `route/scripts/05-check-page.html` | Route checking / pointing tool |
| `route/scripts/06-preview.html` | Before/after smoothing + elevation profile |
| `route/scripts/07-basemap.py` | DEM → base map (includes river-width probing) |
| `route/scripts/08-route-body.js` | How the route lives inside the app |
| `route/scripts/09-fpv-camera.js` | Camera work (arc length, FOV, banking, landmark tracking) |
| `route/scripts/10-hud.js` | HUD (DOM canvas version) |
| `route/scripts/11-build.py` | Build: inject modules into the single-file HTML |
| `route/scripts/12-recorder.py` | Frame recorder → video |

> Coordinates are **local metres**: X east, Z south, origin at the map centre. This must match the main app exactly, or everything lands in the wrong place.
