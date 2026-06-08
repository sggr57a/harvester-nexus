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
  const compact = opts.compact ?? h < 220;
  const R = Math.min(w, h) * (compact ? 0.44 : 0.38);
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
  ctx.font = `600 ${Math.round(R * (compact ? 0.32 : 0.28))}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const display = opts.format ? opts.format(value) : (value >= 1000 ? fmtK(value) : value.toFixed(1));
  ctx.fillText(display, cx, cy - (compact ? 2 : 4));
  ctx.font = `400 ${Math.round(R * (compact ? 0.12 : 0.14))}px Inter, sans-serif`;
  ctx.fillStyle = '#8b9bb8';
  ctx.fillText(unit || '', cx, cy + R * (compact ? 0.14 : 0.18));

  ctx.font = `500 ${Math.round(R * (compact ? 0.1 : 0.12))}px Inter, sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(label, cx, h - (compact ? 8 : 16));
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

/** Animated area chart — business infographic / stock footage style */
function drawAnimatedAreaChart(canvas, series, color, tick, maxV = 100, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const pad = { l: 44, r: 16, t: opts.title ? 36 : 20, b: 28 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  drawHudGrid(ctx, w, h, 28, 0.05);
  drawHudBrackets(ctx, w, h, 8);

  if (opts.title) {
    ctx.font = '600 20px Inter, sans-serif';
    ctx.fillStyle = '#8b9bb8';
    ctx.textAlign = 'left';
    ctx.fillText(opts.title, pad.l, 24);
  }

  // Y axis ticks
  for (let j = 0; j <= 4; j++) {
    const y = pad.t + (j / 4) * plotH;
    ctx.strokeStyle = 'rgba(56,189,248,0.1)';
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = 'rgba(139,155,184,0.5)';
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(maxV * (1 - j / 4))), pad.l - 6, y + 4);
  }

  const len = series.length;
  if (len < 2) return;
  const { r, g, b } = hexToRgb(color);
  const pts = series.map((v, i) => ({
    x: pad.l + (i / (len - 1)) * plotW,
    y: pad.t + plotH - (v / maxV) * plotH,
  }));

  // gradient area
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pad.t + plotH);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, pad.t + plotH);
  ctx.closePath();
  const ag = ctx.createLinearGradient(0, pad.t, 0, pad.t + plotH);
  ag.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
  ag.addColorStop(0.6, `rgba(${r},${g},${b},0.15)`);
  ag.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = ag;
  ctx.fill();

  // glow line
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // scan pulse
  const scanX = pad.l + ((tick * 0.025) % 1) * plotW;
  ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
  ctx.fillRect(scanX - 20, pad.t, 40, plotH);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(scanX, pad.t); ctx.lineTo(scanX, pad.t + plotH); ctx.stroke();

  // current value badge
  const last = series[len - 1];
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.fillText(opts.format ? opts.format(last) : last.toFixed(1), w - pad.r, pad.t - 4);
}

/** Multi-line cartesian chart with legend */
function drawMultiLineChart(canvas, channels, tick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const pad = { l: 48, r: 16, t: opts.title ? 40 : 24, b: 32 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  drawHudGrid(ctx, w, h, 24, 0.04);
  drawHudBrackets(ctx, w, h, 8);

  if (opts.title) {
    ctx.font = '600 20px Inter, sans-serif';
    ctx.fillStyle = '#8b9bb8';
    ctx.textAlign = 'left';
    ctx.fillText(opts.title, pad.l, 26);
  }

  for (let j = 0; j <= 5; j++) {
    const y = pad.t + (j / 5) * plotH;
    ctx.strokeStyle = 'rgba(56,189,248,0.08)';
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
  }

  channels.forEach((ch, ci) => {
    const len = ch.series.length;
    if (len < 2) return;
    const maxV = ch.max ?? 100;
    const min = Math.min(...ch.series);
    const max = Math.max(...ch.series);
    const avg = ch.series.reduce((a, b) => a + b, 0) / len;

    // faint area under line
    ctx.beginPath();
    ch.series.forEach((v, i) => {
      const x = pad.l + (i / (len - 1)) * plotW;
      const y = pad.t + plotH - (v / maxV) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.l + plotW, pad.t + plotH);
    ctx.lineTo(pad.l, pad.t + plotH);
    ctx.closePath();
    const { r, g, b } = hexToRgb(ch.color);
    ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
    ctx.fill();

    ctx.beginPath();
    ch.series.forEach((v, i) => {
      const x = pad.l + (i / (len - 1)) * plotW;
      const y = pad.t + plotH - (v / maxV) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = ch.color;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const last = ch.series[len - 1];
    ctx.font = '13px Inter, sans-serif';
    ctx.fillStyle = ch.color;
    ctx.textAlign = 'left';
    ctx.fillText(`${ch.label} ${ch.format ? ch.format(last) : last.toFixed(0)}  (avg ${ch.format ? ch.format(avg) : avg.toFixed(0)})`, pad.l + (ci % 2) * 280, h - 22 - Math.floor(ci / 2) * 14);
  });

  const scanX = pad.l + ((tick * 0.02) % 1) * plotW;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(scanX, pad.t); ctx.lineTo(scanX, pad.t + plotH); ctx.stroke();
}

/** Stacked area chart — multiple metrics layered */
function drawStackedAreaChart(canvas, channels, tick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const pad = { l: 44, r: 16, t: 36, b: 28 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const len = channels[0]?.series.length ?? 0;
  if (len < 2) return;

  drawHudBrackets(ctx, w, h, 10);
  ctx.font = '600 20px Inter, sans-serif';
  ctx.fillStyle = '#8b9bb8';
  ctx.textAlign = 'left';
  ctx.fillText(opts.title || 'STACKED METRICS', pad.l, 24);

  const norm = channels.map(ch => ch.series.map(v => v / (ch.max ?? 100)));

  for (let ci = channels.length - 1; ci >= 0; ci--) {
    const ch = channels[ci];
    const { r, g, b } = hexToRgb(ch.color);
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      let base = 0;
      for (let k = 0; k < ci; k++) base += norm[k][i];
      const top = base + norm[ci][i];
      const x = pad.l + (i / (len - 1)) * plotW;
      const y = pad.t + plotH - top * plotH * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = len - 1; i >= 0; i--) {
      let base = 0;
      for (let k = 0; k < ci; k++) base += norm[k][i];
      const x = pad.l + (i / (len - 1)) * plotW;
      const y = pad.t + plotH - base * plotH * 0.9;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
    ctx.fill();
  }

  channels.forEach((ch, ci) => {
    ctx.font = '13px Inter, sans-serif';
    ctx.fillStyle = ch.color;
    ctx.fillRect(pad.l + ci * 90, h - 18, 10, 10);
    const last = ch.series[ch.series.length - 1];
    const avg = ch.series.reduce((a, b) => a + b, 0) / ch.series.length;
    const fmt = (v) => ch.format ? ch.format(v) : v.toFixed(0);
    ctx.fillStyle = '#8b9bb8';
    ctx.fillText(`${ch.label} ${fmt(last)} · avg ${fmt(avg)}`, pad.l + ci * 90 + 14, h - 8);
  });
}

/** Animated column / bar chart */
function drawColumnChart(canvas, bars, tick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const pad = { l: 40, r: 16, t: 36, b: 36 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  drawHudGrid(ctx, w, h, 24, 0.04);
  drawHudBrackets(ctx, w, h, 8);

  ctx.font = '600 20px Inter, sans-serif';
  ctx.fillStyle = '#8b9bb8';
  ctx.textAlign = 'left';
  ctx.fillText(opts.title || '', pad.l, 24);

  const n = bars.length;
  const groupW = plotW / n;
  bars.forEach((bar, i) => {
    const pct = clamp(bar.value / bar.max, 0, 1);
    const anim = 0.88 + Math.sin(tick / 10 + i) * 0.06;
    const bh = plotH * pct * anim;
    const x = pad.l + i * groupW;
    const bw = Math.max(1, groupW - (i === n - 1 ? 0 : 1));
    const y = pad.t + plotH - bh;
    const thermal = opts.thermal || bar.thermal;
    const { r, g, b } = hexToRgb(bar.color);

    // bar glow
    ctx.fillStyle = thermal ? 'rgba(168,85,247,0.18)' : `rgba(${r},${g},${b},0.2)`;
    ctx.fillRect(x - 4, y, bw + 8, bh);
    const bg = ctx.createLinearGradient(x, pad.t + plotH, x, y);
    if (thermal) {
      bg.addColorStop(0, thermalSegmentColor(0, 24));
      bg.addColorStop(0.45, thermalSegmentColor(11, 24));
      bg.addColorStop(0.78, thermalSegmentColor(18, 24));
      bg.addColorStop(1, thermalSegmentColor(23, 24));
    } else {
      bg.addColorStop(0, `rgba(${r},${g},${b},0.25)`);
      bg.addColorStop(1, bar.color);
    }
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, bw, 3);

    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillStyle = thermal ? thermalHeatColor(bar.value, bar.max) : bar.color;
    ctx.textAlign = 'center';
    ctx.fillText(bar.format ? bar.format(bar.value) : bar.value.toFixed(0), x + bw / 2, y - 8);

    ctx.font = '13px Inter, sans-serif';
    ctx.fillStyle = '#8b9bb8';
    ctx.fillText(bar.label, x + bw / 2, pad.t + plotH + 22);
  });
}

/** Donut chart for resource distribution */
function drawDonutChart(canvas, segments, tick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.36;
  const ri = R * 0.58;

  drawHudBrackets(ctx, w, h, 8);

  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let angle = -Math.PI / 2;

  segments.forEach((seg, i) => {
    const slice = (seg.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, angle, angle + slice);
    ctx.arc(cx, cy, ri, angle + slice, angle, true);
    ctx.closePath();
    const { r, g, b } = hexToRgb(seg.color);
    ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
    ctx.shadowColor = seg.color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    angle += slice;
  });

  ctx.font = '600 24px Inter, sans-serif';
  ctx.fillStyle = '#e8eef8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.center || 'MIX', cx, cy - 6);
  ctx.font = '14px Inter, sans-serif';
  ctx.fillStyle = '#8b9bb8';
  ctx.fillText(opts.sub || '', cx, cy + 16);

  segments.forEach((seg, i) => {
    ctx.font = '13px Inter, sans-serif';
    ctx.fillStyle = seg.color;
    ctx.textAlign = 'left';
    ctx.fillRect(12, 20 + i * 18, 8, 8);
    ctx.fillStyle = '#8b9bb8';
    ctx.fillText(`${seg.label} ${seg.format ? seg.format(seg.value) : seg.value.toFixed(0)}`, 24, 28 + i * 18);
  });
}

/** Horizontal meter bank — dense progress rows */
function drawMeterBank(canvas, meters, tick) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  drawHudBrackets(ctx, w, h, 8);
  const rowH = h / meters.length;

  meters.forEach((m, i) => {
    const y = i * rowH + 8;
    const pct = clamp(m.value / m.max, 0, 1);
    const pulse = 1 + Math.sin(tick / 8 + i) * 0.03;

    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = '#8b9bb8';
    ctx.textAlign = 'left';
    ctx.fillText(m.label, 12, y + 16);

    const bx = 160;
    const bw = w - bx - 80;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(bx, y + 6, bw, 10);

    const { r, g, b } = hexToRgb(m.color);
    const fw = bw * pct * pulse;
    const mg = ctx.createLinearGradient(bx, 0, bx + fw, 0);
    mg.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
    mg.addColorStop(1, m.color);
    ctx.fillStyle = mg;
    ctx.fillRect(bx, y + 6, fw, 10);
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx + fw - 2, y + 6, 2, 10);

    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillStyle = m.color;
    ctx.textAlign = 'right';
    ctx.fillText(m.format ? m.format(m.value) : m.value.toFixed(1), w - 12, y + 16);
  });
}

/** Dense sparkline grid — many metrics in one panel */
function drawSparklineGrid(canvas, cells, tick) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  drawHudGrid(ctx, w, h, 16, 0.04);
  drawHudBrackets(ctx, w, h, 8);

  const cols = 4;
  const rows = Math.ceil(cells.length / cols);
  const cellW = w / cols;
  const cellH = h / rows;

  cells.forEach((cell, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = col * cellW + 4;
    const y0 = row * cellH + 4;
    const cw = cellW - 8;
    const ch = cellH - 8;
    const series = cell.series;
    if (series.length < 2) return;

    const min = Math.min(...series);
    const max = Math.max(...series);
    const maxV = cell.max ?? 100;

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x0, y0, cw, ch);
    ctx.strokeStyle = 'rgba(56,189,248,0.18)';
    ctx.strokeRect(x0, y0, cw, ch);

    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = '#8b9bb8';
    ctx.textAlign = 'left';
    ctx.fillText(cell.label, x0 + 6, y0 + 14);

    ctx.font = 'bold 15px Inter, sans-serif';
    ctx.fillStyle = cell.color;
    ctx.textAlign = 'right';
    ctx.fillText(cell.readout, x0 + cw - 6, y0 + 14);

    ctx.font = '9px Inter, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'left';
    ctx.fillText(`↓${cell.format ? cell.format(min) : min.toFixed(0)} ↑${cell.format ? cell.format(max) : max.toFixed(0)}`, x0 + 6, y0 + 26);

    const sparkH = ch - 32;
    const sparkY = y0 + 30;
    const { r, g, b } = hexToRgb(cell.color);

    // filled area
    ctx.beginPath();
    series.forEach((v, si) => {
      const sx = x0 + 4 + (si / (series.length - 1)) * (cw - 8);
      const sy = sparkY + sparkH - (v / maxV) * sparkH;
      if (si === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.lineTo(x0 + cw - 4, sparkY + sparkH);
    ctx.lineTo(x0 + 4, sparkY + sparkH);
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${b},0.2)`;
    ctx.fill();

    ctx.beginPath();
    series.forEach((v, si) => {
      const sx = x0 + 4 + (si / (series.length - 1)) * (cw - 8);
      const sy = sparkY + sparkH - (v / maxV) * sparkH;
      if (si === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.strokeStyle = cell.color;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = cell.color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // heat bars underneath line
    const barCount = Math.min(series.length, 24);
    const slice = series.slice(-barCount);
    const bw = (cw - 8) / barCount;
    slice.forEach((v, bi) => {
      const bh = (v / maxV) * 8;
      ctx.fillStyle = heatColor(v, maxV, cell.color);
      ctx.fillRect(x0 + 4 + bi * bw, sparkY + sparkH - bh, Math.max(1, bw - 1), bh);
    });

    const last = series[series.length - 1];
    const lx = x0 + cw - 8;
    const ly = sparkY + sparkH - (last / maxV) * sparkH;
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  });
}

/** Compact linear gauge (horizontal bar style, not ring) */
function drawLinearGauge(canvas, value, max, label, color, tick) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const pct = clamp(value / max, 0, 1);
  const compact = h < 100;

  ctx.font = `600 ${compact ? 8 : 10}px Inter, sans-serif`;
  ctx.fillStyle = '#8b9bb8';
  ctx.textAlign = 'left';
  ctx.fillText(label, 4, compact ? 11 : 16);

  const by = compact ? 14 : 26;
  const bh = compact ? 10 : 12;
  const bx = 4;
  const bw = w - 8;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(bx, by, bw, bh);
  const fw = bw * pct;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = compact ? 6 : 10;
  ctx.fillRect(bx, by, fw, bh);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx + Math.max(0, fw - 2), by, 2, bh);

  ctx.font = `bold ${compact ? 9 : 11}px Inter, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  const display = max >= 1000 ? fmtK(value) : (value >= 100 ? value.toFixed(0) : value.toFixed(1));
  ctx.fillText(display, w - 4, compact ? 11 : 16);
}

/** Circular oscilloscope — waveform on a ring (deprecated, kept for reference) */
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

/** Heat hue from value intensity (cool → hot) */
function heatColor(value, max, baseHex) {
  const t = clamp(value / max, 0, 1);
  if (t > 0.72) return `hsl(${25 - t * 15}, 92%, ${48 + t * 12}%)`;
  if (t > 0.45) return `hsl(${45 + t * 30}, 85%, ${45 + t * 10}%)`;
  const { r, g, b } = hexToRgb(baseHex || '#5b8cff');
  return `rgba(${r},${g},${b},${0.35 + t * 0.55})`;
}

/** Thermal palette: purple (cool, bottom) → bright red (hot, top) */
function thermalSegmentColor(segmentIndex, totalSegments, filled = true) {
  const t = segmentIndex / Math.max(1, totalSegments - 1);
  const hue = 278 - t * 278;
  const sat = filled ? 78 + t * 18 : 30;
  const light = filled ? 38 + t * 22 : 18;
  const alpha = filled ? 1 : 0.1;
  return filled
    ? `hsl(${hue}, ${sat}%, ${light}%)`
    : `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
}

function thermalHeatColor(value, max) {
  const t = clamp(value / max, 0, 1);
  const hue = 278 - t * 278;
  return `hsl(${hue}, ${85 + t * 12}%, ${42 + t * 24}%)`;
}

/** Dense historical histogram — heat bars, min/max/avg, time axis, peak glow */
function drawBarMatrix(canvas, rows, tick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const padTop = opts.title ? 44 : 28;
  drawHudGrid(ctx, w, h, 16, 0.06);
  drawHudBrackets(ctx, w, h, 8);

  if (opts.title) {
    ctx.font = '600 22px Inter, sans-serif';
    ctx.fillStyle = '#8b9bb8';
    ctx.textAlign = 'left';
    ctx.fillText(opts.title, 14, 28);
  }

  const labelW = 128;
  const statsW = 200;
  const chartL = labelW + 8;
  const chartR = w - statsW - 8;
  const chartW = chartR - chartL;
  const rowH = (h - padTop - 24) / rows.length;

  // shared time axis (bottom)
  const maxCols = Math.max(...rows.map(r => r.values.length), 1);
  ctx.font = '11px Inter, sans-serif';
  ctx.fillStyle = 'rgba(139,155,184,0.45)';
  ctx.textAlign = 'center';
  for (let t = 0; t <= 4; t++) {
    const x = chartL + (t / 4) * chartW;
    const mins = Math.round((maxCols - 1) * (1 - t / 4));
    ctx.fillText(t === 4 ? 'now' : `-${mins}m`, x, h - 6);
  }

  rows.forEach((row, ri) => {
    const y0 = padTop + ri * rowH;
    const barArea = rowH - 14;
    const vals = row.values;
    const cols = vals.length;
    if (!cols) return;

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / cols;
    const now = vals[cols - 1];
    const peakIdx = vals.indexOf(max);

    // row band
    if (ri % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.015)';
      ctx.fillRect(0, y0, w, rowH);
    }
    ctx.strokeStyle = 'rgba(56,189,248,0.08)';
    ctx.beginPath(); ctx.moveTo(0, y0 + rowH); ctx.lineTo(w, y0 + rowH); ctx.stroke();

    // label + unit
    ctx.font = 'bold 15px Inter, sans-serif';
    ctx.fillStyle = row.color;
    ctx.textAlign = 'left';
    ctx.fillText(row.label, 10, y0 + 16);
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(row.unit || '', 10, y0 + 30);

    // horizontal grid in chart area
    for (let g = 0; g <= 3; g++) {
      const gy = y0 + 8 + (g / 3) * (barArea - 8);
      ctx.strokeStyle = 'rgba(56,189,248,0.06)';
      ctx.beginPath(); ctx.moveTo(chartL, gy); ctx.lineTo(chartR, gy); ctx.stroke();
    }

    const barW = Math.max(2, chartW / cols - 1);

    vals.forEach((v, ci) => {
      const pct = v / row.max;
      const bh = pct * (barArea - 10);
      const x = chartL + ci * (chartW / cols);
      const y = y0 + barArea - bh;
      const pulse = ci === cols - 1 ? 1 + Math.sin(tick / 6) * 0.04 : 1;
      const isPeak = ci === peakIdx && pct > 0.5;
      const isRecent = ci >= cols - 3;

      // heat fill + gradient
      const heat = row.thermal ? thermalHeatColor(v, row.max) : heatColor(v, row.max, row.color);
      const grad = ctx.createLinearGradient(x, y0 + barArea, x, y);
      if (row.thermal) {
        grad.addColorStop(0, thermalSegmentColor(0, 16));
        grad.addColorStop(0.55, thermalSegmentColor(9, 16));
        grad.addColorStop(1, heat);
      } else {
        grad.addColorStop(0, 'rgba(0,0,0,0.15)');
        grad.addColorStop(1, heat);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barW, bh * pulse);

      // cap highlight
      ctx.fillStyle = isPeak ? '#fff' : row.color;
      ctx.fillRect(x, y, barW, isPeak ? 4 : 2);

      // glow on peaks and live edge
      if (isPeak || (isRecent && pct > 0.55)) {
        ctx.shadowColor = row.color;
        ctx.shadowBlur = isPeak ? 14 : 6;
        ctx.fillStyle = heat;
        ctx.fillRect(x, y, barW, Math.min(8, bh));
        ctx.shadowBlur = 0;
      }

      // anomaly tick marks above bar
      if (pct > 0.75 && ci % 2 === 0) {
        ctx.fillStyle = 'rgba(248,113,113,0.7)';
        ctx.fillRect(x + barW / 2 - 1, y - 5, 2, 4);
      }
    });

    // scan line across history
    const scanCol = Math.floor(((tick * 0.04) % 1) * cols);
    const scanX = chartL + scanCol * (chartW / cols);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(scanX, y0 + 6, barW + 2, barArea - 6);

    // stats block
    const fmt = row.format || (v => v.toFixed(1));
    ctx.textAlign = 'right';
    ctx.font = 'bold 17px Inter, sans-serif';
    ctx.fillStyle = row.color;
    ctx.fillText(typeof row.readout === 'string' ? row.readout : fmt(now), w - 10, y0 + 16);
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = '#8b9bb8';
    const delta = now - avg;
    const deltaSign = delta >= 0 ? '▲' : '▼';
    ctx.fillText(`now ${fmt(now)}  ${deltaSign}${Math.abs(delta).toFixed(1)} vs avg`, w - 10, y0 + 30);
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`min ${fmt(min)} · max ${fmt(max)} · avg ${fmt(avg)}`, w - 10, y0 + 44);
  });
}

/** Perspective wireframe hologram terrain — stock HUD kit style (original canvas) */
function drawHologramLandscape(canvas, nodes, sim, tick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const cx = w * 0.5;
  const horizon = h * 0.38;
  const gridCols = opts.cols ?? 28;
  const gridRows = opts.rows ?? 22;
  const accent = opts.accent ?? '#38bdf8';
  const accent2 = opts.accent2 ?? '#5b8cff';
  const { r: ar, g: ag, b: ab } = hexToRgb(accent);
  const activity = opts.activity ?? 0.35;
  const samples = nodes.map((_, i) => sim.sample('holo', i));

  // projection: world (x,z) → screen; y = height
  function project(x, z, y) {
    const depth = z / gridRows;
    const persp = 0.55 + depth * 0.85;
    const sx = cx + (x - gridCols / 2) * (w / gridCols) * 0.92 * persp;
    const sy = horizon + z * (h * 0.52 / gridRows) * persp - y * persp * 1.8;
    return { x: sx, y: sy, depth, persp };
  }

  function heightAt(x, z) {
    const nx = x / gridCols;
    const nz = z / gridRows;
    let y =
      Math.sin(nx * 4.2 + tick * 0.025) * 8 +
      Math.cos(nz * 3.8 - tick * 0.018) * 7 +
      Math.sin((nx + nz) * 5 + tick * 0.012) * 5;

    nodes.forEach((n, i) => {
      const dx = x - n.gx;
      const dz = z - n.gz;
      const dist2 = dx * dx + dz * dz;
      const s = samples[i];
      const peak = (s.cpu / 100) * 42 + (s.eventStrength ?? 0) * 28;
      y += Math.exp(-dist2 / (opts.spread ?? 18)) * peak;
    });
    return y * (0.85 + activity * 0.35);
  }

  // sky glow + horizon line
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, `rgba(${ar},${ag},${ab},0.08)`);
  sky.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);
  ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.35)`;
  ctx.lineWidth = 2;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(w, horizon);
  ctx.stroke();
  ctx.shadowBlur = 0;

  drawHudBrackets(ctx, w, h, 10, `rgba(${ar},${ag},${ab},0.5)`);

  // build mesh points
  const mesh = [];
  for (let z = 0; z <= gridRows; z++) {
    mesh[z] = [];
    for (let x = 0; x <= gridCols; x++) {
      const y = heightAt(x, z);
      mesh[z][x] = project(x, z, y);
    }
  }

  // floor grid lines (longitudinal)
  for (let x = 0; x <= gridCols; x += 2) {
    ctx.beginPath();
    for (let z = 0; z <= gridRows; z++) {
      const p = mesh[z][x];
      if (z === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    const edge = mesh[gridRows][x];
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},${0.06 + edge.depth * 0.14})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // latitudinal lines
  for (let z = 0; z <= gridRows; z++) {
    ctx.beginPath();
    for (let x = 0; x <= gridCols; x++) {
      const p = mesh[z][x];
      if (x === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    const flicker = 0.92 + Math.sin(tick / 7 + z * 0.3) * 0.08;
    const alpha = (0.08 + (z / gridRows) * 0.22) * flicker;
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},${alpha})`;
    ctx.lineWidth = z % 4 === 0 ? 1.5 : 1;
    ctx.stroke();
  }

  // iso-height contour rings (topographic hologram lines)
  const contourLevels = [12, 20, 28, 36, 44];
  contourLevels.forEach((level, li) => {
    ctx.beginPath();
    let started = false;
    for (let z = 1; z < gridRows; z++) {
      for (let x = 1; x < gridCols; x++) {
        const h00 = heightAt(x, z);
        const h10 = heightAt(x + 1, z);
        const h01 = heightAt(x, z + 1);
        const h11 = heightAt(x + 1, z + 1);
        const crosses =
          (h00 < level && h10 >= level) || (h00 >= level && h10 < level) ||
          (h00 < level && h01 >= level) || (h00 >= level && h01 < level) ||
          (h10 < level && h11 >= level) || (h10 >= level && h11 < level) ||
          (h01 < level && h11 >= level) || (h01 >= level && h11 < level);
        if (crosses) {
          const p = mesh[z][x];
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
      }
    }
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},${0.12 + li * 0.06})`;
    ctx.lineWidth = li === contourLevels.length - 1 ? 1.5 : 1;
    ctx.setLineDash([3, 6]);
    ctx.lineDashOffset = tick * 0.2 + li * 4;
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // hologram base glow cone
  const cone = ctx.createRadialGradient(cx, horizon + h * 0.18, 0, cx, horizon + h * 0.18, w * 0.42);
  cone.addColorStop(0, `rgba(${ar},${ag},${ab},${0.14 + activity * 0.1})`);
  cone.addColorStop(0.55, `rgba(${ar},${ag},${ab},0.04)`);
  cone.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cone;
  ctx.fillRect(0, horizon, w, h - horizon);

  // filled terrain glow under peaks
  for (let z = 1; z < gridRows; z++) {
    for (let x = 1; x < gridCols; x++) {
      const y = heightAt(x, z);
      if (y > 14) {
        const p = mesh[z][x];
        const hot = y > 28;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + y * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = hot
          ? `rgba(251,191,36,${0.08 + y / 120})`
          : `rgba(${ar},${ag},${ab},${0.04 + y / 100})`;
        ctx.fill();
      }
    }
  }

  // node beacon pillars + labels
  nodes.forEach((n, i) => {
    const s = samples[i];
    const base = mesh[n.gz][n.gx];
    const top = project(n.gx, n.gz, heightAt(n.gx, n.gz) + 8);
    const hot = s.cpu > 55 || s.event;

    // vertical beam
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y - 20);
    ctx.strokeStyle = hot ? 'rgba(251,191,36,0.75)' : `rgba(${ar},${ag},${ab},0.65)`;
    ctx.lineWidth = 2;
    ctx.shadowColor = hot ? '#fbbf24' : accent;
    ctx.shadowBlur = hot ? 18 : 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // rings at peak
    for (let ri = 1; ri <= 3; ri++) {
      ctx.beginPath();
      ctx.ellipse(top.x, top.y - 18 - ri * 6, 8 + ri * 5, 3 + ri, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},${0.35 - ri * 0.08})`;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(top.x, top.y - 22, 6 + s.cpu * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = hot ? 'rgba(251,191,36,0.95)' : `rgba(${ar},${ag},${ab},0.9)`;
    ctx.shadowColor = hot ? '#fbbf24' : accent;
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillStyle = '#e8eef8';
    ctx.textAlign = 'center';
    ctx.fillText(n.name, top.x, top.y - 36);
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(`${fmtPct(s.cpu)} · ${fmtMb(s.net)}`, top.x, top.y - 18);
    if (s.event) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('▲ ' + s.event.slice(0, 20), top.x, top.y - 2);
    }

    // connector to side HUD (decorative)
    const side = i % 2 === 0 ? 24 : w - 24;
    ctx.setLineDash([4, 8]);
    ctx.lineDashOffset = -tick * 0.5;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y - 28);
    ctx.lineTo(side, top.y - 40 - i * 12);
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.2)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // horizontal scan sweep across terrain
  const scanZ = Math.floor(((tick * 0.065) % 1) * gridRows);
  ctx.beginPath();
  for (let x = 0; x <= gridCols; x++) {
    const p = mesh[scanZ][x];
    if (x === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = `rgba(255,255,255,${0.4 + activity * 0.35})`;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // comet trail on live scan edge
  const trailZ = Math.max(0, scanZ - 2);
  ctx.beginPath();
  for (let x = 0; x <= gridCols; x++) {
    const p = mesh[trailZ][x];
    if (x === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.25)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // hologram scanlines overlay
  for (let sy = horizon; sy < h; sy += 6) {
    ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.sin(tick / 9 + sy * 0.04) * 0.03})`;
    ctx.fillRect(0, sy, w, 2);
  }

  // title readout
  ctx.font = '600 20px Inter, sans-serif';
  ctx.fillStyle = 'rgba(139,155,184,0.65)';
  ctx.textAlign = 'left';
  ctx.fillText(opts.title || 'VIRTUAL HOLOGRAM · CLUSTER TOPOLOGY', 16, 28);

  ctx.textAlign = 'right';
  ctx.fillStyle = accent;
  ctx.fillText(`ACTIVITY ${Math.round(activity * 100)}%`, w - 16, 28);
}

/** Wave / vibration oscilloscope strip — HUD kit element */
function drawWaveVibration(canvas, series, tick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const color = opts.color ?? '#38bdf8';
  const { r, g, b } = hexToRgb(color);
  const pad = { l: 8, r: 8, t: 22, b: 8 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const midY = pad.t + plotH / 2;

  drawHudBrackets(ctx, w, h, 6, `rgba(${r},${g},${b},0.35)`);

  ctx.font = '600 16px Inter, sans-serif';
  ctx.fillStyle = '#8b9bb8';
  ctx.textAlign = 'left';
  ctx.fillText(opts.title || 'VIBRATION', pad.l, 16);

  ctx.strokeStyle = `rgba(${r},${g},${b},0.15)`;
  ctx.beginPath();
  ctx.moveTo(pad.l, midY);
  ctx.lineTo(w - pad.r, midY);
  ctx.stroke();

  const len = series.length;
  if (len < 2) return;
  const maxV = opts.max ?? 100;

  // mirrored waveform fill
  ctx.beginPath();
  series.forEach((v, i) => {
    const x = pad.l + (i / (len - 1)) * plotW;
    const amp = (v / maxV) * plotH * 0.42 * (1 + Math.sin(tick / 6 + i * 0.15) * 0.08);
    if (i === 0) ctx.moveTo(x, midY);
    else ctx.lineTo(x, midY - amp);
  });
  for (let i = len - 1; i >= 0; i--) {
    const x = pad.l + (i / (len - 1)) * plotW;
    const amp = (series[i] / maxV) * plotH * 0.42 * 0.65;
    ctx.lineTo(x, midY + amp);
  }
  ctx.closePath();
  const wg = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
  wg.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
  wg.addColorStop(1, `rgba(${r},${g},${b},0.04)`);
  ctx.fillStyle = wg;
  ctx.fill();

  // secondary harmonic trace
  ctx.beginPath();
  series.forEach((v, i) => {
    const x = pad.l + (i / (len - 1)) * plotW;
    const amp = (v / maxV) * plotH * 0.22;
    const y = midY - amp * Math.sin(tick / 4 + i * 0.35);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = `rgba(${r},${g},${b},0.35)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  series.forEach((v, i) => {
    const x = pad.l + (i / (len - 1)) * plotW;
    const amp = (v / maxV) * plotH * 0.42;
    if (i === 0) ctx.moveTo(x, midY - amp);
    else ctx.lineTo(x, midY - amp);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // amplitude bars along bottom
  const bars = Math.min(len, 32);
  const slice = series.slice(-bars);
  const bw = plotW / bars;
  slice.forEach((v, i) => {
    const bh = (v / maxV) * 10;
    ctx.fillStyle = heatColor(v, maxV, color);
    ctx.fillRect(pad.l + i * bw, h - pad.b - bh, Math.max(1, bw - 1), bh);
  });

  const scanX = pad.l + ((tick * 0.05) % 1) * plotW;
  ctx.fillStyle = `rgba(${r},${g},${b},0.15)`;
  ctx.fillRect(scanX - 12, pad.t, 24, plotH);
}

/** Vertical level indicator column — HUD kit element */
function drawLevelIndicator(canvas, value, max, tick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const color = opts.color ?? '#38bdf8';
  const { r, g, b } = hexToRgb(color);
  const pct = clamp(value / max, 0, 1);
  const segments = opts.segments ?? 28;
  const padT = 24;
  const padB = 22;
  const barW = Math.max(36, Math.min(w * 0.78, w - 16));
  const bx = (w - barW) / 2;
  const by = padT;
  const trackH = h - padT - padB;
  const segH = trackH / segments;

  drawHudBrackets(ctx, w, h, 6, `rgba(${r},${g},${b},0.35)`);

  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillStyle = '#8b9bb8';
  ctx.textAlign = 'center';
  ctx.fillText(opts.label || 'LEVEL', w / 2, 16);

  const thermal = opts.thermal;
  for (let i = 0; i < segments; i++) {
    const filled = i / segments < pct;
    const pulse = filled && i >= segments - 3 ? 1 + Math.sin(tick / 5 + i) * 0.12 : 1;
    const y = by + (segments - 1 - i) * segH;
    ctx.fillStyle = thermal
      ? thermalSegmentColor(i, segments, filled)
      : filled
        ? `rgba(${r},${g},${b},${0.5 + (i / segments) * 0.45})`
        : 'rgba(255,255,255,0.06)';
    ctx.fillRect(bx, y, barW * pulse, Math.max(1, segH - 1));
    if (filled) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx, y, barW * pulse, 2);
    }
  }

  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.fillStyle = thermal ? thermalHeatColor(value, max) : color;
  ctx.fillText(opts.format ? opts.format(value) : value.toFixed(0), w / 2, h - 6);
}

/** Connected multi-column level bank — fills tile width, no gaps between columns */
function drawLevelBank(canvas, cells, tick, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const n = cells.length;
  if (!n) return;
  const padT = opts.title ? 28 : 22;
  const padB = 20;
  const colW = w / n;
  const segments = opts.segments ?? 32;
  const trackH = h - padT - padB;
  const segH = trackH / segments;

  drawHudBrackets(ctx, w, h, 8);

  if (opts.title) {
    ctx.font = '600 14px Inter, sans-serif';
    ctx.fillStyle = '#8b9bb8';
    ctx.textAlign = 'left';
    ctx.fillText(opts.title, 10, 18);
  }

  cells.forEach((cell, ci) => {
    const x0 = ci * colW;
    const pct = clamp(cell.value / cell.max, 0, 1);
    const thermal = cell.thermal || opts.thermal;
    const { r, g, b } = hexToRgb(cell.color);
    const barW = colW;
    const bx = x0;

    if (ci > 0) {
      ctx.strokeStyle = 'rgba(56,189,248,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, padT - 4);
      ctx.lineTo(x0, h - padB + 4);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(bx, padT, barW, trackH);

    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = thermal ? thermalHeatColor(cell.value, cell.max) : cell.color;
    ctx.textAlign = 'center';
    ctx.fillText(cell.label, x0 + colW / 2, padT - 6);

    for (let i = 0; i < segments; i++) {
      const filled = i / segments < pct;
      const pulse = filled && i >= segments - 2 ? 1 + Math.sin(tick / 5 + ci + i) * 0.1 : 1;
      const y = padT + (segments - 1 - i) * segH;
      ctx.fillStyle = thermal
        ? thermalSegmentColor(i, segments, filled)
        : filled
          ? `rgba(${r},${g},${b},${0.55 + (i / segments) * 0.4})`
          : 'rgba(255,255,255,0.05)';
      ctx.fillRect(bx, y, barW * pulse, Math.max(1, segH - 1));
    }

    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillStyle = thermal ? thermalHeatColor(cell.value, cell.max) : cell.color;
    ctx.textAlign = 'center';
    ctx.fillText(
      cell.format ? cell.format(cell.value) : cell.value.toFixed(0),
      x0 + colW / 2,
      h - 6,
    );
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
    sim.advance(2);
    const agg = sim.clusterAggregate();
    const activity = Math.min(1, (agg.cpu / 80 + agg.net / 900 + agg.disk / 15000) / 2);

    (config.gauges || []).forEach(g => {
      const v = getVal(g.metric, g.node);
      drawRadialGauge(g.el, v, g.max ?? 100, g.label, g.unit, g.color, tick, g.opts || {});
      if (g.valueEl) g.valueEl.textContent = g.opts?.format ? g.opts.format(v) : fmtPct(v);
    });

    (config.radars || []).forEach(r => drawRadarScope(r.el, r.nodes, sim, tick));
    (config.hexMaps || []).forEach(h => drawHexTopology(h.el, h.nodes, sim, tick));
    (config.globes || []).forEach(g => drawWireframeGlobe(g.el, g.nodes, sim, tick));

    (config.areaCharts || []).forEach(ac => {
      const key = ac.key;
      if (!series[key]) series[key] = [];
      pushSeries(series[key], getVal(ac.metric, ac.node), ac.len ?? 72);
      drawAnimatedAreaChart(ac.el, series[key], ac.color, tick, ac.max ?? 100, ac.opts || {});
    });

    (config.lineCharts || []).forEach(lc => {
      const channels = lc.channels.map(ch => {
        const key = ch.key;
        if (!series[key]) series[key] = [];
        pushSeries(series[key], getVal(ch.metric, ch.node), lc.len ?? 64);
        return { series: series[key], color: ch.color, label: ch.label, max: ch.max ?? 100, format: ch.format };
      });
      drawMultiLineChart(lc.el, channels, tick, lc.opts || {});
    });

    (config.stackedAreas || []).forEach(sa => {
      const channels = sa.channels.map(ch => {
        const key = ch.key;
        if (!series[key]) series[key] = [];
        pushSeries(series[key], getVal(ch.metric, ch.node), sa.len ?? 64);
        return { series: series[key], color: ch.color, label: ch.label, max: ch.max ?? 100 };
      });
      drawStackedAreaChart(sa.el, channels, tick, sa.opts || {});
    });

    (config.columnCharts || []).forEach(cc => {
      const bars = cc.bars.map(b => ({
        label: b.label,
        value: getVal(b.metric, b.node),
        max: b.max ?? 100,
        color: b.color,
        format: b.format,
      }));
      drawColumnChart(cc.el, bars, tick, cc.opts || {});
    });

    (config.donuts || []).forEach(d => {
      const segments = d.segments.map(seg => ({
        label: seg.label,
        value: getVal(seg.metric, seg.node),
        color: seg.color,
        format: seg.format,
      }));
      drawDonutChart(d.el, segments, tick, d.opts || {});
    });

    (config.meterBanks || []).forEach(mb => {
      const meters = mb.meters.map(m => ({
        label: m.label,
        value: getVal(m.metric, m.node),
        max: m.max ?? 100,
        color: m.color,
        format: m.format,
      }));
      drawMeterBank(mb.el, meters, tick);
    });

    (config.sparklineGrids || []).forEach(sg => {
      const cells = sg.cells.map(c => {
        const key = c.key;
        if (!series[key]) series[key] = [];
        const v = getVal(c.metric, c.node);
        pushSeries(series[key], v, c.len ?? 32);
        return { label: c.label, series: [...series[key]], color: c.color, max: c.max ?? 100, readout: c.format ? c.format(v) : v.toFixed(0) };
      });
      drawSparklineGrid(sg.el, cells, tick);
    });

    (config.linearGauges || []).forEach(lg => {
      drawLinearGauge(lg.el, getVal(lg.metric, lg.node), lg.max ?? 100, lg.label, lg.color, tick);
    });

    (config.barMatrices || []).forEach(bm => {
      const rows = bm.rows.map(row => ({
        label: row.label,
        color: row.color,
        max: row.max,
        readout: row.readout(sim),
        values: row.nodes.map(i => sim.sample('bar', i)[row.field]),
      }));
      drawBarMatrix(bm.el, rows, tick, bm.opts || {});
    });

    (config.hologramLandscapes || []).forEach(hl => {
      drawHologramLandscape(hl.el, hl.nodes, sim, tick, { ...hl.opts, activity });
    });

    (config.waveVibrations || []).forEach(wv => {
      const key = wv.key;
      if (!series[key]) series[key] = [];
      const v = getVal(wv.metric, wv.node);
      pushSeries(series[key], v, wv.len ?? 64);
      drawWaveVibration(wv.el, series[key], tick, { ...wv.opts, max: wv.max ?? 100 });
    });

    (config.levelIndicators || []).forEach(li => {
      drawLevelIndicator(li.el, getVal(li.metric, li.node), li.max ?? 100, tick, {
        label: li.label,
        color: li.color,
        format: li.format,
        segments: li.segments,
        thermal: li.thermal,
      });
    });

    (config.levelBanks || []).forEach(lb => {
      const cells = lb.cells.map(c => ({
        label: c.label,
        value: getVal(c.metric, c.node),
        max: c.max ?? 100,
        color: c.color,
        format: c.format,
        thermal: c.thermal,
      }));
      drawLevelBank(lb.el, cells, tick, { ...lb.opts, thermal: lb.thermal });
    });

    if (config.onTick) config.onTick(tick, agg, sim, activity);
    requestAnimationFrame(frame);
  }
  frame();
  return sim;
}
