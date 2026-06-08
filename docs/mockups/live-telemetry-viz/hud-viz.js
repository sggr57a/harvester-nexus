/**
 * Futuristic HUD visualization kit (inspired by sci-fi dashboard references).
 * Radial gauges, radar scopes, hex topology, circular waveforms, bar matrices.
 */

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function drawHudGrid(ctx, w, h, step, alpha = 0.08) {
  ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

function drawHudBrackets(ctx, w, h, pad, color = 'rgba(56,189,248,0.55)') {
  const len = 22;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const corners = [
    [pad, pad + len, pad, pad, pad + len, pad],
    [w - pad, pad + len, w - pad, pad, w - pad - len, pad],
    [pad, h - pad - len, pad, h - pad, pad + len, h - pad],
    [w - pad, h - pad - len, w - pad, h - pad, w - pad - len, h - pad],
  ];
  corners.forEach(([x1, y1, x2, y2, x3, y3]) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke();
  });
}

/** Concentric arc gauge with tick ring and sweep needle */
function drawRadialGauge(canvas, value, max, label, unit, color, tick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2 + (opts.offsetY ?? 0);
  const R = Math.min(w, h) * 0.38;
  const pct = clamp(value / max, 0, 1);

  drawHudGrid(ctx, w, h, 24, 0.04);

  // outer decorative rings
  for (let ri = 4; ri >= 1; ri--) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * (0.55 + ri * 0.12), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.06 + ri * 0.03})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // tick marks
  const ticks = opts.ticks ?? 36;
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2 - Math.PI / 2;
    const major = i % 3 === 0;
    const r0 = R * (major ? 0.72 : 0.78);
    const r1 = R * 0.92;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.strokeStyle = major ? 'rgba(56,189,248,0.5)' : 'rgba(56,189,248,0.2)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.stroke();
  }

  // background arc
  const arcStart = Math.PI * 0.75;
  const arcEnd = Math.PI * 2.25;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.65, arcStart, arcEnd);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.stroke();

  // value arc
  const { r, g, b } = hexToRgb(color);
  const valAngle = arcStart + (arcEnd - arcStart) * pct;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.65, arcStart, valAngle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // inner pulse ring
  const pulse = 0.85 + Math.sin(tick / 12) * 0.08;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.42 * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${r},${g},${b},0.25)`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // sweep needle
  const sweepA = (tick * 0.04) % (Math.PI * 2);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweepA - Math.PI / 2) * R * 0.88, cy + Math.sin(sweepA - Math.PI / 2) * R * 0.88);
  ctx.strokeStyle = 'rgba(91, 140, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // center readout
  ctx.fillStyle = '#e8eef8';
  ctx.font = `600 ${Math.round(R * 0.28)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const display = opts.format ? opts.format(value) : (value >= 1000 ? fmtK(value) : value.toFixed(1));
  ctx.fillText(display, cx, cy - 4);
  ctx.font = `400 ${Math.round(R * 0.14)}px Inter, sans-serif`;
  ctx.fillStyle = '#8b9bb8';
  ctx.fillText(unit || '', cx, cy + R * 0.18);

  ctx.font = `500 ${Math.round(R * 0.12)}px Inter, sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(label, cx, h - 16);
}

/** Polar radar with node blips and rotating sweep */
function drawRadarScope(canvas, nodes, sim, tick) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.44;

  drawHudBrackets(ctx, w, h, 12);

  // range rings
  for (let i = 1; i <= 5; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (R / 5) * i, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.08 + i * 0.04})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = '18px Inter, sans-serif';
    ctx.fillStyle = 'rgba(139,155,184,0.5)';
    ctx.textAlign = 'center';
    ctx.fillText(`${i * 20}%`, cx + (R / 5) * i - 8, cy - 4);
  }

  // cross hairs
  ctx.strokeStyle = 'rgba(56,189,248,0.15)';
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();

  // rotating sweep wedge
  const sweepA = (tick * 0.035) % (Math.PI * 2);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R, sweepA - Math.PI / 2 - 0.35, sweepA - Math.PI / 2);
  ctx.closePath();
  const wg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  wg.addColorStop(0, 'rgba(56,189,248,0.25)');
  wg.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = wg;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweepA - Math.PI / 2) * R, cy + Math.sin(sweepA - Math.PI / 2) * R);
  ctx.strokeStyle = 'rgba(56,189,248,0.8)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // node blips (polar placement)
  const samples = nodes.map((_, i) => sim.sample('radar', i));
  nodes.forEach((n, i) => {
    const s = samples[i];
    const angle = n.angle ?? (i / nodes.length) * Math.PI * 2;
    const dist = R * (0.35 + (s.cpu / 100) * 0.55);
    const bx = cx + Math.cos(angle - Math.PI / 2) * dist;
    const by = cy + Math.sin(angle - Math.PI / 2) * dist;
    const hot = s.cpu > 60;
    const blipR = 8 + s.cpu * 0.12;

    // trail
    for (let t = 1; t <= 4; t++) {
      ctx.beginPath();
      ctx.arc(bx, by, blipR + t * 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${hot ? '251,191,36' : '91,140,255'}, ${0.15 - t * 0.03})`;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(bx, by, blipR, 0, Math.PI * 2);
    ctx.fillStyle = hot ? 'rgba(251,191,36,0.9)' : 'rgba(91,140,255,0.85)';
    ctx.shadowColor = hot ? '#fbbf24' : '#5b8cff';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;

    // label block
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.fillStyle = '#e8eef8';
    ctx.textAlign = 'left';
    ctx.fillText(n.name, bx + 14, by - 8);
    ctx.font = '16px Inter, sans-serif';
    ctx.fillStyle = '#8b9bb8';
    ctx.fillText(`${fmtPct(s.cpu)} · ${fmtMb(s.net)}`, bx + 14, by + 12);
    if (s.event) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('▲ ' + s.event.slice(0, 22), bx + 14, by + 28);
    }
  });

  ctx.font = '18px Inter, sans-serif';
  ctx.fillStyle = 'rgba(139,155,184,0.6)';
  ctx.textAlign = 'center';
  ctx.fillText('CLUSTER RADAR · LIVE', cx, 20);
}

/** Hexagonal topology map with metric-filled cells */
function drawHexTopology(canvas, nodes, sim, tick) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  drawHudGrid(ctx, w, h, 32, 0.05);
  drawHudBrackets(ctx, w, h, 10);

  const size = 36;
  const hexH = size * Math.sqrt(3);

  function hexPath(x, y, s) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = x + Math.cos(a) * s;
      const py = y + Math.sin(a) * s;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  const samples = nodes.map((_, i) => sim.sample('hex', i));
  const positions = nodes.map(n => ({ x: n.hx * w, y: n.hy * h }));

  // inter-node links
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const throughput = (samples[i].net + samples[j].net) / 2;
      ctx.beginPath();
      ctx.moveTo(positions[i].x, positions[i].y);
      ctx.lineTo(positions[j].x, positions[j].y);
      ctx.strokeStyle = `rgba(251, 191, 36, ${0.1 + throughput / 2000})`;
      ctx.lineWidth = 1 + throughput / 800;
      ctx.setLineDash([4, 8]);
      ctx.lineDashOffset = -tick * 0.6;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  nodes.forEach((n, i) => {
    const s = samples[i];
    const x = positions[i].x;
    const y = positions[i].y;
    const load = s.cpu / 100;
    const { r, g, b } = hexToRgb(load > 0.6 ? '#fbbf24' : '#5b8cff');

    hexPath(x, y, size);
    ctx.fillStyle = `rgba(${r},${g},${b},${0.15 + load * 0.35})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // inner micro bars
    for (let b = 0; b < 5; b++) {
      const bh = (s.ram / 100) * 20 * ((b + 1) / 5);
      ctx.fillStyle = `rgba(56,189,248,${0.3 + b * 0.1})`;
      ctx.fillRect(x - 18 + b * 8, y + 8 - bh, 5, bh);
    }

    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillStyle = '#e8eef8';
    ctx.textAlign = 'center';
    ctx.fillText(n.name.replace('harvester-', 'h-'), x, y - 8);
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(fmtPct(s.cpu), x, y + 28);
  });
}

/** Circular oscilloscope — waveform on a ring */
function drawCircularWaveform(canvas, series, color, tick, maxV = 100, label = '') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.38;
  const len = series.length;

  drawHudBrackets(ctx, w, h, 8, 'rgba(56,189,248,0.3)');

  // base ring
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(56,189,248,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const { r, g, b } = hexToRgb(color);

  // waveform as radial displacement
  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const a = (i / len) * Math.PI * 2 - Math.PI / 2;
    const v = series[i] / maxV;
    const rr = R * (0.55 + v * 0.4);
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = `rgba(${r},${g},${b},0.2)`;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // scan dot
  const si = Math.floor((tick * 0.5) % len);
  const sa = (si / len) * Math.PI * 2 - Math.PI / 2;
  const sv = series[si] / maxV;
  const sx = cx + Math.cos(sa) * R * (0.55 + sv * 0.4);
  const sy = cy + Math.sin(sa) * R * (0.55 + sv * 0.4);
  ctx.beginPath();
  ctx.arc(sx, sy, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // center label
  ctx.font = '600 28px Inter, sans-serif';
  ctx.fillStyle = '#e8eef8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
}

/** Dense vertical bar matrix (HUD infographic style) */
function drawBarMatrix(canvas, rows, tick) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  drawHudGrid(ctx, w, h, 20, 0.04);
  drawHudBrackets(ctx, w, h, 8);

  const rowH = h / rows.length;
  rows.forEach((row, ri) => {
    const y0 = ri * rowH + 8;
    const barArea = rowH - 16;

    ctx.font = '16px Inter, sans-serif';
    ctx.fillStyle = '#8b9bb8';
    ctx.textAlign = 'left';
    ctx.fillText(row.label, 12, y0 + 14);

    const cols = row.values.length;
    const barW = (w - 120) / cols;
    row.values.forEach((v, ci) => {
      const bh = (v / row.max) * barArea * 0.85;
      const x = 110 + ci * barW;
      const pulse = 1 + Math.sin(tick / 8 + ci + ri) * 0.05;
      const { r, g, b } = hexToRgb(row.color);
      ctx.fillStyle = `rgba(${r},${g},${b},0.25)`;
      ctx.fillRect(x, y0 + barArea - bh * pulse, barW - 3, bh * pulse);
      ctx.fillStyle = row.color;
      ctx.fillRect(x, y0 + barArea - bh * pulse, barW - 3, 3);
    });

    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillStyle = row.color;
    ctx.textAlign = 'right';
    ctx.fillText(row.readout, w - 12, y0 + 14);
  });
}

/** Wireframe globe with node pins for environment spatial */
function drawWireframeGlobe(canvas, nodes, sim, tick) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.38;
  const rot = tick * 0.008;

  drawHudBrackets(ctx, w, h, 14);

  // latitude lines
  for (let lat = -60; lat <= 60; lat += 30) {
    const latR = R * Math.cos((lat * Math.PI) / 180);
    const yOff = R * Math.sin((lat * Math.PI) / 180);
    ctx.beginPath();
    ctx.ellipse(cx, cy + yOff, latR, latR * 0.35, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56,189,248,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // longitude lines
  for (let lon = 0; lon < 12; lon++) {
    const a = rot + (lon / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * Math.abs(Math.cos(a)), R, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(56,189,248,${0.1 + Math.abs(Math.cos(a)) * 0.15})`;
    ctx.stroke();
  }

  // outer glow ring
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.05, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(56,189,248,0.35)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 20;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const samples = nodes.map((_, i) => sim.sample('globe', i));
  nodes.forEach((n, i) => {
    const s = samples[i];
    const lon = n.lon + rot;
    const lat = n.lat;
    const px = cx + Math.cos(lon) * R * 0.85 * Math.cos(lat);
    const py = cy + Math.sin(lat) * R * 0.55;
    const depth = Math.cos(lon);
    if (depth < -0.2) return;

    const hot = s.cpu > 55;
    ctx.beginPath();
    ctx.arc(px, py, 6 + s.cpu * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = hot ? 'rgba(251,191,36,0.9)' : 'rgba(91,140,255,0.85)';
    ctx.shadowColor = hot ? '#fbbf24' : '#5b8cff';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    // pin stem
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py - 20 - s.cpu * 0.2);
    ctx.strokeStyle = `rgba(56,189,248,${0.4 + depth * 0.3})`;
    ctx.stroke();

    ctx.font = `${12 + depth * 4}px Inter, sans-serif`;
    ctx.fillStyle = '#e8eef8';
    ctx.textAlign = 'center';
    ctx.fillText(n.name, px, py - 28 - s.cpu * 0.2);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`${Math.round(32 + s.cpu * 0.18)}°C · ${fmtPct(s.cpu)}`, px, py - 14 - s.cpu * 0.2);
  });

  ctx.font = '18px Inter, sans-serif';
  ctx.fillStyle = 'rgba(139,155,184,0.6)';
  ctx.textAlign = 'center';
  ctx.fillText('NODE TOPOLOGY · WIREframe', cx, h - 16);
}

/** Multi-ring circular scope — stacked metrics as concentric waveforms */
function drawMultiRingScope(canvas, channels, tick) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.42;

  drawHudGrid(ctx, w, h, 28, 0.04);
  drawHudBrackets(ctx, w, h, 12);

  channels.forEach((ch, ci) => {
    const ringR = maxR * (0.35 + ci * 0.14);
    const len = ch.series.length;
    const maxV = ch.max ?? 100;
    const { r, g, b } = hexToRgb(ch.color);

    ctx.beginPath();
    for (let i = 0; i <= len; i++) {
      const v = ch.series[i % len] / maxV;
      const a = (i / len) * Math.PI * 2 - Math.PI / 2;
      const rr = ringR * (0.7 + v * 0.35);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = ch.color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // legend tick on ring
    const last = ch.series[len - 1];
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = ch.color;
    ctx.textAlign = 'left';
    ctx.fillText(`${ch.label} ${ch.format ? ch.format(last) : last.toFixed(0)}`, 16, 24 + ci * 20);
  });

  // rotating scanner
  const sa = (tick * 0.03) % (Math.PI * 2);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sa - Math.PI / 2) * maxR, cy + Math.sin(sa - Math.PI / 2) * maxR);
  ctx.strokeStyle = 'rgba(91,140,255,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Initialize full HUD dashboard wiring */
function initHudDashboard(sim, config) {
  let tick = 0;
  const series = {};
  (config.seriesKeys || []).forEach(k => { series[k] = []; });

  function getVal(metric, node) {
    if (node != null) {
      const s = sim.sample(metric, node);
      if (metric === 'net-rx') return s.net * 0.55;
      if (metric === 'net-tx') return s.net * 0.48;
      if (metric === 'power') return 180 + s.cpu * 4.2;
      return s[metric] ?? 0;
    }
    const agg = sim.clusterAggregate();
    if (metric === 'cpu') return agg.cpu;
    if (metric === 'ram') return agg.ram;
    if (metric === 'disk') return agg.disk;
    if (metric === 'net') return agg.net;
    if (metric === 'net-rx') return agg.net * 0.55;
    if (metric === 'net-tx') return agg.net * 0.48;
    if (metric === 'power') return agg.power;
    return 0;
  }

  function frame() {
    tick += 1;
    sim.advance();
    const agg = sim.clusterAggregate();

    (config.gauges || []).forEach(g => {
      const v = getVal(g.metric, g.node);
      drawRadialGauge(g.el, v, g.max ?? 100, g.label, g.unit, g.color, tick, g.opts || {});
      if (g.valueEl) g.valueEl.textContent = g.opts?.format ? g.opts.format(v) : fmtPct(v);
    });

    (config.radars || []).forEach(r => drawRadarScope(r.el, r.nodes, sim, tick));
    (config.hexMaps || []).forEach(h => drawHexTopology(h.el, h.nodes, sim, tick));
    (config.globes || []).forEach(g => drawWireframeGlobe(g.el, g.nodes, sim, tick));

    (config.ringScopes || []).forEach(rs => {
      const channels = rs.channels.map(ch => {
        const key = ch.key;
        if (!series[key]) series[key] = [];
        pushSeries(series[key], getVal(ch.metric, ch.node), rs.len ?? 64);
        return {
          series: series[key],
          color: ch.color,
          max: ch.max ?? 100,
          label: ch.label,
          format: ch.format,
        };
      });
      drawMultiRingScope(rs.el, channels, tick);
    });

    (config.circularWaves || []).forEach(cw => {
      const key = cw.key;
      if (!series[key]) series[key] = [];
      pushSeries(series[key], getVal(cw.metric, cw.node), cw.len ?? 48);
      drawCircularWaveform(cw.el, series[key], cw.color, tick, cw.max ?? 100, cw.centerLabel);
    });

    (config.barMatrices || []).forEach(bm => {
      const rows = bm.rows.map(row => ({
        label: row.label,
        color: row.color,
        max: row.max,
        readout: row.readout(sim),
        values: row.nodes.map(i => sim.sample('bar', i)[row.field]),
      }));
      drawBarMatrix(bm.el, rows, tick);
    });

    if (config.onTick) config.onTick(tick, agg, sim);
    requestAnimationFrame(frame);
  }
  frame();
  return sim;
}
