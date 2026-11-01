/**
 * Tuile Compteur : compte-tours, rapport, vitesse et style digital/analogique.
 */

import { bus } from "../core/bus.js";
import { ARC_CIRCUMFERENCE, SHIFT_THRESHOLD } from "../core/constants.js";
import { gearLabel } from "../core/format.js";
import { uiLocale } from "../core/i18n.js";
import { state } from "../core/state.js";
import { themeState } from "../core/theme.js";
import {
  convertSecondarySpeed,
  convertSpeed,
  isImperial,
  secondarySpeedUnit,
  speedUnit,
} from "../core/units.js";
import { clamp } from "../core/utils.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const HTML = `
  <div class="cluster" data-gauge="digital">
    <div class="shift-lights" aria-hidden="true"></div>

    <div class="rpm-arc">
      <svg viewBox="0 0 240 240" role="img" aria-label="Compte-tours">
        <defs>
          <linearGradient id="rpmGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#00e5ff" />
            <stop offset="55%" stop-color="#38d0ff" />
            <stop offset="78%" stop-color="#ffb020" />
            <stop offset="100%" stop-color="#ff3b3b" />
          </linearGradient>
          <filter id="rpmGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle class="arc-track" cx="120" cy="120" r="100" />
        <circle class="arc-fill" cx="120" cy="120" r="100" filter="url(#rpmGlow)" />
        <circle class="arc-cap" cx="120" cy="20" r="4" />
      </svg>

      <div class="cluster-center">
        <div class="gear">N</div>
        <div class="speed-block">
          <span class="speed-value">0</span>
          <span class="speed-unit">KM/H</span>
        </div>
        <span class="speed-mph">
          <b class="speed-secondary">0</b>
          <span class="speed-secondary-unit">MPH</span>
        </span>
      </div>
    </div>

    <div class="analog">
      <svg viewBox="0 0 240 240" role="img" aria-label="Compteur analogique">
        <g class="analog-ticks"></g>
        <g class="analog-labels"></g>
        <line class="analog-needle" x1="120" y1="120" x2="120" y2="46" />
        <circle class="analog-hub" cx="120" cy="120" r="9" />
      </svg>
      <div class="analog-center">
        <span class="analog-speed">0</span>
        <span class="analog-unit">KM/H</span>
        <span class="analog-gear">N</span>
      </div>
    </div>

    <div class="rpm-readout">
      <span class="rpm-value">0</span><small data-i18n="unit.rpm-short"> tr/min</small>
    </div>
  </div>
`;

const shiftLightEls = [];
let els = null;

/** Échelle du compteur analogique : maximum et pas des graduations majeures. */
function analogScale() {
  return isImperial() ? { max: 280, major: 40 } : { max: 420, major: 60 };
}

function analogMaxSpeed() {
  return analogScale().max;
}

function analogAngle(ratio) {
  return (-120 + clamp(ratio, 0, 1) * 240) * (Math.PI / 180);
}

function buildAnalogScale() {
  const { max, major } = analogScale();
  const minor = major / 4;
  els.ticks.replaceChildren();
  els.labels.replaceChildren();

  for (let value = 0; value <= max + 0.001; value += minor) {
    const isMajor = Math.abs(value % major) < 0.001;
    const angle = analogAngle(value / max);
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const outer = 96;
    const inner = isMajor ? 82 : 89;

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", (120 + sin * inner).toFixed(2));
    line.setAttribute("y1", (120 - cos * inner).toFixed(2));
    line.setAttribute("x2", (120 + sin * outer).toFixed(2));
    line.setAttribute("y2", (120 - cos * outer).toFixed(2));
    if (isMajor) line.setAttribute("class", "major");
    els.ticks.appendChild(line);

    if (isMajor) {
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("x", (120 + sin * 70).toFixed(2));
      text.setAttribute("y", (120 - cos * 70 + 4).toFixed(2));
      text.textContent = String(Math.round(value));
      els.labels.appendChild(text);
    }
  }
}

function updateUnits() {
  if (!els) return;
  els.speedUnit.textContent = speedUnit();
  els.secondaryUnit.textContent = secondarySpeedUnit();
  els.analogUnit.textContent = speedUnit();
  buildAnalogScale();
}

/** Applique le style de compteur choisi (digital ou aiguille). */
function applyGaugeStyle() {
  if (!els) return;
  els.cluster.dataset.gauge = themeState.gauge;
  els.analogUnit.textContent = speedUnit();
  const telemetry = state.lastTelemetry;
  const speed = telemetry
    ? Math.max(0, Math.round(convertSpeed(state.smoothed.speed || telemetry.speed)))
    : 0;
  const ratio = clamp(speed / analogMaxSpeed(), 0, 1);
  els.needle.style.transform = `rotate(${-120 + ratio * 240}deg)`;
  els.analogSpeed.textContent = String(speed);
  els.analogGear.textContent = telemetry ? gearLabel(telemetry.gear) : "N";
}

function render(telemetry) {
  if (!els || !telemetry) return;

  if (!state.smoothed.initialized) {
    state.smoothed.speed = telemetry.speed;
    state.smoothed.initialized = true;
  } else {
    state.smoothed.speed += (telemetry.speed - state.smoothed.speed) * 0.22;
  }

  const speedPrimary = Math.max(0, Math.round(convertSpeed(state.smoothed.speed)));
  const speedSecondary = Math.max(0, Math.round(convertSecondarySpeed(state.smoothed.speed)));
  els.speed.textContent = String(speedPrimary);
  els.secondary.textContent = String(speedSecondary);
  els.gear.textContent = gearLabel(telemetry.gear);

  if (themeState.gauge === "analog") {
    const ratio = speedPrimary / analogMaxSpeed();
    els.needle.style.transform = `rotate(${-120 + clamp(ratio, 0, 1) * 240}deg)`;
    els.analogSpeed.textContent = String(speedPrimary);
    els.analogGear.textContent = gearLabel(telemetry.gear);
  }

  const maxRpm = telemetry.engineMaxRpm > 1000 ? telemetry.engineMaxRpm : 8000;
  const ratio = clamp(telemetry.rpm / maxRpm, 0, 1);
  els.arc.style.strokeDashoffset = String(ARC_CIRCUMFERENCE * (1 - ratio));

  const angle = ratio * Math.PI * 2;
  els.cap.setAttribute("cx", String(120 + Math.cos(angle) * 100));
  els.cap.setAttribute("cy", String(120 + Math.sin(angle) * 100));
  els.cap.style.opacity = ratio > 0.01 ? "1" : "0";

  const litCount = Math.round(ratio * shiftLightEls.length);
  for (let i = 0; i < shiftLightEls.length; i += 1) {
    shiftLightEls[i].classList.toggle("on", i < litCount);
  }
  els.cluster.classList.toggle("shift-active", ratio >= SHIFT_THRESHOLD);

  els.rpm.textContent = Math.round(telemetry.rpm).toLocaleString(uiLocale());
}

function refresh() {
  applyGaugeStyle();
  render(state.lastTelemetry);
}

export const clusterTile = {
  id: "cluster",
  labelKey: "panels.cluster",
  placement: { page: 1, x: 0, y: 0.318, w: 0.235, h: 0.682 },

  mount(panel) {
    panel.insertAdjacentHTML("beforeend", HTML);
    els = {
      cluster: panel.querySelector(".cluster"),
      speed: panel.querySelector(".speed-value"),
      speedUnit: panel.querySelector(".speed-unit"),
      secondary: panel.querySelector(".speed-secondary"),
      secondaryUnit: panel.querySelector(".speed-secondary-unit"),
      gear: panel.querySelector(".gear"),
      arc: panel.querySelector(".arc-fill"),
      cap: panel.querySelector(".arc-cap"),
      rpm: panel.querySelector(".rpm-value"),
      ticks: panel.querySelector(".analog-ticks"),
      labels: panel.querySelector(".analog-labels"),
      needle: panel.querySelector(".analog-needle"),
      analogSpeed: panel.querySelector(".analog-speed"),
      analogGear: panel.querySelector(".analog-gear"),
      analogUnit: panel.querySelector(".analog-unit"),
    };

    const lights = panel.querySelector(".shift-lights");
    shiftLightEls.length = 0;
    for (let i = 0; i < 10; i += 1) {
      const light = document.createElement("span");
      lights.appendChild(light);
      shiftLightEls.push(light);
    }

    updateUnits();
    applyGaugeStyle();
    bus.on("language:changed", refresh);
    bus.on("units:changed", () => {
      updateUnits();
      refresh();
    });
    bus.on("theme:changed", applyGaugeStyle);
    bus.on("telemetry:display", render);
  },

  update(telemetry) {
    if (state.mode === "live") render(telemetry);
  },
};
