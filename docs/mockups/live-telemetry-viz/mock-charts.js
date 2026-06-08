/* Live-cluster activity simulator for design mockups */
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function fmtPct(v) { return v.toFixed(1) + '%'; }
function fmtMb(v) { return Math.round(v) + ' Mb/s'; }

/** Simulates correlated cluster bursts (migration, backup, scrape storm, idle). */
function createClusterSim(nodes) {
  let t = 0;
  const events = [
    { name: 'vm-db-01 migration', node: 1, cpu: 0.95, ram: 0.85, disk: 0.92, net: 0.88, duration: 90 },
    { name: 'Longhorn replica sync', node: 0, cpu: 0.55, ram: 0.5, disk: 0.98, net: 0.72, duration: 70 },
    { name: 'Ingress burst · api-gw', node: 2, cpu: 0.75, ram: 0.45, disk: 0.35, net: 0.96, duration: 55 },
    { name: 'Kubelet image pull', node: 0, cpu: 0.6, ram: 0.4, disk: 0.78, net: 0.9, duration: 45 },
    { name: 'VM snapshot · vm-web', node: 2, cpu: 0.65, ram: 0.7, disk: 0.92, net: 0.25, duration: 60 },
    { name: 'PVC resize · data-vol', node: 1, cpu: 0.4, ram: 0.35, disk: 0.88, net: 0.4, duration: 50 },
  ];
  let eventIdx = 0;
  let current = null;
  const cache = { nodes: [], agg: null };

  function pickEvent() {
    current = { ...events[eventIdx % events.length], tick: 0 };
    eventIdx += 1;
  }
  pickEvent();

  function nodeSample(nodeIdx) {
    const micro = Math.sin(t / 2.1 + nodeIdx * 1.7) * 4 + Math.sin(t / 0.9 + nodeIdx) * 2;
    const idle = {
      cpu: 22 + Math.sin(t / 5 + nodeIdx) * 12 + Math.sin(t / 1.8 + nodeIdx * 2) * 8 + micro,
      ram: 54 + Math.sin(t / 8 + nodeIdx * 1.3) * 14 + Math.random() * 3,
      disk: 1200 + Math.sin(t / 3.2 + nodeIdx) * 900 + Math.sin(t / 1.4) * 600 + Math.random() * 400,
      net: 180 + Math.sin(t / 2.8 + nodeIdx) * 120 + Math.sin(t / 1.1 + nodeIdx * 3) * 80 + Math.random() * 60,
    };

    if (!current) return { ...idle, event: null, eventStrength: 0 };

    const ramp = Math.sin((current.tick / current.duration) * Math.PI);
    const onNode = current.node === nodeIdx;
    const spill = onNode ? 1 : 0.22;
    const burst = ramp * spill;

    return {
      cpu: clamp(idle.cpu + burst * current.cpu * 62 + (Math.random() - 0.5) * 10, 4, 99),
      ram: clamp(idle.ram + burst * current.ram * 32 + (Math.random() - 0.5) * 6, 20, 98),
      disk: clamp(idle.disk + burst * current.disk * 16000 + Math.random() * 1200, 200, 24000),
      net: clamp(idle.net + burst * current.net * 1000 + Math.random() * 120, 20, 1400),
      event: onNode && burst > 0.28 ? current.name : null,
      eventStrength: onNode ? burst : spill * 0.35,
    };
  }

  function advance(steps = 1) {
    for (let s = 0; s < steps; s++) {
      t += 1;
      if (current) {
        current.tick += 1;
        if (current.tick > current.duration) pickEvent();
      }
    }
    cache.nodes = Array.from({ length: nodes }, (_, i) => nodeSample(i));
    let cpu = 0, ram = 0, disk = 0, net = 0;
    cache.nodes.forEach(s => { cpu += s.cpu; ram += s.ram; disk += s.disk; net += s.net; });
    cache.agg = {
      cpu: cpu / nodes,
      ram: ram / nodes,
      disk,
      net,
      power: 180 + cpu / nodes * 4.2 + disk / 120,
      event: cache.nodes.find(s => s.event)?.event ?? current?.name ?? 'steady state',
    };
  }

  function sample(_metric, nodeIdx) {
    if (nodeIdx != null) return cache.nodes[nodeIdx] ?? nodeSample(nodeIdx);
    return cache.agg ?? { cpu: 40, ram: 55, disk: 5000, net: 400, power: 400, event: 'steady state' };
  }

  function clusterAggregate() {
    return sample('agg');
  }

  advance();
  return { sample, clusterAggregate, advance, nodeCount: nodes };
}

function pushSeries(series, value, maxLen) {
  series.push(value);
  while (series.length > maxLen) series.shift();
}

function drawRibbon(canvas, series, tick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const barW = w / series.length;
  series.forEach((v, i) => {
    const age = i / series.length;
    const bh = (v / 100) * h * 0.92;
    const hue = lerp(145, 0, v / 100);
    ctx.fillStyle = `hsla(${hue}, 72%, ${45 + age * 12}%, ${0.45 + v / 180})`;
    ctx.fillRect(i * barW + 1, h - bh, barW - 2, bh);
  });

  // scan highlight
  const scan = ((tick * 0.06) % 1) * w;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(scan - 8, 0, 16, h);
}

function drawScope(canvas, channels, tick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const padL = opts.compact ? 28 : 48;
  const padR = 16;
  const padT = 12;
  const padB = opts.compact ? 8 : 24;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // grid + time ticks
  ctx.strokeStyle = 'rgba(91, 140, 255, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 20; i++) {
    const x = padL + (i / 20) * plotW;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
  }
  for (let j = 0; j <= 6; j++) {
    const y = padT + (j / 6) * plotH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
  }

  channels.forEach((ch) => {
    const len = ch.series.length;
    if (len < 2) return;
    const maxV = ch.max ?? 100;
    const points = ch.series.map((v, i) => ({
      x: padL + (i / (len - 1)) * plotW,
      y: padT + plotH - (v / maxV) * plotH,
      v,
    }));

    // min/max envelope
    if (ch.envelope && points.length > 4) {
      const window = 6;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const slice = ch.series.slice(Math.max(0, i - window), i + 1);
        const lo = Math.min(...slice);
        const hi = Math.max(...slice);
        const x = points[i].x;
        const yLo = padT + plotH - (lo / maxV) * plotH;
        if (i === 0) ctx.moveTo(x, yHi);
        else ctx.lineTo(x, yHi);
        if (i === points.length - 1) {
          for (let j = points.length - 1; j >= 0; j--) {
            const sl = ch.series.slice(Math.max(0, j - window), j + 1);
            const yL = padT + plotH - (Math.min(...sl) / maxV) * plotH;
            ctx.lineTo(points[j].x, yL);
          }
        }
      }
      ctx.closePath();
      const hexEnv = ch.color;
      if (hexEnv.startsWith('#')) {
        const r = parseInt(hexEnv.slice(1, 3), 16);
        const g = parseInt(hexEnv.slice(3, 5), 16);
        const b = parseInt(hexEnv.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r},${g},${b},0.14)`;
      }
      ctx.fill();
    }

    const hex = ch.color;

    // area fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, padT + plotH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, padT + plotH);
    ctx.closePath();
    const fg = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    if (hex.startsWith('#')) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      fg.addColorStop(0, `rgba(${r},${g},${b},0.45)`);
      fg.addColorStop(1, `rgba(${r},${g},${b},0.02)`);
    }
    ctx.fillStyle = fg;
    ctx.fill();

    // line + glow
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = opts.compact ? 2 : 2.8;
    ctx.shadowColor = ch.color;
    ctx.shadowBlur = opts.compact ? 6 : 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // spark dots on recent peaks
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, opts.compact ? 3 : 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(last.x, last.y, opts.compact ? 5 : 9, 0, Math.PI * 2);
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // sweep cursor + readout
  const sweepX = padL + ((tick * 0.035) % 1) * plotW;
  ctx.strokeStyle = 'rgba(91, 140, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#5b8cff';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(sweepX, padT);
  ctx.lineTo(sweepX, h - padB);
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (opts.showCrosshair !== false) {
    ctx.fillStyle = 'rgba(91, 140, 255, 0.15)';
    ctx.fillRect(sweepX - 1, padT, 2, plotH);
  }
}

function drawMiniStrip(canvas, series, color, tick, maxV = 100) {
  drawScope(canvas, [{ series, color, max: maxV, envelope: true }], tick, { compact: true, showCrosshair: false });
}

export function initMockCharts(config) {
  const sim = createClusterSim(config.nodeCount ?? 3);
  let tick = 0;
  const ribbons = config.ribbons || [];
  const scopes = config.scopes || [];
  const series = {};
  const ribbonSeries = ribbons.map(() => []);

  scopes.forEach((s, si) => {
    s.channels.forEach((ch, ci) => {
      series[`${si}-${ci}`] = [];
      for (let i = 0; i < (s.len ?? 64); i++) {
        series[`${si}-${ci}`].push(ch.base ?? 40);
      }
    });
  });

  function frame() {
    tick += 1;
    sim.advance();
    const agg = sim.clusterAggregate();

    ribbons.forEach((r, ri) => {
      const anomaly = clamp(
        8 + Math.abs(agg.cpu - 42) * 0.9 + (agg.disk > 8000 ? 25 : 0) + Math.sin(tick / 8) * 6,
        2, 95
      );
      pushSeries(ribbonSeries[ri], anomaly, 80);
      drawRibbon(r.el, ribbonSeries[ri], tick);
      if (r.labelEl) r.labelEl.textContent = anomaly.toFixed(0) + '% peak';
    });

    scopes.forEach((s, si) => {
      const channels = s.channels.map((ch, ci) => {
        const key = `${si}-${ci}`;
        const prev = series[key];
        let nextVal;
        if (ch.metric === 'cpu') nextVal = ch.node != null ? sim.sample('cpu', ch.node).cpu : agg.cpu;
        else if (ch.metric === 'ram') nextVal = ch.node != null ? sim.sample('ram', ch.node).ram : agg.ram;
        else if (ch.metric === 'disk') nextVal = ch.node != null ? sim.sample('disk', ch.node).disk : agg.disk;
        else if (ch.metric === 'net-rx') nextVal = (ch.node != null ? sim.sample('net', ch.node).net : agg.net) * 0.55;
        else if (ch.metric === 'net-tx') nextVal = (ch.node != null ? sim.sample('net', ch.node).net : agg.net) * 0.48;
        else if (ch.metric === 'net') nextVal = ch.node != null ? sim.sample('net', ch.node).net : agg.net;
        else if (ch.metric === 'power') nextVal = agg.power / 12;
        else nextVal = (ch.base ?? 40) + Math.sin(tick / 4 + ci) * (ch.amp ?? 20);

        pushSeries(prev, nextVal, s.len ?? 64);
        series[key] = prev;
        return {
          series: prev,
          color: ch.color,
          max: ch.max ?? (ch.metric === 'disk' ? 22000 : ch.metric === 'net' ? 1200 : 100),
          envelope: ch.envelope !== false,
        };
      });

      if (s.compact) {
        channels.forEach((ch, ci) => drawMiniStrip(s.el, ch.series, ch.color, tick + ci, ch.max));
      } else {
        drawScope(s.el, channels, tick);
      }

      if (s.onUpdate) s.onUpdate(agg, channels);
    });

    if (config.onTick) config.onTick(tick, agg, sim);

    requestAnimationFrame(frame);
  }
  frame();
  return sim;
}



function setupDynamicPillars(container, nodeConfigs, sim) {
  container.innerHTML = `
    <div class="terrain-floor">
      <div class="terrain-grid"></div>
      <div class="terrain-particles" id="terrain-particles"></div>
    </div>
    <div class="terrain-hud" id="terrain-hud"></div>`;
  const floor = container.querySelector('.terrain-floor');
  const hud = container.querySelector('#terrain-hud');
  const pillars = [];

  nodeConfigs.forEach((n, i) => {
    const el = document.createElement('div');
    el.className = 'pillar';
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.style.setProperty('--pillar-top', n.colorTop);
    el.style.setProperty('--pillar-base', n.colorBase);
    el.style.setProperty('--pillar-glow', n.glow);
    el.style.animationDelay = `${i * 0.15}s`;
    el.innerHTML = `
      <div class="pillar-label">${n.name}<br><span class="pillar-cpu">—</span> · <span class="pillar-ram">—</span></div>
      <div class="pillar-bar"></div>
      <div class="pillar-base-glow"></div>`;
    floor.appendChild(el);
    pillars.push({ el, cfg: n, bar: el.querySelector('.pillar-bar') });
  });

  const particlesEl = container.querySelector('#terrain-particles');
  const particles = Array.from({ length: 24 }, (_, i) => ({
    x: Math.random() * 400,
    y: Math.random() * 400,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    el: document.createElement('div'),
  }));
  particles.forEach(p => {
    p.el.className = 'terrain-particle';
    particlesEl.appendChild(p.el);
  });

  let tick = 0;
  function frame() {
    tick += 1;
    let eventLabel = '';
    pillars.forEach((p, i) => {
      const s = sim.sample('pillar', i);
      const h = 24 + s.cpu * 1.35;
      p.bar.style.height = `${h}px`;
      p.el.querySelector('.pillar-cpu').textContent = fmtPct(s.cpu);
      p.el.querySelector('.pillar-ram').textContent = fmtPct(s.ram) + ' RAM';
      p.el.classList.toggle('pillar-hot', s.cpu > 65);
      p.el.classList.toggle('pillar-burst', s.eventStrength > 0.4);
      if (s.event) eventLabel = s.event;
    });

    hud.innerHTML = eventLabel
      ? `<span class="terrain-event">${eventLabel}</span>`
      : `<span class="terrain-idle">cluster steady · ${nodeConfigs.length} nodes reporting</span>`;

    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > 400) p.vx *= -1;
      if (p.y < 0 || p.y > 400) p.vy *= -1;
      p.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      p.el.style.opacity = 0.2 + Math.sin(tick / 10 + p.x) * 0.15;
    });

    requestAnimationFrame(frame);
  }
  frame();
}

export function initSpatialMap(container, nodes, sim) {
  container.innerHTML = `
    <canvas class="spatial-canvas" id="spatial-canvas"></canvas>
    <div class="spatial-overlay" id="spatial-pins"></div>
    <div class="spatial-legend">
      <span><i class="dot-cpu"></i> CPU load</span>
      <span><i class="dot-net"></i> Network flow</span>
      <span><i class="dot-thermal"></i> Thermal proxy</span>
    </div>`;

  const canvas = container.querySelector('#spatial-canvas');
  const pinsEl = container.querySelector('#spatial-pins');
  const ctx = canvas.getContext('2d');

  nodes.forEach((n, i) => {
    const pin = document.createElement('div');
    pin.className = 'zone-pin';
    pin.style.left = n.x;
    pin.style.top = n.y;
    pin.style.animationDelay = `${i * 0.35}s`;
    pin.innerHTML = `
      <b class="pin-temp">—</b>
      <small>${n.name}</small>
      <div class="pin-metrics"><span class="pin-cpu">—</span> · <span class="pin-net">—</span></div>`;
    pinsEl.appendChild(pin);
    n.pinEl = pin;
    n.px = parseFloat(n.x) / 100;
    n.py = parseFloat(n.y) / 100;
  });

  const flows = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      flows.push({ from: i, to: j, phase: Math.random() * Math.PI * 2 });
    }
  }

  let tick = 0;
  function draw() {
    tick += 1;
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.clearRect(0, 0, w, h);

    const samples = nodes.map((_, i) => sim.sample('spatial', i));

    // thermal heat blobs
    samples.forEach((s, i) => {
      const nx = nodes[i].px * w;
      const ny = nodes[i].py * h;
      const r = 60 + s.cpu * 2.2;
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, r);
      const heat = s.cpu / 100;
      g.addColorStop(0, `rgba(${lerp(56, 248, heat)}, ${lerp(189, 113, heat)}, ${lerp(248, 113, heat)}, ${0.25 + heat * 0.35})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });

    // grid floor
    ctx.strokeStyle = 'rgba(91, 140, 255, 0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // network flows between nodes
    flows.forEach(f => {
      const a = nodes[f.from];
      const b = nodes[f.to];
      const sa = samples[f.from];
      const sb = samples[f.to];
      const throughput = (sa.net + sb.net) / 2;
      const ax = a.px * w, ay = a.py * h;
      const bx = b.px * w, by = b.py * h;
      const pulse = (Math.sin(tick / 8 + f.phase) + 1) / 2;
      ctx.strokeStyle = `rgba(251, 191, 36, ${0.15 + (throughput / 1200) * 0.5})`;
      ctx.lineWidth = 1 + (throughput / 600);
      ctx.setLineDash([6, 10]);
      ctx.lineDashOffset = -tick * 0.8;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);

      const t = (tick * 0.02 + f.phase) % 1;
      const px = lerp(ax, bx, t);
      const py = lerp(ay, by, t);
      ctx.beginPath();
      ctx.arc(px, py, 4 + pulse * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(251, 191, 36, ${0.5 + pulse * 0.4})`;
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // node rings
    nodes.forEach((n, i) => {
      const s = samples[i];
      const nx = n.px * w;
      const ny = n.py * h;
      const r = 18 + s.cpu * 0.25;
      ctx.beginPath();
      ctx.arc(nx, ny, r + Math.sin(tick / 6 + i) * 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(91, 140, 255, ${0.35 + s.cpu / 200})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      n.pinEl.querySelector('.pin-temp').textContent = Math.round(32 + s.cpu * 0.18) + '°C';
      n.pinEl.querySelector('.pin-cpu').textContent = fmtPct(s.cpu);
      n.pinEl.querySelector('.pin-net').textContent = fmtMb(s.net);
      n.pinEl.classList.toggle('zone-hot', s.cpu > 62);
    });

    requestAnimationFrame(draw);
  }
  draw();
}
