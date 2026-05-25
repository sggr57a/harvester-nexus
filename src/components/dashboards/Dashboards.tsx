import {
  buildAccelerationDashboard,
  buildActivityDashboard,
  buildEnvironmentDashboard,
  buildMachinesDashboard,
  buildNetworkingDashboard,
  buildOperationsDashboard,
  buildPolyComputeDashboard,
  buildProcessorMemoryDashboard,
  buildStorageDashboard,
  type CpuCore,
} from '../../lib/dashboards';

const networking = buildNetworkingDashboard();
const storage = buildStorageDashboard();
const machines = buildMachinesDashboard();
const procmem = buildProcessorMemoryDashboard();
const ops = buildOperationsDashboard();
const poly = buildPolyComputeDashboard();
const accel = buildAccelerationDashboard();
const environment = buildEnvironmentDashboard();
const activity = buildActivityDashboard();

function svgPathBetween(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax;
  const dy = by - ay;
  const mx = ax + dx / 2 + dy * 0.18;
  const my = ay + dy / 2 - dx * 0.18;
  return `M${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`;
}

export function NetworkingDashboardView() {
  const { topology, vlans, ingressRoutes, policyMatrix, nicBonds, vip } = networking;
  const nodeMap = new Map(topology.nodes.map((node) => [node.id, node]));
  const sources = Array.from(new Set(policyMatrix.map((cell) => cell.source)));
  const targets = Array.from(new Set(policyMatrix.map((cell) => cell.target)));

  return (
    <section className="dash dash-networking" aria-label="Networking dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">CHANNEL // NETWORK</span>
          <h2>{networking.title}</h2>
          <p>Vector route topology, ingress mesh, VLAN lanes, NIC bonds, and policy fabric.</p>
        </div>
        <div className="dash-vip">
          <span>VIP</span>
          <strong>{vip.address}</strong>
          <small>{vip.mode} · {vip.floating ? 'floating' : 'pinned'}</small>
        </div>
      </header>

      <article className="dash-panel topology-panel">
        <div className="panel-title">
          <span>Cluster route topology</span>
          <strong>{topology.nodes.length} nodes · {topology.edges.length} routes</strong>
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="topology-svg" aria-hidden="true">
          <defs>
            <pattern id="topo-grid" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
              <path d="M6 0H0V6" fill="none" />
            </pattern>
            <radialGradient id="topo-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopOpacity="0.85" />
              <stop offset="100%" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="100" height="100" className="topology-grid" fill="url(#topo-grid)" />
          {topology.edges.map((edge) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) return null;
            return (
              <g key={edge.id} className={`topology-edge channel-${edge.channel}`}>
                <path d={svgPathBetween(from.x, from.y, to.x, to.y)} className="topology-edge-bg" />
                <path d={svgPathBetween(from.x, from.y, to.x, to.y)} className="topology-edge-pulse" strokeDasharray="4 8" />
              </g>
            );
          })}
          {topology.nodes.map((node) => (
            <g key={node.id} className={`topology-node role-${node.role} status-${node.status}`} transform={`translate(${node.x} ${node.y})`}>
              <circle r="2.4" className="node-core" />
              <circle r="4.6" className="node-ring" />
              <circle r="7" className="node-halo" />
              <text y="-5.5" textAnchor="middle" className="node-label">{node.label}</text>
              <text y="9" textAnchor="middle" className="node-health">{node.health}%</text>
            </g>
          ))}
        </svg>
        <div className="topology-legend">
          <span className="legend-chip channel-mgmt">mgmt</span>
          <span className="legend-chip channel-storage">storage</span>
          <span className="legend-chip channel-mesh">mesh</span>
          <span className="legend-chip channel-vm">vm/lxc</span>
          <span className="legend-chip channel-gitops">gitops</span>
        </div>
      </article>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title">
            <span>VLAN / bond lanes</span>
            <strong>{vlans.length} VLANs</strong>
          </div>
          <ul className="vlan-list">
            {vlans.map((vlan) => (
              <li key={vlan.id}>
                <div>
                  <span className="vlan-id">VLAN {vlan.vlanId}</span>
                  <strong>{vlan.name}</strong>
                  <small>{vlan.cidr}</small>
                </div>
                <div className="vlan-meter">
                  <div className="meter-row">
                    <span>RX</span>
                    <i style={{ width: `${Math.min(100, vlan.ingressMbps / 100)}%` }} />
                    <b>{vlan.ingressMbps} Mb/s</b>
                  </div>
                  <div className="meter-row">
                    <span>TX</span>
                    <i style={{ width: `${Math.min(100, vlan.egressMbps / 100)}%` }} />
                    <b>{vlan.egressMbps} Mb/s</b>
                  </div>
                </div>
                <div className="vlan-counts">
                  <span>{vlan.pods} pods</span>
                  <span>{vlan.vms} vms</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="dash-panel">
          <div className="panel-title">
            <span>Service-mesh ingress routes</span>
            <strong>{ingressRoutes.length} routes</strong>
          </div>
          <table className="dash-table">
            <thead>
              <tr><th>host</th><th>service</th><th>mesh</th><th>tls</th><th>rps</th><th>p95</th></tr>
            </thead>
            <tbody>
              {ingressRoutes.map((route) => (
                <tr key={route.id}>
                  <td><strong>{route.host}</strong></td>
                  <td>{route.service}</td>
                  <td><span className={`mesh-chip mesh-${route.meshProvider}`}>{route.meshProvider}</span></td>
                  <td><span className={`tls-chip tls-${route.tls}`}>{route.tls}</span></td>
                  <td><b>{route.rps}</b></td>
                  <td>{route.p95Latency}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title">
            <span>NIC bonds</span>
            <strong>{nicBonds.length} bonds</strong>
          </div>
          <ul className="nic-list">
            {nicBonds.map((bond) => (
              <li key={bond.name} className={`nic-state-${bond.state}`}>
                <div>
                  <strong>{bond.name}</strong>
                  <small>{bond.speedGbps} Gbps · {bond.state}</small>
                </div>
                <div className="nic-flow">
                  <span>RX {bond.rxMbps.toLocaleString()} Mb/s</span>
                  <span>TX {bond.txMbps.toLocaleString()} Mb/s</span>
                </div>
                <div className="nic-bars">
                  <i style={{ width: `${Math.min(100, bond.rxMbps / (bond.speedGbps * 1000) * 100)}%` }} />
                  <i style={{ width: `${Math.min(100, bond.txMbps / (bond.speedGbps * 1000) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="dash-panel">
          <div className="panel-title">
            <span>NetworkPolicy matrix</span>
            <strong>{policyMatrix.filter((cell) => cell.allow).length} allow · {policyMatrix.filter((cell) => !cell.allow).length} deny</strong>
          </div>
          <div className="policy-grid" style={{ gridTemplateColumns: `auto repeat(${targets.length}, 1fr)` }}>
            <span />
            {targets.map((target) => <span key={target} className="policy-col">{target}</span>)}
            {sources.map((source) => (
              <>
                <span key={`r-${source}`} className="policy-row">{source}</span>
                {targets.map((target) => {
                  const cell = policyMatrix.find((entry) => entry.source === source && entry.target === target);
                  if (!cell || source === target) return <span key={`${source}-${target}`} className="policy-cell policy-na" />;
                  return (
                    <span key={`${source}-${target}`} className={`policy-cell policy-${cell.allow ? 'allow' : 'deny'}`} title={`${source} -> ${target} ${cell.allow ? 'allow' : 'deny'} ${cell.protocol}`}>
                      {cell.allow ? '+' : '-'}
                    </span>
                  );
                })}
              </>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

export function StorageDashboardView() {
  const { backends, pvcs, snapshots, replicationLinks } = storage;
  return (
    <section className="dash dash-storage" aria-label="Storage dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">FABRIC // STORAGE</span>
          <h2>{storage.title}</h2>
          <p>Per-backend radial gauges, IOPS sparklines, PVC lanes, snapshot shelves, replication links.</p>
        </div>
        <div className="dash-totals">
          <div><span>Capacity</span><strong>{backends.reduce((sum, b) => sum + b.capacityTiB, 0)} TiB</strong></div>
          <div><span>IOPS</span><strong>{(backends.reduce((sum, b) => sum + b.iops, 0) / 1000).toFixed(1)} K</strong></div>
        </div>
      </header>

      <div className="storage-backend-grid">
        {backends.map((backend) => {
          const rad = 38;
          const circ = 2 * Math.PI * rad;
          const offset = circ * (1 - backend.usagePercent / 100);
          return (
            <article key={backend.id} className={`backend-card backend-${backend.kind} health-${backend.driverHealth}`}>
              <div className="backend-head">
                <span className={`kind-chip kind-${backend.kind}`}>{backend.kind}</span>
                <strong>{backend.label}</strong>
              </div>
              <svg viewBox="0 0 100 100" className="backend-radial" aria-hidden="true">
                <circle cx="50" cy="50" r={rad} className="radial-track" />
                <circle cx="50" cy="50" r={rad} className="radial-fill" strokeDasharray={`${circ}`} strokeDashoffset={offset} transform="rotate(-90 50 50)" />
                <text x="50" y="48" textAnchor="middle" className="radial-value">{backend.usagePercent}%</text>
                <text x="50" y="62" textAnchor="middle" className="radial-sub">{backend.capacityTiB}TiB</text>
              </svg>
              <dl className="backend-stats">
                <div><dt>IOPS</dt><dd>{backend.iops.toLocaleString()}</dd></div>
                <div><dt>R</dt><dd>{backend.readMiBs} MiB/s</dd></div>
                <div><dt>W</dt><dd>{backend.writeMiBs} MiB/s</dd></div>
              </dl>
              <div className="backend-features">
                {backend.features.map((feat) => <span key={feat}>{feat}</span>)}
              </div>
              <small className="backend-driver">{backend.csiTemplate}</small>
            </article>
          );
        })}
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>PVC lanes</span><strong>{pvcs.length} bound</strong></div>
          <table className="dash-table">
            <thead><tr><th>name</th><th>ns</th><th>class</th><th>size</th><th>mode</th><th>status</th></tr></thead>
            <tbody>
              {pvcs.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.namespace}</td>
                  <td><code>{row.storageClass}</code></td>
                  <td>{row.sizeGiB} GiB</td>
                  <td><span className="access-chip">{row.accessMode}</span></td>
                  <td><span className={`status-chip status-${row.status}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="dash-panel">
          <div className="panel-title"><span>Snapshot + replication shelves</span><strong>{snapshots.length} snapshots · {replicationLinks.length} links</strong></div>
          <ul className="snapshot-shelf">
            {snapshots.map((snap) => (
              <li key={snap.id}>
                <span className="snap-driver">{snap.driver}</span>
                <strong>{snap.workload}</strong>
                <small>{snap.takenAt} · {snap.size}{snap.replicated ? ' · replicated' : ''}</small>
                <em>{snap.retentionPolicy}</em>
              </li>
            ))}
          </ul>
          <ul className="replication-links">
            {replicationLinks.map((link) => (
              <li key={`${link.source}-${link.target}`}>
                <span>{link.source}</span>
                <i className={`repl-mode mode-${link.mode}`} />
                <span>{link.target}</span>
                <b>{link.lagSeconds === 0 ? 'live' : `lag ${link.lagSeconds}s`}</b>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

export function MachinesDashboardView() {
  const { fleet, migrations, affinityRules, ha, consoleChips } = machines;
  return (
    <section className="dash dash-machines" aria-label="Machines and containers dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">FLEET // COMPUTE</span>
          <h2>{machines.title}</h2>
          <p>VM / LXC / Docker / Pod fleet with live migration, HA, affinity, console launch.</p>
        </div>
        <div className="dash-totals">
          <div><span>Workloads</span><strong>{fleet.length}</strong></div>
          <div><span>Migrations</span><strong>{migrations.length}</strong></div>
        </div>
      </header>

      <article className="dash-panel migration-panel">
        <div className="panel-title"><span>Live migration arcs</span><strong>vMotion-style · memory state preserved</strong></div>
        <svg viewBox="0 0 100 30" className="migration-svg" preserveAspectRatio="none" aria-hidden="true">
          {migrations.map((mig, index) => {
            const x1 = 8 + index * 28;
            const x2 = x1 + 22;
            const y = 16;
            const mx = (x1 + x2) / 2;
            const my = y - 6;
            return (
              <g key={mig.id} className={`migration-arc kind-${mig.kind}`}>
                <path d={`M${x1} ${y} Q ${mx} ${my} ${x2} ${y}`} className="arc-bg" />
                <path d={`M${x1} ${y} Q ${mx} ${my} ${x2} ${y}`} className="arc-fill" strokeDasharray="80" strokeDashoffset={80 - mig.progress * 0.8} />
                <circle cx={x1} cy={y} r="2" className="arc-source" />
                <circle cx={x2} cy={y} r="2" className="arc-target" />
                <text x={mx} y={my - 1.5} textAnchor="middle" className="arc-label">{mig.workload}</text>
                <text x={mx} y={y + 5} textAnchor="middle" className="arc-sub">{mig.source} → {mig.target} · {mig.progress}%</text>
              </g>
            );
          })}
        </svg>
      </article>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Fleet</span><strong>{fleet.length} workloads</strong></div>
          <table className="dash-table">
            <thead><tr><th>name</th><th>kind</th><th>host</th><th>cpu</th><th>ram</th><th>aff</th><th>ha</th><th>status</th></tr></thead>
            <tbody>
              {fleet.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td><span className={`kind-chip kind-${row.kind}`}>{row.kind}</span></td>
                  <td>{row.host}</td>
                  <td><div className="mini-bar"><i style={{ width: `${row.cpuPercent}%` }} /></div><small>{row.cpuPercent}%</small></td>
                  <td>{row.ramGiB} / {row.ramAllocGiB} GiB</td>
                  <td><span className={`affinity-chip aff-${row.affinity}`}>{row.affinity}</span></td>
                  <td>{row.haEnabled ? 'on' : '—'}</td>
                  <td><span className={`status-chip status-${row.status}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <div className="machine-side-stack">
          <article className="dash-panel">
            <div className="panel-title"><span>Affinity rules</span><strong>{affinityRules.length}</strong></div>
            <ul className="affinity-list">
              {affinityRules.map((rule) => (
                <li key={rule.id} className={`affinity-mode-${rule.mode}`}>
                  <strong>{rule.name}</strong>
                  <span>{rule.mode}</span>
                  <small>{rule.members.join(' · ')}</small>
                </li>
              ))}
            </ul>
          </article>
          <article className="dash-panel">
            <div className="panel-title"><span>High availability</span><strong>{ha.filter((row) => row.active).length} active</strong></div>
            <ul className="ha-list">
              {ha.map((row) => (
                <li key={row.name}>
                  <strong>{row.name}</strong>
                  <small>{row.restartWindowSeconds}s window · {row.lastEvent}</small>
                </li>
              ))}
            </ul>
          </article>
          <article className="dash-panel">
            <div className="panel-title"><span>Console chips</span><strong>{consoleChips.length}</strong></div>
            <div className="console-chips">
              {consoleChips.map((chip) => (
                <button key={chip.id} type="button" className={`console-chip type-${chip.type} state-${chip.state}`}>
                  <span>{chip.type}</span>
                  <strong>{chip.target}</strong>
                </button>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function CoreHeatCell({ core }: { core: CpuCore }) {
  return (
    <span
      className={`core-cell thread-${core.thread}`}
      title={`core ${core.id} · ${core.utilizationPercent}% · ${core.frequencyGhz.toFixed(1)} GHz`}
      style={{ '--core-fill': `${core.utilizationPercent}%` } as React.CSSProperties}
    />
  );
}

export function ProcessorMemoryDashboardView() {
  const { numaZones, memoryTiers, pressureWaterfall, swapDevices, hugepages } = procmem;
  const maxPressure = Math.max(
    ...pressureWaterfall.flatMap((sample) => [sample.cpuPressure, sample.memoryPressure, sample.ioPressure]),
  );
  return (
    <section className="dash dash-procmem" aria-label="Processor and memory dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">CORE // MEMORY</span>
          <h2>{procmem.title}</h2>
          <p>NUMA core heatmap, memory tier topology, pressure waterfall, hugepages, swap devices.</p>
        </div>
        <div className="dash-totals">
          <div><span>Cores</span><strong>{numaZones.reduce((sum, zone) => sum + zone.cores.length, 0)}</strong></div>
          <div><span>DRAM</span><strong>{memoryTiers[0]?.capacityGiB} GiB</strong></div>
        </div>
      </header>

      <article className="dash-panel">
        <div className="panel-title"><span>NUMA core heatmap</span><strong>{numaZones.length} zones</strong></div>
        <div className="numa-zones">
          {numaZones.map((zone) => (
            <div key={zone.id} className="numa-zone">
              <div className="numa-head">
                <strong>{zone.id}</strong>
                <span>{zone.localRamGiB} GiB local · {zone.remoteHitsPct}% remote</span>
              </div>
              <div className="core-grid">
                {zone.cores.map((core) => <CoreHeatCell key={core.id} core={core} />)}
              </div>
            </div>
          ))}
        </div>
      </article>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Memory tier topology</span><strong>{memoryTiers.length} tiers</strong></div>
          <ul className="memory-tiers">
            {memoryTiers.map((tier) => (
              <li key={tier.id} className={`tier-${tier.id}`}>
                <div className="tier-head">
                  <strong>{tier.label}</strong>
                  <span>{tier.usedGiB} / {tier.capacityGiB} GiB</span>
                </div>
                <div className="tier-bar"><i style={{ width: `${(tier.usedGiB / tier.capacityGiB) * 100}%` }} /></div>
                <div className="tier-sub">
                  <span>{tier.latencyNs}ns latency</span>
                  <span>{tier.throughputGiBs} GiB/s</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="dash-panel">
          <div className="panel-title"><span>Pressure waterfall</span><strong>cpu / mem / io</strong></div>
          <div className="pressure-waterfall">
            {pressureWaterfall.map((sample) => (
              <div key={sample.label} className="pressure-column">
                <span className="pressure-bar pressure-cpu" style={{ height: `${(sample.cpuPressure / maxPressure) * 100}%` }} />
                <span className="pressure-bar pressure-mem" style={{ height: `${(sample.memoryPressure / maxPressure) * 100}%` }} />
                <span className="pressure-bar pressure-io" style={{ height: `${(sample.ioPressure / maxPressure) * 100}%` }} />
                <small>{sample.label}</small>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Swap devices</span><strong>{swapDevices.length}</strong></div>
          <ul className="swap-list">
            {swapDevices.map((dev) => (
              <li key={dev.device}>
                <strong>{dev.device}</strong>
                <div className="tier-bar"><i style={{ width: `${(dev.usedGiB / dev.sizeGiB) * 100}%` }} /></div>
                <small>{dev.usedGiB} / {dev.sizeGiB} GiB · prio {dev.priority}</small>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>Hugepages</span><strong>2MiB + 1GiB</strong></div>
          <ul className="hugepage-list">
            {hugepages.map((page) => (
              <li key={page.sizeMiB}>
                <strong>{page.sizeMiB} MiB pages</strong>
                <div className="tier-bar"><i style={{ width: `${(page.allocated / (page.allocated + page.free)) * 100}%` }} /></div>
                <small>{page.allocated} allocated · {page.free} free</small>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

export function OperationsDashboardView() {
  const { cost, power, rightSizing, compliance, cve, audit, gitops, backupSla, drPlans } = ops;
  const costTotal = cost.reduce((sum, row) => sum + row.monthlyEuro, 0);
  const powerTotal = power.reduce((sum, row) => sum + row.kwhMonth, 0);
  const co2Total = power.reduce((sum, row) => sum + row.co2KgMonth, 0);
  const maxBar = Math.max(...cost.map((row) => row.monthlyEuro));
  return (
    <section className="dash dash-operations" aria-label="Operations and compliance dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">OPS // COMPLIANCE</span>
          <h2>{ops.title}</h2>
          <p>Cost · sustainability · CVE · CIS · audit · GitOps · backups · DR.</p>
        </div>
        <div className="dash-totals">
          <div><span>€/month</span><strong>€{costTotal.toFixed(0)}</strong></div>
          <div><span>kWh/mo</span><strong>{powerTotal.toFixed(0)}</strong></div>
          <div><span>CO₂ kg/mo</span><strong>{co2Total.toFixed(0)}</strong></div>
        </div>
      </header>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Cost · chargeback</span><strong>top 5 workloads</strong></div>
          <ul className="cost-list">
            {cost.map((row) => (
              <li key={row.id}>
                <strong>{row.workload}</strong>
                <div className="cost-bar"><i style={{ width: `${(row.monthlyEuro / maxBar) * 100}%` }} /></div>
                <b>€{row.monthlyEuro.toFixed(1)}</b>
                <small className={row.trendPercent > 0 ? 'trend-up' : row.trendPercent < 0 ? 'trend-down' : 'trend-flat'}>
                  {row.trendPercent > 0 ? '+' : ''}{row.trendPercent}%
                </small>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>Power · carbon</span><strong>kWh · €/mo · CO₂</strong></div>
          <table className="dash-table">
            <thead><tr><th>node</th><th>W</th><th>kWh/mo</th><th>CO₂ kg</th><th>PUE</th></tr></thead>
            <tbody>
              {power.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.node}</strong></td>
                  <td>{row.watts}</td>
                  <td>{row.kwhMonth}</td>
                  <td>{row.co2KgMonth}</td>
                  <td>{row.pue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Right-sizing insights</span><strong>{rightSizing.length} hints</strong></div>
          <ul className="hint-list">
            {rightSizing.map((hint) => (
              <li key={hint.workload} className={`hint-${hint.hint}`}>
                <span className="hint-chip">{hint.hint.replace('-', ' ')}</span>
                <strong>{hint.workload}</strong>
                <small>{hint.detail}</small>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>Compliance lanes</span><strong>BSI · ISO · NIS2 · SOC2</strong></div>
          <ul className="compliance-lanes">
            {compliance.map((lane) => (
              <li key={lane.framework}>
                <strong>{lane.framework}</strong>
                <div className="tier-bar"><i style={{ width: `${lane.hardeningScore}%` }} /></div>
                <small>{lane.controlsCovered} / {lane.controlsTotal} controls · {lane.hardeningScore}% hardening</small>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>CVE buckets</span><strong>{cve.reduce((s, b) => s + b.count, 0)} total</strong></div>
          <div className="cve-buckets">
            {cve.map((bucket) => (
              <div key={bucket.severity} className={`cve-bucket sev-${bucket.severity}`}>
                <strong>{bucket.count}</strong>
                <span>{bucket.severity}</span>
                <small className={bucket.trend >= 0 ? 'trend-up' : 'trend-down'}>{bucket.trend >= 0 ? '+' : ''}{bucket.trend}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>HMAC-signed audit feed</span><strong>{audit.length} recent</strong></div>
          <ul className="audit-feed">
            {audit.map((event) => (
              <li key={event.id} className={`audit-${event.severity}`}>
                <span className="audit-time">{event.timestamp}</span>
                <strong>{event.actor}</strong>
                <span>{event.action}</span>
                <small>{event.target}</small>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>GitOps targets</span><strong>ArgoCD · Flux · Jenkins-X</strong></div>
          <ul className="gitops-list">
            {gitops.map((target) => (
              <li key={target.id} className={`sync-${target.syncState}`}>
                <strong>{target.name}</strong>
                <span className="provider-chip">{target.provider}</span>
                <span className="sync-chip">{target.syncState}</span>
                <small>rev {target.revision} · {target.lastSyncSeconds}s ago</small>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>Backup SLA + DR</span><strong>PBS · ZFS · longhorn</strong></div>
          <ul className="backup-sla">
            {backupSla.map((row) => (
              <li key={`${row.cluster}-${row.datastore}`} className={row.lastBackupMinutesAgo > row.rpoMinutes ? 'rpo-breach' : 'rpo-ok'}>
                <strong>{row.cluster}</strong>
                <span>{row.datastore}</span>
                <small>last {row.lastBackupMinutesAgo}m · RPO {row.rpoMinutes}m · verify {row.verifyPassed ? 'ok' : 'fail'}</small>
              </li>
            ))}
          </ul>
          <ul className="dr-plans">
            {drPlans.map((plan) => (
              <li key={plan.id}>
                <strong>{plan.name}</strong>
                <small>{plan.primary} → {plan.secondary} · boot {plan.bootOrder.join(' / ')} · {plan.lastDrill}</small>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

export function PolyComputeDashboardView() {
  const { runtimes, nodeBlend, topologyAwareScheduling, unifiedScheduler } = poly;
  const maxDensity = Math.max(...nodeBlend.map((node) => node.densityScore));
  return (
    <section className="dash dash-poly-compute" aria-label="Poly-compute engine dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">RUNTIME // POLY-COMPUTE</span>
          <h2>{poly.title}</h2>
          <p>Unified engine running KubeVirt VMs, Incus/LXC system containers, and native K8s pods on the same bare-metal loop.</p>
        </div>
        <div className="dash-totals">
          <div><span>Workloads</span><strong>{runtimes.reduce((sum, r) => sum + r.workloadCount, 0)}</strong></div>
          <div><span>Runtimes</span><strong>{runtimes.length}</strong></div>
        </div>
      </header>

      <div className="poly-runtime-grid">
        {runtimes.map((runtime) => (
          <article key={runtime.id} className={`poly-runtime poly-${runtime.id}`}>
            <div className="poly-runtime-head">
              <span className={`kind-chip kind-${runtime.id === 'kubevirt' ? 'vm' : runtime.id === 'incus-lxc' ? 'lxc' : 'pod'}`}>{runtime.id}</span>
              <strong>{runtime.label}</strong>
            </div>
            <p className="poly-runtime-desc">{runtime.description}</p>
            <dl className="poly-runtime-stats">
              <div><dt>Workloads</dt><dd>{runtime.workloadCount}</dd></div>
              <div><dt>CPU share</dt><dd>{runtime.cpuShare}%</dd></div>
              <div><dt>RAM share</dt><dd>{runtime.ramShare}%</dd></div>
              <div><dt>Kernel</dt><dd>{runtime.kernelMode}</dd></div>
              <div><dt>Live migrate</dt><dd>{runtime.liveMigration ? 'yes' : 'no'}</dd></div>
            </dl>
            <div className="poly-runtime-features">
              {runtime.features.map((feat) => <span key={feat}>{feat}</span>)}
            </div>
          </article>
        ))}
      </div>

      <article className="dash-panel">
        <div className="panel-title"><span>Mixed-mode node density</span><strong>VM · system container · pod</strong></div>
        <div className="poly-blend-list">
          {nodeBlend.map((blend) => {
            const total = blend.vms + blend.systemContainers + blend.pods;
            const vmShare = (blend.vms / total) * 100;
            const sysShare = (blend.systemContainers / total) * 100;
            const podShare = (blend.pods / total) * 100;
            return (
              <div key={blend.node} className="poly-blend-row">
                <strong>{blend.node}</strong>
                <div className="poly-blend-bar" title={`${blend.vms} VMs · ${blend.systemContainers} sys containers · ${blend.pods} pods`}>
                  <i className="blend-vm"  style={{ width: `${vmShare}%` }} />
                  <i className="blend-sys" style={{ width: `${sysShare}%` }} />
                  <i className="blend-pod" style={{ width: `${podShare}%` }} />
                </div>
                <small>
                  {blend.vms} vm · {blend.systemContainers} sys · {blend.pods} pod
                </small>
                <b className="density-score" style={{ opacity: 0.4 + (blend.densityScore / maxDensity) * 0.6 }}>{blend.densityScore}</b>
              </div>
            );
          })}
        </div>
        <div className="poly-blend-legend">
          <span className="blend-vm">KubeVirt VMs</span>
          <span className="blend-sys">Incus / LXC system containers</span>
          <span className="blend-pod">Native K8s pods</span>
        </div>
      </article>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Topology-aware scheduling policies</span><strong>{topologyAwareScheduling.filter((p) => p.enabled).length} active</strong></div>
          <ul className="topology-policy-list">
            {topologyAwareScheduling.map((policy) => (
              <li key={policy.policy} className={policy.enabled ? 'policy-on' : 'policy-off'}>
                <span className="policy-dot" aria-hidden="true" />
                <strong>{policy.policy}</strong>
                <small>{policy.description}</small>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>Unified scheduler signals</span><strong>poly-compute</strong></div>
          <ul className="scheduler-stat-list">
            {unifiedScheduler.map((stat) => (
              <li key={stat.metric}>
                <span>{stat.metric}</span>
                <strong>{stat.value}</strong>
                <small>{stat.trend}</small>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

export function AccelerationDashboardView() {
  const { features, numaPinning, passThrough, nestedClusters, dpdkPorts, spdkLanes } = accel;
  return (
    <section className="dash dash-acceleration" aria-label="Acceleration and pass-through dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">SILICON // ACCEL</span>
          <h2>{accel.title}</h2>
          <p>SPDK, DPDK, vhost-user fast paths · NUMA pinning + 1 GiB hugepages · GPU / FPGA / smart-NIC pass-through · nested virtualization for AI/ML.</p>
        </div>
        <div className="dash-totals">
          <div><span>Features</span><strong>{features.filter((f) => f.enabled).length}/{features.length}</strong></div>
          <div><span>Pass-through</span><strong>{passThrough.length}</strong></div>
          <div><span>Nested</span><strong>{nestedClusters.length}</strong></div>
        </div>
      </header>

      <article className="dash-panel">
        <div className="panel-title"><span>Acceleration feature mesh</span><strong>data-path · scheduling · pass-through · nested-virt</strong></div>
        <div className="accel-feature-grid">
          {features.map((feature) => (
            <article key={feature.id} className={`accel-feature accel-${feature.kind} ${feature.enabled ? 'on' : 'off'}`}>
              <div className="accel-feature-head">
                <span className="accel-feature-kind">{feature.kind.replace('-', ' ')}</span>
                <strong>{feature.label}</strong>
              </div>
              <p>{feature.detail}</p>
              <div className="accel-util-bar" aria-label={`utilization ${feature.utilizationPercent}%`}>
                <i style={{ width: `${feature.utilizationPercent}%` }} />
                <b>{feature.utilizationPercent}%</b>
              </div>
            </article>
          ))}
        </div>
      </article>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>NUMA pinning + hugepages</span><strong>{numaPinning.length} workloads pinned</strong></div>
          <table className="dash-table">
            <thead><tr><th>workload</th><th>numa</th><th>cores</th><th>hugepages</th><th>pci</th></tr></thead>
            <tbody>
              {numaPinning.map((entry) => (
                <tr key={entry.workload}>
                  <td><strong>{entry.workload}</strong></td>
                  <td>{entry.numaZone}</td>
                  <td>
                    <span title={`cores ${entry.cores.join(', ')}`}>
                      {entry.cores.length} cores
                    </span>
                  </td>
                  <td>{entry.hugepageCount} × {entry.hugepageSizeMiB >= 1024 ? `${entry.hugepageSizeMiB / 1024} GiB` : `${entry.hugepageSizeMiB} MiB`}</td>
                  <td>
                    {entry.pciDevices.map((dev) => (
                      <code key={dev}>{dev}</code>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="dash-panel">
          <div className="panel-title"><span>Pass-through devices</span><strong>vfio-pci · SR-IOV · mdev</strong></div>
          <ul className="passthrough-list">
            {passThrough.map((dev) => (
              <li key={dev.id} className={`pt-${dev.kind}`}>
                <span className={`kind-chip kind-${dev.kind === 'gpu' ? 'block' : dev.kind === 'fpga' ? 'object' : 'file'}`}>{dev.kind}</span>
                <strong>{dev.model}</strong>
                <small>→ {dev.boundTo} · driver {dev.driver}</small>
                <div className="cost-bar"><i style={{ width: `${dev.utilizationPercent}%` }} /></div>
                <b>{dev.utilizationPercent}%</b>
                <em>{dev.memoryGiB} GiB</em>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>SPDK userspace lanes</span><strong>NVMe-oF · Vitastor · Ceph</strong></div>
          <ul className="spdk-lanes">
            {spdkLanes.map((lane) => (
              <li key={lane.lane}>
                <strong>{lane.lane}</strong>
                <dl>
                  <div><dt>Queue depth</dt><dd>{lane.queueDepth}</dd></div>
                  <div><dt>Latency</dt><dd>{lane.latencyMicros} µs</dd></div>
                  <div><dt>Throughput</dt><dd>{lane.throughputGiBs} GiB/s</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </article>
        <article className="dash-panel">
          <div className="panel-title"><span>DPDK ring buffers</span><strong>polled-mode userspace ports</strong></div>
          <ul className="dpdk-ports">
            {dpdkPorts.map((port) => (
              <li key={port.port}>
                <strong>{port.port}</strong>
                <small>{port.queues} queues · burst {port.burstSize} · {(port.packetsPerSecond / 1_000_000).toFixed(1)} Mpps</small>
                <div className="cost-bar"><i style={{ width: `${port.loadPercent}%` }} /></div>
                <b>{port.loadPercent}%</b>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="dash-panel">
        <div className="panel-title"><span>Nested virtualization clusters</span><strong>training · inference · sandbox · ci</strong></div>
        <ul className="nested-cluster-list">
          {nestedClusters.map((cluster) => (
            <li key={cluster.id} className={`nested-role-${cluster.guestRole} nested-status-${cluster.status}`}>
              <strong>{cluster.name}</strong>
              <span className="kind-chip">{cluster.guestRole}</span>
              <small>parent {cluster.parentHost} · {cluster.cpuPinning === 'l1' ? 'L1 nested guest' : 'L2 GPU passthrough'} · {cluster.status}</small>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

export function EnvironmentDashboardView() {
  const { totals, zones, activity, backdropVectors } = environment;
  const vectorPoints = backdropVectors.map((value, index) => `${(index / (backdropVectors.length - 1)) * 100},${100 - value}`).join(' ');

  return (
    <section className="dash dash-environment" aria-label="Environment intelligence dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">ENVIRONMENT // FACILITY</span>
          <h2>{environment.title}</h2>
          <p>Thermals, airflow, humidity, power draw, and facility events rendered as a transparent spatial command layer.</p>
        </div>
        <div className="dash-vip">
          <span>Status</span>
          <strong>{zones.filter((zone) => zone.status !== 'nominal').length} watch zones</strong>
          <small>{zones.length} zones monitored</small>
        </div>
      </header>

      <div className="environment-kpi-grid">
        {totals.map((total) => (
          <article className="environment-kpi" key={total.label}>
            <span>{total.label}</span>
            <strong>{total.value}<small>{total.unit}</small></strong>
            <p>{total.trend}</p>
          </article>
        ))}
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel environment-map-panel">
          <div className="panel-title"><span>Spatial thermal map</span><strong>transparent rack geometry</strong></div>
          <div className="environment-map">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={vectorPoints} />
              <polygon points="8,20 38,8 88,24 78,82 28,92 12,62" />
            </svg>
            {zones.map((zone) => (
              <span className={`environment-zone zone-${zone.status}`} key={zone.id} style={{ left: `${zone.x}%`, top: `${zone.y}%` }}>
                <b>{zone.thermalC}C</b>
                <small>{zone.label}</small>
              </span>
            ))}
          </div>
        </article>

        <article className="dash-panel">
          <div className="panel-title"><span>Facility event rail</span><strong>{activity.length} live events</strong></div>
          <ul className="environment-event-list">
            {activity.map((event) => (
              <li className={`event-${event.severity}`} key={`${event.time}-${event.label}`}>
                <span>{event.time}</span>
                <strong>{event.label}</strong>
                <p>{event.detail}</p>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="dash-panel">
        <div className="panel-title"><span>Zone telemetry strips</span><strong>thermal · humidity · airflow · power</strong></div>
        <div className="environment-zone-grid">
          {zones.map((zone) => (
            <div className={`environment-zone-card zone-${zone.status}`} key={zone.id}>
              <div><span>{zone.rack}</span><strong>{zone.label}</strong></div>
              <div className="env-meter"><span>Thermal</span><i style={{ width: `${Math.min(100, zone.thermalC * 2.3)}%` }} /><b>{zone.thermalC}C</b></div>
              <div className="env-meter"><span>Humidity</span><i style={{ width: `${zone.humidityPercent}%` }} /><b>{zone.humidityPercent}%</b></div>
              <div className="env-meter"><span>Airflow</span><i style={{ width: `${Math.min(100, zone.airflowCfm / 320)}%` }} /><b>{Math.round(zone.airflowCfm / 1000)}k CFM</b></div>
              <div className="env-meter"><span>Power</span><i style={{ width: `${Math.min(100, zone.powerKw * 4)}%` }} /><b>{zone.powerKw} kW</b></div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

export function ActivityDashboardView() {
  const { signals, lanes, bursts, timeline } = activity;

  return (
    <section className="dash dash-activity" aria-label="Activity command dashboard">
      <header className="dash-header">
        <div>
          <span className="dash-kicker">ACTIVITY // COMMAND</span>
          <h2>{activity.title}</h2>
          <p>Automation queues, approvals, apply operations, migrations, backups, and security scans in one operator surface.</p>
        </div>
        <div className="dash-vip">
          <span>Queue</span>
          <strong>{lanes.reduce((sum, lane) => sum + lane.queued, 0)} pending</strong>
          <small>{lanes.reduce((sum, lane) => sum + lane.running, 0)} running</small>
        </div>
      </header>

      <div className="activity-signal-grid">
        {signals.map((signal) => (
          <article className="activity-signal" key={signal.label}>
            <span>{signal.label}</span>
            <strong>{signal.value}<small>{signal.unit}</small></strong>
            <p>{signal.trend}</p>
          </article>
        ))}
      </div>

      <div className="dash-row dash-row-2">
        <article className="dash-panel">
          <div className="panel-title"><span>Automation lanes</span><strong>{lanes.length} live queues</strong></div>
          <div className="activity-lane-grid">
            {lanes.map((lane) => (
              <div className="activity-lane" key={lane.id}>
                <div>
                  <strong>{lane.label}</strong>
                  <span>{lane.saturationPercent}% saturated</span>
                </div>
                <div className="activity-lane-stack">
                  <i style={{ width: `${lane.completed / (lane.completed + lane.running + lane.queued + lane.failed) * 100}%` }} />
                  <i style={{ width: `${lane.running / (lane.completed + lane.running + lane.queued + lane.failed) * 100}%` }} />
                  <i style={{ width: `${lane.queued / (lane.completed + lane.running + lane.queued + lane.failed) * 100}%` }} />
                  <i style={{ width: `${lane.failed / (lane.completed + lane.running + lane.queued + lane.failed) * 100}%` }} />
                </div>
                <small>{lane.completed} done · {lane.running} running · {lane.queued} queued · {lane.failed} failed</small>
              </div>
            ))}
          </div>
        </article>

        <article className="dash-panel">
          <div className="panel-title"><span>Command timeline</span><strong>{timeline.length} recent signals</strong></div>
          <ul className="environment-event-list activity-timeline">
            {timeline.map((event) => (
              <li className={`event-${event.severity}`} key={`${event.time}-${event.label}`}>
                <span>{event.time}</span>
                <strong>{event.label}</strong>
                <p>{event.detail}</p>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="dash-panel">
        <div className="panel-title"><span>Signal burst scopes</span><strong>animated samples</strong></div>
        <div className="activity-burst-grid">
          {bursts.map((burst) => (
            <div className="activity-burst" key={burst.label}>
              <strong>{burst.label}</strong>
              <div>
                {burst.samples.map((sample, index) => (
                  <i key={`${burst.label}-${index}`} style={{ height: `${sample}%`, animationDelay: `${index * 70}ms` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
