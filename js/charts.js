/* OpenPlate — charts.js : tiny dependency-free canvas charts */
'use strict';

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(100, rect.width), h = Math.max(60, rect.height);
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function css(varName, el) {
  return getComputedStyle(el || document.documentElement).getPropertyValue(varName).trim() || '#2E7D3C';
}

/** cumulative line chart: points = [{x:label, y}] */
export function lineChart(canvas, points, { color } = {}) {
  const { ctx, w, h } = setup(canvas);
  if (!points.length) return;
  const padL = 8, padR = 8, padT = 10, padB = 18;
  const max = Math.max(...points.map((p) => p.y), 1);
  const x = (i) => padL + (i / Math.max(1, points.length - 1)) * (w - padL - padR);
  const y = (v) => padT + (1 - v / max) * (h - padT - padB);
  const stroke = color || css('--green', canvas);
  // area fill
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, stroke + '55');
  grad.addColorStop(1, stroke + '00');
  ctx.beginPath();
  ctx.moveTo(x(0), y(points[0].y));
  points.forEach((p, i) => ctx.lineTo(x(i), y(p.y)));
  ctx.lineTo(x(points.length - 1), h - padB);
  ctx.lineTo(x(0), h - padB);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  // line
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.y)) : ctx.moveTo(x(i), y(p.y))));
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // end dot
  const last = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(x(points.length - 1), y(last.y), 4, 0, Math.PI * 2);
  ctx.fillStyle = stroke;
  ctx.fill();
  // x labels (first / mid / last)
  ctx.fillStyle = css('--muted', canvas);
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(points[0].x, padL, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText(last.x, w - padR, h - 4);
}

/** bar chart: bars = [{x:label, y}] */
export function barChart(canvas, bars, { color } = {}) {
  const { ctx, w, h } = setup(canvas);
  if (!bars.length) return;
  const padL = 8, padR = 8, padT = 10, padB = 18;
  const max = Math.max(...bars.map((b) => b.y), 1);
  const bw = (w - padL - padR) / bars.length;
  const stroke = color || css('--green', canvas);
  bars.forEach((b, i) => {
    const bh = (b.y / max) * (h - padT - padB);
    const x = padL + i * bw + bw * 0.15;
    ctx.beginPath();
    const r = Math.min(4, bw * 0.35);
    const bx = x, by = h - padB - bh, bwd = bw * 0.7, bht = bh;
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bwd, by, bx + bwd, by + r, r);
    ctx.lineTo(bx + bwd, by + bht);
    ctx.lineTo(bx, by + bht);
    ctx.lineTo(bx, by + r);
    ctx.arcTo(bx, by, bx + r, by, r);
    ctx.closePath();
    ctx.fillStyle = stroke + (b.hot ? 'ff' : 'cc');
    ctx.fill();
  });
  ctx.fillStyle = css('--muted', canvas);
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const step = Math.ceil(bars.length / 6);
  bars.forEach((b, i) => { if (i % step === 0) ctx.fillText(b.x, padL + i * bw + bw / 2, h - 4); });
}
