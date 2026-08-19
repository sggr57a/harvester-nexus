# Live Production Telemetry — Design Spec

**Status:** Draft for review  
**Date:** 2026-06-08  
**Context:** Nexus cockpit currently runs entirely on simulated ticks (`useLiveTelemetry`, `XdrEngine` simulator, static `build*Dashboard()` catalogs). Production installs sit on real Harvester clusters that **already expose** VMs, storage, nodes, Prometheus, Grafana, Alertmanager, and logging. Nexus must **integrate** those surfaces—not rebuild them.

---

## 1. Goals

| Goal | Detail |
|------|--------|
| **Production truth** | Gauges, KPIs, graphs, and tables reflect real CPU/RAM, network, storage IOPS, VM/pod/PVC counts, migrations, CVE posture, and security events from the installed cluster. |
| **Demo mode preserved** | `npm run dev` and unattached installs keep today's synthetic 1.6 s tick for sales/demos. |
| **Harvester-first** | Use upstream Steve API, `rancher-monitoring` Prometheus, metrics-server, Longhorn/KubeVirt CR status, and Grafana dashboards before adding any Nexus-only backend. |
| **Nexus additions** | XDR sensor UI, AnyRAID, poly-compute wizards, themed HUD, and unified Mission Control remain Nexus-specific; their **data** comes from real sensors when deployed. |

---

## 2. What Harvester Already Provides (do not duplicate)

```
┌──────────────────────────────────────────────────────────────────┐
│ Harvester cluster (production)                                    │
├──────────────────────────────────────────────────────────────────┤
│ Steve API          GET /v1/harvester/{type}/...                   │
│   • kubevirt.io.virtualmachine / virtualmachineinstance         │
│   • persistentvolumeclaim, node, longhorn.io.volume             │
│   • harvesterhci.io.addon (rancher-monitoring, rancher-logging) │
│   • monitoring.coreos.com.alertmanagerconfig                    │
│   • GET /v1/harvester/readyz                                    │
├──────────────────────────────────────────────────────────────────┤
│ rancher-monitoring (addon)     cattle-monitoring-system           │
│   • Prometheus :9090  → KubeVirt, Longhorn, node-exporter rules   │
│   • Grafana :80       → cattle-dashboards JSON panels             │
│   • Alertmanager :9093                                          │
├──────────────────────────────────────────────────────────────────┤
│ metrics-server                 kube-system                        │
│   • metrics.k8s.io/v1beta1 NodeMetrics / PodMetrics               │
├──────────────────────────────────────────────────────────────────┤
│ rancher-logging (addon)        cattle-logging-system              │
│   • Audit + event tailer → ClusterFlow / ClusterOutput          │
├──────────────────────────────────────────────────────────────────┤
│ Longhorn REST (internal)       longhorn-backend:9500/v1           │
│   • Prefer CR + Prometheus; REST for deep diagnostics only        │
└──────────────────────────────────────────────────────────────────┘
```

Reference: `platform/harvester/pkg/server/router.go`, `pkg/util/constants.go`, monitoring/logging addons, VM migration Grafana embed pattern (HEP 20241212).

---

## 3. Nexus telemetry modes

| Mode | When | Data source |
|------|------|-------------|
| **demo** | `npm run dev`, or live cluster unreachable | Current `nextSnapshot()` + `XdrEngine` simulator |
| **live** | Production ISO install, user authenticated | Harvester Steve + Prometheus proxy + metrics-server |
| **auto** (default on installed nodes) | Try live; fall back to demo with banner | `GET /v1/harvester/readyz` success → live |

Config: `/etc/nexus/config.yaml` → `cockpit.telemetryMode: auto|demo|live`  
UI: sidebar badge “Live cluster” vs “Demo data”.

**UI contract unchanged:** keep `EnvironmentSnapshot`, dashboard TypeScript interfaces, and `XdrSnapshot` as the view layer. Add **adapter modules** that populate those types from real APIs.

---

## 4. Integration architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Nexus React cockpit (existing widgets)                           │
│   EnvironmentSnapshot · StorageDashboard · XdrSnapshot · …       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│ src/lib/telemetry/                                                 │
│   mode.ts          demo | live | auto                              │
│   useEnvironmentTelemetry.ts   switches hook by mode               │
│   harvesterClient.ts   Steve API + bearer token                    │
│   prometheusClient.ts  PromQL via apiserver service proxy          │
│   metricsServerClient.ts  NodeMetrics / PodMetrics                 │
│   adapters/                                                        │
│     environmentAdapter.ts  → EnvironmentSnapshot                   │
│     storageAdapter.ts      → StorageDashboard                      │
│     machinesAdapter.ts     → MachinesDashboard                       │
│     xdrLiveAdapter.ts      → XdrSnapshot (Falco/Wazuh ingest)      │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (same origin)
┌────────────────────────────▼────────────────────────────────────┐
│ nexus-api (thin BFF on host — extends cockpit server)              │
│   • Serves static SPA (existing)                                   │
│   • Proxies /api/v1/harvester/* → Harvester apiserver              │
│   • Proxies /api/v1/metrics/prometheus/* → rancher-monitoring      │
│   • Uses in-cluster SA or /etc/rancher/rke2/rke2.yaml on node      │
│   • No duplicate metric storage                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    Harvester / RKE2 apiserver
```

**Why a thin BFF:** The SPA is static files on port 8443. Browser cannot hold kubeconfig or call apiserver cross-origin safely. The BFF runs on the same node, reads RKE2 kubeconfig, and forwards authenticated requests—same pattern as Rancher/Harvester dashboard.

---

## 5. Mapping: Nexus widgets → Harvester sources

### 5.1 Environment ticker / Mission Control KPIs (`EnvironmentSnapshot`)

| Field | Live source |
|-------|-------------|
| `totalWorkloads` | Count Steve VMs + running VMIs + pods |
| `cpuPercent`, `ramPercent` | Prometheus `node_cpu_*`, `node_memory_*` or metrics-server aggregate |
| `totalIops` | PromQL `rate(longhorn_volume_*[5m])` or node disk metrics |
| `ingressMbps`, `egressMbps` | `rate(node_network_*[5m])` |
| `activeMigrations` | `kubevirt_vmi_migrations_in_running_phase` or VMI migration CRs |
| `openCves` | Trivy operator reports (Nexus XDR addon) or Grafana panel |
| `trustScore` | Derived from Polaris + kube-bench + open CVE count |
| `watts` | Optional IPMI/redfish if exposed; else hide or estimate from node count |

### 5.2 Storage dashboard

| Widget data | Source |
|-------------|--------|
| PVC/PV lists | Steve `persistentvolumeclaim`, `persistentvolume` |
| Longhorn volume health | Steve `longhorn.io.volume` `.status` + `longhorn_volume_robustness` |
| Capacity bars | PromQL capacity/usage metrics |
| Snapshots | Harvester VM backup / Longhorn snapshot CRs |
| Backend cards | StorageClass list + Longhorn/default backend setting |

### 5.3 Machines & poly-compute

| Widget data | Source |
|-------------|--------|
| VM fleet | Steve `kubevirt.io.virtualmachine` |
| Live instance state | `virtualmachineinstance` |
| Migrations | `virtualmachineinstancemigration` |
| Pods | Steve `pod` in tenant namespaces |
| Console / actions | Existing VM actions (`migrate`, `start`, `stop`, …) |

### 5.4 Networking / security maps

| Widget data | Source |
|-------------|--------|
| East-west traffic | Hubble flows (Nexus XDR stack) when deployed |
| Threat map (production) | XDR engine alerts + geo IP from Wazuh/Suricata—not random drift |
| Cluster radar | Cilium/Hubble metrics or aggregated connection stats |
| Demo fallback | Current `DEFAULT_THREATS` / simulator |

### 5.5 XDR Operations Center

| Mode | Source |
|------|--------|
| Demo | `useLiveXdrEngine({ simulate: true })` — unchanged |
| Live | Ingest `SensorEvent` from Falco gRPC, Wazuh API, Suricata EVE → existing `XdrEngine.ingest()` |
| Deploy path | Already defined: `installer/manifests/20-xdr-stack.yaml` + Security Posture wizard |

Harvester stock install does **not** include Nexus XDR sensors; live security requires the Nexus bootstrap manifests (already in ISO overlay).

### 5.6 Resource Monitoring page

Replace frozen `buildResourceMonitoring()` with watches on:
- Active VM migrations, PVC binds, pod scheduling events (Steve + metrics-server)
- Memory pressure from node PSI / Prometheus

### 5.7 Grafana embed (optional rich panels)

For deep time-series Harvester already ships dashboards in `cattle-dashboards`. Nexus can iframe Grafana for VM detail tabs (official Harvester pattern) instead of hand-rolling every chart.

---

## 6. What Nexus adds beyond Harvester

| Nexus-only | Notes |
|------------|-------|
| Themed HUD / Mission Control layout | Presentation layer |
| XDR unified SOC + auto-response YAML | Sensors + engine (manifests in ISO) |
| AnyRAID wizard + CSI | Storage backend not in stock Harvester |
| Poly-compute / acceleration wizards | Config + future scheduling integration |
| Demo simulator | Explicitly labeled synthetic mode |
| Unified ticker across all views | Aggregates Harvester + Nexus XDR metrics |

---

## 7. Implementation phases

### Phase 1 — Foundation (MVP live) ✅ implemented
- `telemetryMode` + `useEnvironmentTelemetry` hook (`auto` / `demo` / `live`)
- BFF routes on cockpit server: `/api/v1/health/live`, `/api/v1/telemetry/environment`
- `cluster_metrics.py` collects pod/VM/node CPU/RAM via kubectl + metrics-server
- Mission Control + Environment Ticker show live KPIs when cluster API reachable
- Demo banner + mode selector in ticker header

### Phase 2 — Storage & machines ✅ implemented
- `storageAdapter`, `machinesAdapter` from Steve CRs
- Storage + Machines dashboard views use live lists; keep static layout metadata

### Phase 3 — Prometheus time-series ✅ implemented
- `prometheusClient` + history buffers for oscilloscope/FFT widgets (replace `Math.random()`)
- Gate on `harvesterhci.io.addon/rancher-monitoring` status

### Phase 4 — XDR live ✅ implemented
- Wire `useLiveXdrEngine({ simulate: false })` when sensors healthy
- Connect ThreatIntelMap to real `XdrSnapshot`
- Feed `openCves` / `trustScore` from Trivy/Polaris

### Phase 5 — Operations & Grafana ✅ implemented
- Alertmanager deep links, support bundle trigger via Steve
- Optional Grafana embed for VM/storage detail drawers

---

## 8. Explicit non-goals

- **No custom Prometheus deployment** — use `rancher-monitoring` addon
- **No duplicate Longhorn manager layer** — Steve CRs + existing PromQL
- **No replacement for Harvester dashboard at :443** — Nexus is complementary cockpit at :8443
- **No mock data in live mode** — widgets show empty/“monitoring disabled” if addon off

---

## 9. Open question for product sign-off

**Phase 1 scope:** Should the first live milestone target **cluster-wide aggregates** (ticker + Mission Control KPIs only), or also **per-VM/per-PVC drill-down** in the same release?

Recommendation: **aggregates first** — fastest path to “production honest” UI while Harvester Steve + Prometheus wiring is proven.

---

## 10. Related files (current codebase)

| Area | Path |
|------|------|
| Simulated telemetry | `src/lib/liveTelemetry.ts` |
| Dashboard catalogs | `src/lib/dashboards.ts` |
| XDR engine + simulator | `src/lib/xdr/engine.ts`, `simulator.ts`, `hooks.ts` |
| App wiring | `src/App.tsx` |
| Cluster workflow placeholders | `src/lib/clusterWorkflow.ts` |
| Harvester upstream | `platform/harvester/` |
| ISO XDR manifests | `installer/manifests/20-xdr-stack.yaml` |
| Install config | `installer/overlay/etc/nexus/config.yaml` |
