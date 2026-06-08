# Live Telemetry Visual Mockups

**Status:** Design preview — **not implemented in the app yet**

Interactive HTML mockups for stakeholder review before building Netdata-inspired live Resource Monitor and Environment Intel views.

## View locally

```bash
cd docs/mockups/live-telemetry-viz
python3 -m http.server 8765
```

Open:

- http://127.0.0.1:8765/resource-monitor-live.html
- http://127.0.0.1:8765/environment-intel-live.html

## Artifacts (captured)

| Asset | Path |
|-------|------|
| Resource Monitor screenshot | `/opt/cursor/artifacts/screenshots/resource-monitor-live-mockup.png` |
| Environment Intel screenshot | `/opt/cursor/artifacts/screenshots/environment-intel-live-mockup.png` |
| Index screenshot | `/opt/cursor/artifacts/screenshots/mockup-index.png` |
| Resource Monitor video | `/opt/cursor/artifacts/videos/resource-monitor-live-mockup.webm` |
| Environment Intel video | `/opt/cursor/artifacts/videos/environment-intel-live-mockup.webm` |
| Combined walkthrough | `/opt/cursor/artifacts/live-telemetry-mockup-walkthrough.mp4` |

Re-capture after editing mockups:

```bash
node capture-artifacts.cjs
```

## Design intent

Visual language inspired by [HUD dashboard references](https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSJF24b9NiLlbqQHzZzCN98ZrpKkrp9T61sEsAW_oAg&s) and [futuristic HUD UI concepts](https://www.shutterstock.com/shutterstock/photos/403657408/display_1500/stock-vector-hud-ui-for-business-app-futuristic-user-interface-hud-and-infographic-elements-abstract-virtual-403657408.jpg) — **recreated in canvas/SVG** (no stock assets embedded).

### HUD visualization kit (`hud-viz.js`)

- **Radial ring gauges** — tick marks, arc fill, sweep needle, center readout
- **Radar scope** — polar blips, rotating sweep wedge, event tags, range rings
- **Hex topology** — inter-node links, micro-bars, load-colored cells
- **Multi-ring oscilloscope** — concentric circular waveforms per metric
- **Wireframe globe** — rotating lat/long grid, depth-sorted node pins
- **Bar matrix** — dense HUD infographic strips with rolling history
- **Angular HUD panels** — bracket corners, clipped polygon frames

### Activity simulation (`mock-charts.js`)

Correlated cluster bursts (VM migration, Longhorn sync, ingress spikes) drive all widgets together.

**Live data mapping (when built):**

- Charts ← Prometheus range queries (already partially in BFF)
- 3D terrain ← per-node metrics-server CPU/RAM
- Environment Intel ← node list + cluster aggregates (not fake facility hardware)
- Event rail ← Kubernetes warning events

## Sign-off

Review mockups before implementation on branch `cursor/live-production-telemetry-d930`.
