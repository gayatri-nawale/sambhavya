# SAMBHAVYA Prototype — Build Guide for Claude Code

**What this file is:** the complete plan for a front-end-only, visually working prototype of SAMBHAVYA, plus copy-paste prompts for Claude Code, run in order.

**How to use it:**
1. Create an empty folder, open it in Claude Code.
2. Save this file inside it as `docs/PROTOTYPE_SPEC.md`.
3. Run the prompts in Part 9 one at a time. Check each phase's acceptance criteria before moving on.

---

## Part 1 — What we are building

SAMBHAVYA is an extreme-weather threat-tracking system for medium-range forecasts (3–10 days). It reads NCMRWF's 23-member NEPS-G ensemble (12 km), finds and tracks threats on a spherical mesh, calibrates the ensemble, sharpens each threat zone to 5 km with a physics-checked diffusion model, and issues forecaster-approved Low / Moderate / Severe alerts.

The prototype must **show this whole system working at small scale**, entirely in the browser:

- No backend, no API calls, no keys, no external network requests at runtime.
- All data comes from a **seeded, deterministic simulation engine** in the front end, shaped after real events.
- Every "processing" step is animated: data arriving, members being scanned, the model running, gates passing or failing.
- It must look like a real product website and operations console, not a hackathon demo.

### Ground rules (apply to every page)

| Rule | Why |
|---|---|
| No SIH branding, problem-statement ID, team name or team ID anywhere | Must read as an actual product |
| Every data view carries a small chip: **"Replay · illustrative values"** | Honesty. Judges respect it, and nothing claims measured skill |
| Real facts only where real: NEPS-G 23 members / 12 km / 10 days / runs at 00 & 12 UTC; NEPS-R 4 km to 75 h; CAP 1.2 format used by NDMA SACHET; EFI vs a 30-year ERA5 baseline | Credibility with meteorologist judges |
| Everything else (numbers, grids, scores) is generated and labelled illustrative | Never present invented numbers as results |
| Forecaster approval always comes before any public alert | Matches the slides and the architecture |

### Scenarios (the sample data)

All three are **replays shaped after real events**, with illustrative values:

| Scenario | Shape after | Facts we may state | Everything else |
|---|---|---|---|
| **Cyclone replay** (default) | Cyclone Amphan, May 2020, Bay of Bengal | Landfall on 20 May 2020 between Digha (West Bengal) and Hatiya (Bangladesh); gusts up to ~185 km/h | Track points approximate (genesis in the south Bay around 10°N 87°E on 16 May, recurving north to the Digha–Sundarbans coast); member spread, rain fields, probabilities all illustrative |
| **Heatwave replay** | North-west India heat, late May 2024 | A severe heatwave affected north-west India in late May 2024 | Temperatures, EFI fields and zones illustrative |
| **Humid-heat replay** | Coastal humid heat, east coast | Wet-bulb temperature is the measure an IMD study recommends for heat stress | Values illustrative |

---

## Part 2 — Design system

### Concept: "the synoptic chart"

The visual identity comes from the meteorologist's own artefact: the **synoptic weather chart**, with isobars, contour lines, track symbols and warning colours. Contour lines are the one recurring motif (hero background, section dividers, empty states). Everything else stays quiet and disciplined.

What we deliberately avoid (generic AI-site tells): cream backgrounds with serif headlines, black-with-neon, identical rounded cards with soft shadows everywhere, all-caps eyebrow labels above every heading, monospace for small labels, emoji, "→" glued to button text.

### Colour tokens

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#14213D` | Text, console chrome, headings |
| `--bay` | `#0F4C75` | Ocean on maps, map UI |
| `--mist` | `#EEF2F6` | Page background (cool, not cream) |
| `--paper` | `#FFFFFF` | Panels, surfaces |
| `--teal` | `#1F8A84` | Primary interactive colour, calibrated probabilities |
| `--line` | `#C9D3DE` | Borders, dividers, contour lines |
| `--warn-low` | `#F2C230` | Low risk only |
| `--warn-mod` | `#EF8A24` | Moderate risk only |
| `--warn-sev` | `#D62839` | Severe risk only |

The three warning colours follow IMD's yellow / orange / red logic and are **used only for risk**, never for decoration.

**Rain colormap** (mm/day): transparent → `#C6E2F5` → `#6BAED6` → `#2171B5` → `#6A51A3` → `#C51B8A`.
**Temperature / anomaly colormap:** diverging `#2166AC` → `#F7F7F7` → `#B2182B`.

### Typography

- **IBM Plex Sans Condensed** (600, 700) for headlines and big numbers. Technical, institutional, and narrow enough for dense dashboards.
- **IBM Plex Sans** (400, 500, 600) for body and UI, with `font-variant-numeric: tabular-nums` on all data.
- Self-host via `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-sans-condensed` (no font CDN calls).
- Scale: 14 / 16 / 20 / 28 / 40 / 64 px. Body line-height 1.55, headlines 1.05. Max line length about 70 characters.
- Sentence case everywhere. No all-caps labels.

### Layout and components

- **Public site:** left-aligned, generous whitespace, 12-column grid, max width 1200 px.
- **Console:** fixed left rail (240 px), top bar, main canvas. Maps fill their panel edge to edge.
- **Border radius by hierarchy:** 4 px for chips and inputs, 8 px for panels, 0 for full-bleed maps. Not one radius on everything.
- **Shadows:** only on floating elements (popovers, the alert phone preview). Panels use a 1 px `--line` border instead.
- **Components to build once and reuse:** `Panel`, `StatusChip`, `ReplayChip`, `RiskBadge`, `StepTimeline`, `LeadTimeSlider`, `MapCanvas`, `Legend`, `MetricTile`, `LogStream`, `PhoneFrame`.

### Motion

- **One orchestrated moment on the home page:** the hero chart draws its 23 member tracks, which then converge into the probability cone.
- **In the console, motion only answers actions:** running a forecast, scrubbing lead time, approving an alert.
- Respect `prefers-reduced-motion` (show end states instantly).

---

## Part 3 — Tech stack (front end only)

| Need | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript (strict, no `any`) |
| Routing | React Router |
| Styling | Tailwind CSS with the tokens above as CSS variables |
| State | Zustand (one store for the simulation) |
| Maps | `d3-geo` + `topojson-client` + `world-atlas` (bundled, offline) drawn on `<canvas>` with SVG overlays |
| Charts | Recharts |
| Motion | `motion` (Framer Motion) |
| Icons | `lucide-react` |
| Fonts | `@fontsource` packages (self-hosted) |

No map tile servers, no fetch calls. The site must work with the network unplugged.

---

## Part 4 — Information architecture

```
/                       Home
/how-it-works           How a forecast run works
/science                Methods, data and limits
/console                Console (redirects to /console/run)
  /console/run          Forecast run         (pipeline monitor)
  /console/tracker      Threat tracker       (SEE)
  /console/sharpen      5 km downscaling     (SHARPEN)
  /console/calibration  Calibration          (trust in probabilities)
  /console/alerts       Risk & review        (DECIDE)
  /console/verify       Verification         (LEARN)
  /console/sources      Data & provenance
```

Console top bar (on every console page):
- Scenario switcher: Cyclone replay · Heatwave replay · Humid-heat replay
- Run selector: e.g. "NEPS-G run 16 May 2020, 00 UTC"
- `ReplayChip`
- Button: **Play guided demo**

---

## Part 5 — Page specifications

### 5.1 Home `/`

**Job:** in 10 seconds, a visitor understands what SAMBHAVYA does and wants to open the console.

```
+--------------------------------------------------------------+
| SAMBHAVYA            How it works  Science  [Open console]    |
+--------------------------------------------------------------+
| See the storm                 |  [ANIMATED SYNOPTIC CHART]    |
| before it arrives.            |  Bay of Bengal, isobars,      |
|                               |  23 member tracks fanning,    |
| Calibrated 5 km threat        |  converging into a cone,      |
| guidance for Days 4–10,       |  5 km risk patch at coast     |
| from India's own ensemble.    |                               |
| [Watch a forecast run]        |  lead time T+0 ... T+96 h     |
| [Open the console]            |                               |
+--------------------------------------------------------------+
| The gap we fill   (lead-time chart, real sequence)            |
|  0h ------ 75h ----------------------------------- 240h       |
|  NEPS-R 4 km ensemble ███                                     |
|  BharatFS 6 km ███████████████ (single run, no probability)   |
|  NEPS-G 12 km ensemble ██████████████████████████████████     |
|  SAMBHAVYA 5 km probabilistic      ███████████████████████    |
+--------------------------------------------------------------+
| How a run works: 1 Scan  2 Track  3 Calibrate  4 Sharpen      |
|                  5 Check  6 Review & alert   (a real sequence)|
+--------------------------------------------------------------+
| Who it serves: Forecasters · Disaster response ·              |
|                Farming communities · People in at-risk zones  |
+--------------------------------------------------------------+
| Honest by design: replay data, quality gate, human approval   |
+--------------------------------------------------------------+
| Footer: product name, short description, links                |
+--------------------------------------------------------------+
```

- **Hero chart:** canvas map of the Bay of Bengal and Indian coast. On load (once), the 23 member tracks draw in, cluster into 2–3 scenario paths, then a probability cone and a small 5 km Severe patch appear at the coast. A slim lead-time scrubber below it lets visitors drag through time.
- **Copy:**
  - Headline: "See the storm before it arrives."
  - Subline: "SAMBHAVYA tracks extreme weather across India's 23-member ensemble and sharpens each threat to 5 km, up to ten days ahead."
  - Buttons: "Watch a forecast run" (starts the guided demo) and "Open the console".
- **The gap:** horizontal lead-time bars with the real facts listed above.
- **Who it serves:** four short blocks, one line each, with a small icon. Not identical cards.

### 5.2 How it works `/how-it-works`

A scroll story through the six steps. Each step shows a small live visual on the right:

1. **Scan:** ensemble cube (member × time × grid) with chunks lighting up, then the EFI field appearing.
2. **Track:** icosahedral mesh sphere (wireframe) with nodes lighting up where threats are; then tracks forming.
3. **Calibrate:** a reliability curve moving from over-confident (raw) towards the diagonal (calibrated).
4. **Sharpen:** blocky 12 km rain field morphing into a sharp 5 km field; peak value label stays high.
5. **Check:** three gate checks ticking: peaks kept, water balance, matches 12 km. One example fails, falling back to 12 km.
6. **Review & alert:** an alert card being approved; a CAP alert previewed.

### 5.3 Science `/science`

Plain-language sections:
- The models, in short (GNN on icosahedral mesh, EMOS, residual diffusion, physics constraints)
- Data we use (NEPS-G, NCUM-G/R, IMDAA, ERA5, IMERG, CHIRPS, IBTrACS, SRTM)
- How we verify (baselines: TempestExtremes, bilinear, plain U-Net; metrics: track error, FSS, CRPS, Brier)
- What this prototype is and is not ("replay with illustrative values; no measured skill is claimed")
- References list

### 5.4 Console: Forecast run `/console/run` ⭐ the "it's working" page

**Job:** show a full NEPS-G run being processed end to end.

```
+-----------+--------------------------------------------------+
| Left rail | Top bar: scenario · run · Replay chip · Demo     |
|           +--------------------------------------------------+
|           | [Run forecast]  elapsed 00:42   GPU-min 6.1 (sim)  |
|           +------------------------+-------------------------+
|           | Pipeline timeline      | Live view of current    |
|           |  ✔ Receive NEPS-G run   | step (changes per step) |
|           |  ✔ Decode & chunk       |                         |
|           |  ● Anomaly fields (EFI) |                         |
|           |  ○ Screen globe (GNN)   |                         |
|           |  ○ Track members        |                         |
|           |  ○ Calibrate            |                         |
|           |  ○ Sharpen to 5 km      |                         |
|           |  ○ Quality gate         |                         |
|           |  ○ Risk scoring         |                         |
|           |  ○ Ready for review     |                         |
|           +------------------------+-------------------------+
|           | Log stream (timestamped lines, auto-scroll)       |
+-----------+--------------------------------------------------+
```

**Step-by-step live views (the simulation must show each):**

| Step | Live view | Example log lines |
|---|---|---|
| Receive NEPS-G run | 23 member tiles filling in as they "arrive" | `Received member 07/23 · 12 km · 41 lead times` |
| Decode & chunk | grid splitting into 10°×10° chunks | `Wrote 1,968 chunks to Zarr store` |
| Anomaly fields (EFI) | EFI map fading in over the region | `EFI computed vs 30-yr baseline · max 0.94 (rain)` |
| Screen globe (GNN) | mesh nodes lighting up; 2 candidate regions boxed | `Tier-1 screening: 2 candidate regions` |
| Track members | member tracks drawn one by one, then clustered | `Linked 23 member tracks · 3 scenarios` |
| Calibrate | probability bars shifting raw → calibrated | `Calibrated exceedance: 0.71 → 0.58` |
| Sharpen to 5 km | tile-by-tile 128×128 patches turning sharp | `Patch 14/31 sampled · 4 samples · 2 steps` |
| Quality gate | three checks ticking | `Peaks kept ✓ · Water balance ✓ · Matches 12 km ✓` |
| Risk scoring | 5 km zones coloured Low/Mod/Severe | `142 zones scored · 9 Severe` |
| Ready for review | "3 alerts waiting for review" with a link to Risk & review | |

- Total run time about 40–60 seconds, with a **speed control** (1×, 2×, 4×) and **Pause**.
- All numbers come from the seeded engine and are labelled "(sim)" or covered by the Replay chip.

### 5.5 Threat tracker `/console/tracker` (SEE)

- Full map canvas. Layers toggle: **Member tracks**, **Scenarios**, **Probability cone**, **EFI field**.
- **Lead-time slider** T+0 to T+240 h (6-hourly), with play/pause.
- **Hazard filter:** Cyclone · Heavy rain · Heatwave · Humid heat · Cold wave · Strong wind (each scenario populates the relevant ones).
- Right panel "Threat details": type, scenarios with probabilities (e.g. "Landfall near Digha 55% · Sundarbans 30% · Recurve 15%"), core location, expected timing window, member agreement "17 of 23", and key drivers.
- A 4D box shown as a tube: the box outline moves with the slider.

### 5.6 5 km downscaling `/console/sharpen` (SHARPEN)

- Pick a threat box, then a **split-view comparison slider**: left 12 km input (blocky), right 5 km output (sharp). Drag the divider.
- Toggle methods: **Bilinear**, **Plain U-Net**, **SAMBHAVYA (diffusion)**. Show visibly that bilinear and U-Net blur the peak while diffusion keeps it.
- **Sample picker:** 4 samples per member; the field changes slightly per sample (it's probabilistic).
- Metric tiles: Peak rain (mm/day) per method; "Peak kept" % (illustrative).
- Small chart: radially averaged power spectrum for the three methods (diffusion closest to the reference).
- **Quality gate panel:** three checks with pass/fail; a button "Show a failing case" demonstrates the fallback: "Gate failed, publishing calibrated 12 km instead."

### 5.7 Calibration `/console/calibration`

- **Reliability diagram:** raw NEPS-G (curve below the diagonal = over-confident) versus calibrated (near the diagonal). Toggle by lead time (Day 3 / 5 / 7 / 10).
- **Spread vs error** chart: raw spread too small, calibrated spread matches error.
- Plain explanation: "Raw ensemble members agree more than they should. Calibration fixes this, so a 60% alert comes true about 6 times in 10."
- **Stable warnings** demo: two consecutive runs; with blending and hysteresis the alert level stays steady instead of flipping.

### 5.8 Risk & review `/console/alerts` (DECIDE)

```
+----------------------------+---------------------------------+
| Alert queue (3 waiting)    | Map: 5 km zones Low/Mod/Severe  |
|  [Severe] Heavy rain + wind|  selected alert's zone outlined  |
|   Digha coast · T+96 h     |                                  |
|   P(>204 mm/24h) 0.47      |                                  |
|  [Moderate] ...            +---------------------------------+
|  [Low] ...                 | Alert detail                     |
|                            |  probability, lead time, drivers,|
|                            |  member agreement, scenario      |
|                            |  [Approve] [Edit] [Hold]         |
+----------------------------+---------------------------------+
| After approval: CAP 1.2 XML preview  |  Phone preview of what  |
| (generated from the alert)           |  people in the zone see |
+--------------------------------------+-------------------------+
```

- **Approve** turns the card into "Approved" with a timestamp and generates a CAP 1.2 XML snippet (identifier, sent, status, msgType, info: event, urgency, severity, certainty, area polygon). Label it "CAP 1.2 format (as used by NDMA SACHET)". **Do not** claim it is sent to SACHET.
- **Edit** lets the forecaster change the severity or the message text.
- **Hold** moves the alert to "On hold".
- **Phone preview:** an SMS-style message in English, with a Hindi toggle (short, correct, simple Hindi).
- **Audience switch:** Disaster response view (zones, lead time, core point) / Agromet advisory view (crop-relevant wording).

### 5.9 Verification `/console/verify` (LEARN)

- Ledger table of past replay alerts: issued level, lead time, what happened (observed), result (hit / miss / false alarm).
- Metric tiles (illustrative): track error at 48/72/120 h for **SAMBHAVYA vs TempestExtremes vs raw ensemble mean**; CSI; FAR; Brier; **alert flips per event (single run vs blended)**.
- A note: "Scores feed back into calibration."

### 5.10 Data & provenance `/console/sources`

- Table of inputs with role, resolution and status chip: NEPS-G, ERA5 (30-yr baseline), IMDAA, NCUM-G/R pairs, IMERG, CHIRPS, IBTrACS, SRTM.
- Model registry: tracker v0.4, calibration v0.2, downscaler v0.3, each with a short hash, training-data note and "illustrative".
- Run provenance: for the current alert, show which run, members, model versions and checks produced it.

### 5.11 Guided demo (button in the top bar and on the home page)

A scripted 2-minute walkthrough for judges, with caption cards at the bottom of the screen:

1. Forecast run starts (4× speed) → "A new NEPS-G run arrives: 23 members, 12 km, 10 days."
2. Tracker → "The GNN finds the cyclone and follows it in every member."
3. Calibration → "Raw probabilities are over-confident; we correct them first."
4. Sharpen → "Diffusion sharpens the threat to 5 km and keeps the peak."
5. Quality gate → "If a check fails, the calibrated 12 km forecast is used instead."
6. Risk & review → "A forecaster approves; a CAP alert is generated for the 5 km zone."
7. Verification → "Afterwards, every alert is scored against what happened."

Esc exits the tour at any time.

---

## Part 6 — Simulation and data engine

All in `src/sim/`. **Deterministic** (seeded RNG, e.g. mulberry32), so the demo looks identical every time.

| Module | What it generates |
|---|---|
| `rng.ts` | Seeded random number generator |
| `geo.ts` | Region boxes: Bay of Bengal (5–28°N, 78–98°E), north-west India, east coast |
| `scenarios.ts` | The three scenarios: metadata, run time, hazard types, real facts allowed, track control points |
| `ensemble.ts` | 23 member tracks: perturb the control track with growing spread over lead time; cluster into scenarios |
| `fields.ts` | 12 km grid (~0.11°) and 5 km grid (~0.045°): rain = cyclone Gaussian + rain bands + coastal/terrain enhancement + noise; temperature and wet-bulb for heat scenarios |
| `downscale.ts` | Bilinear (smooth), U-Net-like (blurred, peak reduced), diffusion-like (sharp, peak kept, slight variation per sample) |
| `calibration.ts` | Raw vs calibrated reliability curves and spread/error per lead time |
| `risk.ts` | 5 km neighbourhood exceedance probability → Low/Mod/Severe zones; alert objects |
| `cap.ts` | Builds a CAP 1.2 XML string from an alert |
| `pipeline.ts` | The run state machine: steps, durations, log lines, progress, speed, pause |
| `verify.ts` | Ledger rows and illustrative metric values |

Rules:
- Keep generated grids small enough to stay fast (render to an offscreen canvas once per lead time and cache).
- Every exported dataset carries `illustrative: true`; components show the Replay chip when they render it.

---

## Part 7 — Folder structure

```
src/
  app/            router, layout, providers
  pages/          Home, HowItWorks, Science, console/*
  components/     ui/ (Panel, Chip, Badge, ...), map/, charts/, layout/
  sim/            simulation engine (Part 6)
  store/          zustand store (scenario, run state, selections, tour)
  styles/         tokens.css, globals.css
  content/        copy strings, references
public/
  favicon.svg
docs/
  PROTOTYPE_SPEC.md   (this file)
CLAUDE.md
```

---

## Part 8 — CLAUDE.md (Prompt 0 creates this)

```markdown
# SAMBHAVYA prototype — project rules

- Front-end only. No backend, no fetch, no external network calls at runtime.
- Vite + React 18 + TypeScript (strict; never use `any`). Functional components and hooks.
- Tailwind with CSS-variable tokens from docs/PROTOTYPE_SPEC.md Part 2. Do not invent new colours.
- Fonts: IBM Plex Sans Condensed (headlines) + IBM Plex Sans (body), self-hosted via @fontsource.
- All data comes from src/sim (seeded, deterministic). Every data view shows the "Replay · illustrative values" chip.
- Never show SIH, problem-statement IDs, team names or team IDs.
- Only state real facts listed in docs/PROTOTYPE_SPEC.md Part 1. Everything else is illustrative.
- Risk colours (yellow/orange/red) are used only for risk.
- Sentence case. No all-caps labels, no emoji, no "→" in button text.
- Respect prefers-reduced-motion. Keyboard focus visible. Responsive down to 375 px.
- After each task: run `npm run build` and fix all type errors before finishing.
```

---

## Part 9 — Step-by-step Claude Code prompts

Run these in order. Each phase lists what to check before moving on.

### Prompt 0 — Setup

```
Read docs/PROTOTYPE_SPEC.md fully. Create CLAUDE.md with exactly the content in Part 8.
Scaffold a Vite + React 18 + TypeScript project in this folder. Install: react-router-dom,
tailwindcss, zustand, d3-geo, topojson-client, world-atlas, recharts, motion, lucide-react,
@fontsource/ibm-plex-sans, @fontsource/ibm-plex-sans-condensed, and the needed @types packages.
Set up the folder structure from Part 7. Configure TypeScript strict mode.
Do not build any pages yet.
```
**Check:** `npm run dev` shows a blank app; `npm run build` passes; CLAUDE.md exists.

### Prompt 1 — Design system

```
Implement the design system from docs/PROTOTYPE_SPEC.md Part 2.
1. src/styles/tokens.css with all colour tokens, the rain and anomaly colormaps (as TS arrays too),
   type scale and radii. Wire them into Tailwind.
2. Load IBM Plex Sans Condensed (600, 700) and IBM Plex Sans (400, 500, 600) via @fontsource.
3. Build reusable components in src/components/ui: Panel, StatusChip, ReplayChip, RiskBadge
   (Low/Moderate/Severe), Button (primary/secondary/ghost), MetricTile, StepTimeline, LogStream,
   Legend, PhoneFrame, Tabs, Toggle.
4. Create a hidden /_kit route that shows every component in all states.
Follow the "avoid" list in Part 2 strictly.
```
**Check:** /_kit looks consistent; no all-caps labels; risk colours only on RiskBadge.

### Prompt 2 — Simulation engine

```
Build the simulation engine in src/sim exactly as described in docs/PROTOTYPE_SPEC.md Part 6,
with typed interfaces for every dataset. Use a seeded RNG so outputs are identical every run.
Scenarios from Part 1: Cyclone replay (default, shaped after Amphan 2020), Heatwave replay
(north-west India, late May 2024), Humid-heat replay (east coast). Use only the real facts listed
in Part 1; mark everything else illustrative: true.
Generate: 23 member tracks with growing spread and 3 clustered scenarios; 12 km and 5 km fields
for rain (cyclone) and temperature / wet-bulb (heat scenarios); bilinear, U-Net-like and
diffusion-like downscaled versions (4 samples); raw vs calibrated reliability data per lead time;
risk zones and 3 alert objects per scenario; a CAP 1.2 XML builder; the pipeline state machine
with the 10 steps, durations and log lines from Part 5.4; verification ledger data.
Add a Zustand store in src/store for scenario, run state (idle/running/paused/done, step, progress,
speed), lead time, selections, alert statuses and tour state.
Add unit-style sanity checks in a dev-only page /_sim that renders key numbers and small previews.
```
**Check:** /_sim shows tracks, fields and numbers; refreshing gives identical output; build passes.

### Prompt 3 — Map rendering

```
Build src/components/map/MapCanvas.tsx: an offline map using d3-geo + topojson-client with the
world-atlas 50m dataset, drawn on canvas (land, coastline, state-free country borders) with an SVG
overlay layer for tracks, boxes, cones and labels. Equirectangular or Mercator, fit to a region box.
Support layers: raster field (with a colormap and opacity), member tracks, scenario paths,
probability cone, 4D box outline, risk zones (Low/Moderate/Severe), point markers with labels.
Support zoom (wheel) and pan (drag), and a Legend component. Cache rendered rasters per lead time.
Add a LeadTimeSlider (T+0 to T+240 h, 6-hourly) with play/pause.
Demo it on /_kit with the cyclone scenario.
```
**Check:** map draws instantly with the network off; tracks align with the coast; slider animates smoothly.

### Prompt 4 — App shell, routing, home page

```
Implement routing from docs/PROTOTYPE_SPEC.md Part 4.
Public layout: top navigation (SAMBHAVYA wordmark, How it works, Science, Open console button) and footer.
Console layout: fixed left rail with the 7 console pages (icons + names), top bar with scenario
switcher, run selector, ReplayChip and "Play guided demo" button.
Build the Home page exactly as Part 5.1: hero with the animated synoptic chart (one orchestrated
load animation: 23 tracks draw in, cluster, cone appears, 5 km Severe patch appears at the coast;
then a lead-time scrubber), "The gap we fill" lead-time chart with the real facts, the 6-step
"How a run works", "Who it serves" (4 audiences, not identical cards), "Honest by design", footer.
Use the copy given in Part 5.1. Contour-line motif as subtle hero background (SVG).
```
**Check:** hero animation plays once and respects reduced motion; no SIH text anywhere; mobile layout works at 375 px.

### Prompt 5 — Forecast run page (the "it's working" page)

```
Build /console/run exactly as docs/PROTOTYPE_SPEC.md Part 5.4.
Left: StepTimeline with the 10 steps (done / running / waiting states). Right: a live view that
changes per step as described in the table (member tiles arriving, chunking grid, EFI map fade-in,
mesh nodes lighting up with candidate boxes, tracks drawn one by one then clustered, raw to
calibrated probability bars, 128x128 patches turning sharp tile by tile, three gate checks ticking,
5 km zones colouring in, final "3 alerts waiting for review" with a link).
Bottom: LogStream with timestamped lines from the pipeline engine, auto-scrolling.
Controls: Run forecast, Pause/Resume, speed 1x/2x/4x, Reset. Show elapsed time and a simulated
GPU-minutes counter labelled "(sim)". Total run about 45 seconds at 1x.
```
**Check:** a full run completes without errors; pause/resume and speed work; switching scenario resets cleanly.

### Prompt 6 — Threat tracker

```
Build /console/tracker as Part 5.5: full map with layer toggles (member tracks, scenarios,
probability cone, EFI field), lead-time slider with play, hazard filter chips, and a right
"Threat details" panel (type, scenarios with probabilities, core location, timing window,
"17 of 23 members agree" style agreement, key drivers). Show the 4D box as an outline that moves
with lead time. Clicking a scenario path highlights its members.
```
**Check:** scrubbing time moves the box and tracks together; each scenario shows the right hazards.

### Prompt 7 — 5 km downscaling

```
Build /console/sharpen as Part 5.6: threat-box picker, draggable split-view comparing the 12 km
input (left) with the 5 km output (right); method toggle Bilinear / Plain U-Net / SAMBHAVYA
diffusion, where bilinear and U-Net visibly blur and lower the peak and diffusion keeps it;
sample picker (4 samples, slight variation each); metric tiles for peak value per method and
"peak kept" %; a radially averaged power spectrum chart (Recharts) for the three methods plus
reference; and a Quality gate panel with three checks plus a "Show a failing case" button that
demonstrates the fallback message.
```
**Check:** the visual difference between methods is obvious at a glance; the failing case shows the 12 km fallback.

### Prompt 8 — Calibration

```
Build /console/calibration as Part 5.7: reliability diagram (raw below the diagonal, calibrated
near it) with lead-time tabs Day 3/5/7/10; spread vs error chart; the plain-language explanation
given in the spec; and the "stable warnings" demo comparing alert level across two consecutive
runs with and without blending and hysteresis.
```
**Check:** charts animate only when a tab is changed; text matches the spec.

### Prompt 9 — Risk & review

```
Build /console/alerts as Part 5.8: alert queue (3 alerts with RiskBadge, place, lead time,
probability), map with 5 km risk zones and the selected alert's zone outlined, alert detail with
Approve / Edit / Hold. Approve generates a CAP 1.2 XML preview from src/sim/cap.ts, labelled
"CAP 1.2 format (as used by NDMA SACHET)"; never say it was sent. Edit allows changing severity
and message; Hold moves it to On hold. Add a PhoneFrame preview of the SMS people in the zone see,
with an English/Hindi toggle (short, simple Hindi). Add an audience switch: Disaster response view
and Agromet advisory view, changing the wording of the detail panel.
```
**Check:** approve → CAP XML appears and the queue updates; phone preview updates with edits; Hindi text reads correctly.

### Prompt 10 — Verification and data & provenance

```
Build /console/verify (Part 5.9): ledger table (issued level, lead time, observed outcome,
hit/miss/false alarm), metric tiles comparing SAMBHAVYA vs TempestExtremes vs raw ensemble mean
on track error at 48/72/120 h, CSI, FAR, Brier, and alert flips per event (single run vs blended),
all labelled illustrative, plus the note "Scores feed back into calibration."
Build /console/sources (Part 5.10): input data table with role, resolution, status; model
registry with versions and short hashes; and run provenance for the selected alert.
```
**Check:** every number is covered by the Replay chip; provenance links back to the alert.

### Prompt 11 — How it works and Science pages

```
Build /how-it-works as Part 5.2: a scroll story of the 6 steps, each with a small live visual
(ensemble cube with chunks, icosahedral wireframe sphere with lit nodes and forming tracks,
reliability curve moving to the diagonal, 12 km to 5 km morph keeping the peak label, three gate
checks with one fallback, alert approval with CAP preview). Visuals animate when scrolled into
view, once.
Build /science as Part 5.3 with plain-language sections and the reference list from
src/content/references.ts (create it with the references from our slides: NEPS-G, ERA5, IMDAA,
NCUM-R, GraphCast, EMOS, CorrDiff, Harder et al., Consistency Models, TempestExtremes, FSS,
IMERG, CHIRPS, IBTrACS, CAP 1.2).
```
**Check:** pages read clearly for a non-specialist; reference links open the right sources.

### Prompt 12 — Guided demo

```
Build the guided demo from Part 5.11: a tour controller in the store that navigates through
the 7 stages, triggers the pipeline at 4x on stage 1, scrubs the tracker on stage 2, switches
calibration tabs on stage 3, runs the split-view sweep on stage 4, shows the failing gate on
stage 5, approves the Severe alert on stage 6, and opens verification on stage 7.
Show caption cards with the exact captions from the spec, Next/Back buttons and a progress
indicator. Esc exits. Start it from the top-bar button and from "Watch a forecast run" on Home.
```
**Check:** the full tour runs in about 2 minutes without manual clicks; Esc exits cleanly from any stage.

### Prompt 13 — Polish and quality pass

```
Do a full quality pass:
- Responsive down to 375 px (console rail collapses to a bottom bar on mobile).
- Visible keyboard focus everywhere; all interactive elements reachable by keyboard.
- prefers-reduced-motion: show end states, no animation.
- Check every page against the "avoid" list in docs/PROTOTYPE_SPEC.md Part 2 and fix violations.
- Confirm no network requests at runtime (check the browser network tab), no SIH or team text,
  and the Replay chip on every data view.
- Add a favicon (simple cyclone-track glyph in --ink and --teal) and page titles.
- Run npm run build; fix all warnings and type errors.
Then take screenshots of: Home hero, Forecast run mid-way, Threat tracker, 5 km downscaling split
view, Risk & review with CAP preview, Verification. Save them to docs/screenshots/.
```
**Check:** Lighthouse accessibility 90+; the build is clean; screenshots are ready for slide 5.

### Prompt 14 — Deploy (optional)

```
Prepare the project for static hosting on Netlify: add netlify.toml with SPA redirects
(/* to /index.html 200), confirm the production build works with `npm run preview`, and write a
short README.md (what SAMBHAVYA is, how to run locally, that the prototype uses replayed,
illustrative data, and the page list). No SIH or team details in the README.
```

---

## Part 10 — Demo script for judges (2 minutes)

1. **Home (10 s):** "SAMBHAVYA turns India's 23-member ensemble into calibrated 5 km threat guidance for Days 4 to 10." Point at the gap chart.
2. **Play guided demo** and narrate the captions. Pause at:
   - **Forecast run:** "Every step of the real pipeline, from data arriving to alerts ready for review."
   - **Sharpen:** drag the split view: "Bilinear and U-Net lose the peak; our diffusion keeps it."
   - **Quality gate failure:** "If a check fails, we fall back to the calibrated 12 km forecast. We never publish bad detail."
   - **Risk & review:** approve the alert: "A human always approves before the public is warned."
3. **Close:** "Everything here is a replay with illustrative values. The architecture is what we will build and verify."

---

## Part 11 — Screenshots for slide 5 (right side)

Use these four for the "Prototype snapshots" panel, numbered like the sample:

| # | Screen | Caption (short) |
|---|---|---|
| 1 | Forecast run, mid-way | **Forecast Run:** a NEPS-G run processed end to end, from 23 members to alerts ready for review. |
| 2 | Threat tracker | **Threat Tracker:** the cyclone followed in every member, with scenario paths and a probability cone. |
| 3 | 5 km downscaling split view | **5 km Sharpening:** 12 km input beside the 5 km diffusion output, with the peak kept and the quality gate passed. |
| 4 | Risk & review with CAP preview | **Review & Alert:** a forecaster approves a Severe 5 km zone; a CAP alert is generated. |

Add a line under them: **Working prototype:** (your deployed link).