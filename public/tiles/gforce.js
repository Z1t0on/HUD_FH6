/**
 * Tuile G-Force : accéléromètre 2D avec rémanence.
 *
 * Le dessin est exposé (`drawGForce`) car la carte 3D le pilote aussi pendant
 * l'analyse d'une session, à partir des échantillons de l'archive.
 */

import { bus } from "../core/bus.js";
import { G_HISTORY_SECONDS, G_SCALE } from "../core/constants.js";
import { state } from "../core/state.js";
import { clamp, sizeCanvas } from "../core/utils.js";

const TIRE_COLORS = {
  ideal: "#2ee6a8",
  hot: "#ffb020",
  overheat: "#ff3b3b",
};

const HTML = `
  <header class="panel-head">
    <span class="panel-title">G-Force</span>
    <span class="gforce-readout">0.00 g</span>
  </header>
  <div class="gforce-wrap">
    <canvas id="gforce"></canvas>
  </div>
`;

let canvasEl = null;
let context = null;
let readoutEl = null;

/** Historique des accélérations latérales et longitudinales (2,2 s). */
const gHistory = [];

export function drawGForce(current, trail) {
  if (!context) return;
  const { width, height } = sizeCanvas(canvasEl, context);
  /* Tuile masquée ou sur l'autre espace : le canevas mesure 0×0, rien à
     dessiner (sinon le rayon du cadran devient négatif). */
  if (width < 16 || height < 16) return;
  const ctx = context;
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 8;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();
  ctx.restore();

  if (!current) return;

  for (const segment of trail) {
    if (segment.alpha <= 0) continue;
    ctx.strokeStyle = `rgba(0, 229, 255, ${segment.alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(
      cx + (segment.from.gx / G_SCALE) * radius,
      cy - (segment.from.gz / G_SCALE) * radius,
    );
    ctx.lineTo(cx + (segment.to.gx / G_SCALE) * radius, cy - (segment.to.gz / G_SCALE) * radius);
    ctx.stroke();
  }

  const magnitude = Math.hypot(current.gx, current.gz);
  const dotX = cx + clamp(current.gx / G_SCALE, -1, 1) * radius;
  const dotY = cy - clamp(current.gz / G_SCALE, -1, 1) * radius;

  ctx.save();
  ctx.shadowColor = magnitude > 1.8 ? TIRE_COLORS.overheat : TIRE_COLORS.ideal;
  ctx.shadowBlur = 12;
  ctx.fillStyle = magnitude > 1.8 ? TIRE_COLORS.overheat : TIRE_COLORS.ideal;
  ctx.beginPath();
  ctx.arc(dotX, dotY, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  readoutEl.textContent = `${magnitude.toFixed(2)} g`;
  readoutEl.style.color =
    magnitude > 1.8 ? TIRE_COLORS.overheat : magnitude > 1.2 ? TIRE_COLORS.hot : "#7f8ea3";
}

/** Rémanence du direct, calculée depuis l'historique glissant. */
export function liveGForceTrail() {
  const now = performance.now();
  const trail = [];
  for (let i = 1; i < gHistory.length; i += 1) {
    const previous = gHistory[i - 1];
    const point = gHistory[i];
    if (!previous || !point) continue;
    const alpha = clamp(1 - (now - point.t) / (G_HISTORY_SECONDS * 1000), 0, 1) * 0.65;
    if (alpha > 0) trail.push({ from: previous, to: point, alpha });
  }
  return trail;
}

export function liveGForceCurrent() {
  if (!state.latest) return null;
  return { gx: state.latest.acceleration.x / 9.81, gz: state.latest.acceleration.z / 9.81 };
}

function pushHistory(telemetry) {
  const gx = telemetry.acceleration.x / 9.81;
  const gz = telemetry.acceleration.z / 9.81;
  const now = performance.now();
  gHistory.push({ gx, gz, t: now });
  const cutoff = now - G_HISTORY_SECONDS * 1000;
  while (gHistory.length > 0 && gHistory[0].t < cutoff) gHistory.shift();
}

export const gforceTile = {
  id: "gforce",
  labelKey: "panels.gforce",
  placement: { page: 1, x: 0.76, y: 0.695, w: 0.24, h: 0.305 },

  mount(panel) {
    panel.insertAdjacentHTML("beforeend", HTML);
    canvasEl = panel.querySelector("canvas");
    context = canvasEl.getContext("2d");
    readoutEl = panel.querySelector(".gforce-readout");
    drawGForce(null, []);
    bus.on("telemetry:display", (telemetry) => {
      drawGForce(
        { gx: telemetry.acceleration.x / 9.81, gz: telemetry.acceleration.z / 9.81 },
        [],
      );
    });
  },

  update(telemetry) {
    if (state.mode !== "live") return;
    pushHistory(telemetry);
  },
};
