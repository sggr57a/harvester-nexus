/* Animated Netdata-style chart helpers for mockups */
function lerp(a, b, t) { return a + (b - a) * t; }

function genSeries(len, base, amp, seed, noise = 0.08) {
  const out = [];
  for (let i = 0; i < len; i++) {
    const wave = Math.sin((i + seed) / 3.2) * amp + Math.sin((i + seed) / 7.1) * (amp * 0.4);
    const n = (Math.random() - 0.5) * noise * base;
    out.push(Math.max(0, Math.min(100, base + wave + n)));
  }
  return out;
}

function drawRibbon(canvas, series, color) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(52, 211, 153, 0.05)');
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, 'rgba(248, 113, 113, 0.3)');
  ctx.fillStyle = grad;
  const barW = w / series.length;
  series.forEach((v, i) => {
    const bh = (v / 100) * h * 0.9;
    ctx.fillRect(i * barW, h - bh, barW - 1, bh);
  });
}

function drawScope(canvas, channels, tick) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * 2;
  const h = canvas.height = canvas.offsetHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const pad = 40;
  const plotW = w - pad * 2;
  const plotH = h - pad;

  // grid
  ctx.strokeStyle = 'rgba(91, 140, 255, 0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 16; i++) {
    const x = pad + (i / 16) * plotW;
    ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, h - 8); ctx.stroke();
  }
  for (let j = 0; j <= 8; j++) {
    const y = 8 + (j / 8) * plotH;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
  }

  channels.forEach((ch, ci) => {
    const len = ch.series.length;
    const points = ch.series.map((v, i) => ({
      x: pad + (i / (len - 1)) * plotW,
      y: 8 + plotH - (v / 100) * plotH,
    }));

    // fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, 8 + plotH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, 8 + plotH);
    ctx.closePath();
    const fg = ctx.createLinearGradient(0, 0, 0, h);
    fg.addColorStop(0, ch.color.replace(')', ', 0.35)').replace('rgb', 'rgba'));
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.fill();

    // line
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = ch.color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  });

  // sweep cursor
  const sweepX = pad + ((tick * 0.04) % 1) * plotW;
  ctx.strokeStyle = 'rgba(91, 140, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sweepX, 8);
  ctx.lineTo(sweepX, h - 8);
  ctx.stroke();
}

function initMockCharts(config) {
  let tick = 0;
  const ribbons = config.ribbons || [];
  const scopes = config.scopes || [];

  const series = {};
  scopes.forEach((s, si) => {
    s.channels.forEach((ch, ci) => {
      const key = `${si}-${ci}`;
      series[key] = genSeries(48, ch.base, ch.amp, tick + ci * 3);
    });
  });

  function frame() {
    tick += 1;
    ribbons.forEach(r => {
      r.data = genSeries(64, 35 + Math.sin(tick / 20) * 15, 25, tick, 0.12);
      drawRibbon(r.el, r.data, r.color || 'rgba(52, 211, 153, 0.6)');
    });
    scopes.forEach((s, si) => {
      const channels = s.channels.map((ch, ci) => {
        const key = `${si}-${ci}`;
        const prev = series[key];
        const next = prev.map((v, i) => {
          const target = genSeries(48, ch.base, ch.amp, tick + i)[i];
          return lerp(v, target, 0.08);
        });
        series[key] = next;
        return { series: next, color: ch.color };
      });
      drawScope(s.el, channels, tick);
    });
    requestAnimationFrame(frame);
  }
  frame();
}

function buildHeatmap(container, rows, cols) {
  container.innerHTML = '';
  const label = document.createElement('div');
  label.textContent = '';
  container.appendChild(label);
  for (let c = 0; c < cols; c++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const v = 20 + Math.random() * 70;
    const hue = 220 - v * 1.2;
    cell.style.background = `hsla(${hue}, 70%, 45%, ${0.35 + v / 150})`;
    cell.style.animationDelay = `${(c + Math.random() * 5) * 0.05}s`;
    container.appendChild(cell);
  }
}

function initHeatmapRows(container, rowLabels) {
  container.innerHTML = '';
  rowLabels.forEach(label => {
    const row = document.createElement('div');
    row.style.display = 'contents';
    const name = document.createElement('div');
    name.textContent = label;
    name.style.fontSize = '0.62rem';
    name.style.color = '#8b9bb8';
    name.style.alignSelf = 'center';
    container.appendChild(name);
    for (let c = 0; c < 24; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const v = 15 + Math.random() * 75;
      cell.style.background = `hsla(${220 - v}, 65%, 42%, ${0.4 + v / 200})`;
      container.appendChild(cell);
    }
  });
}

function setupPillars(container, nodes) {
  container.innerHTML = '<div class="terrain-floor"><div class="terrain-grid"></div></div>';
  const floor = container.querySelector('.terrain-floor');
  nodes.forEach((n, i) => {
    const el = document.createElement('div');
    el.className = 'pillar';
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.style.setProperty('--pillar-top', n.colorTop);
    el.style.setProperty('--pillar-base', n.colorBase);
    el.style.setProperty('--pillar-glow', n.glow);
    el.style.animationDelay = `${i * 0.2}s`;
    const h = 40 + n.load * 1.2;
    el.innerHTML = `<div class="pillar-label">${n.name}<br>${n.load}% CPU</div><div class="pillar-bar" style="height:${h}px"></div>`;
    floor.appendChild(el);
  });
}
