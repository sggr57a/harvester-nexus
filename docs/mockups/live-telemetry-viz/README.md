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

Inspired by [Netdata](https://www.netdata.cloud/) patterns:

- Per-second feel with sweep cursor and anomaly ribbon
- Multi-dimension legend (min/avg/max/now) on stacked scopes
- Dense sparkline strips for CPU/RAM/disk/network
- Nexus HUD: isometric 3D node pillars, dark glass panels, grid drift

**Live data mapping (when built):**

- Charts ← Prometheus range queries (already partially in BFF)
- 3D terrain ← per-node metrics-server CPU/RAM
- Environment Intel ← node list + cluster aggregates (not fake facility hardware)
- Event rail ← Kubernetes warning events

## Sign-off

Review mockups before implementation on branch `cursor/live-production-telemetry-d930`.
