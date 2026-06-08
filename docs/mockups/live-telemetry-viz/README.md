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

Visual language inspired by [futuristic HUD infographic kits](https://www.shutterstock.com/shutterstock/photos/737087332/display_1500/stock-vector-vector-futuristic-interface-hud-design-set-infographic-elements-virtual-hologram-landscape-737087332.jpg) — **recreated in original canvas** (no stock assets, no watermarks).

### HUD visualization kit (`hud-viz.js`)

**Hero:** virtual hologram wireframe landscape (perspective terrain mesh, node beacons, scan sweep)

**Gauges:** radial ring KPIs · linear bars · vertical level indicators · wave/vibration strips

**Animated infographic charts:**
- Stacked area · multi-line · column · donut · bar matrix
- Sparkline grid (12+ cells) · meter bank · live metric table

**Spatial:** radar scope, hex topology, wireframe globe

### Activity simulation (`mock-charts.js`)

Correlated cluster bursts (VM migration, Longhorn sync, ingress spikes) drive all widgets together.

**Live data mapping (when built):**

- Charts ← Prometheus range queries (already partially in BFF)
- 3D terrain ← per-node metrics-server CPU/RAM
- Environment Intel ← node list + cluster aggregates (not fake facility hardware)
- Event rail ← Kubernetes warning events

## Sign-off

Review mockups before implementation on branch `cursor/live-production-telemetry-d930`.
