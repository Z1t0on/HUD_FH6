/**
 * Tuile Inspecteur : détail complet du point affiché.
 *
 * Elle suit le paquet direct et, pendant l'analyse d'une archive, l'échantillon
 * sélectionné sur le tracé. C'est la tuile d'accueil du second espace.
 */

import { bus } from "../core/bus.js";
import { formatClock, formatLap, gearLabel, tireState } from "../core/format.js";
import { t, uiLocale } from "../core/i18n.js";
import { state } from "../core/state.js";
import { convertLength, convertSpeed, formatTemperature, lengthUnit, speedUnit } from "../core/units.js";

const CORNERS = [
  ["frontLeft", "tire.fl", "AVG"],
  ["frontRight", "tire.fr", "AVD"],
  ["rearLeft", "tire.rl", "ARG"],
  ["rearRight", "tire.rr", "ARD"],
];

const HTML = `
  <header class="inspector-head">
    <span class="inspector-lap">TOUR —</span>
    <span class="inspector-laptime">—</span>
  </header>

  <div class="inspector-main">
    <div class="inspector-speed">
      <b class="inspector-speed-value">0</b><span class="inspector-speed-unit">KM/H</span>
    </div>
    <div class="inspector-cell">
      <b class="inspector-gear">—</b><span data-i18n="inspector.gear">RAPPORT</span>
    </div>
    <div class="inspector-cell">
      <b class="inspector-rpm">0</b><span data-i18n="inspector.rpm">TR/MIN</span>
    </div>
  </div>

  <div class="inspector-pedals">
    <span><span data-i18n="pedals.throttle">ACC</span> <b class="inspector-throttle">0%</b></span>
    <span><span data-i18n="pedals.brake">FR</span> <b class="inspector-brake">0%</b></span>
    <span><span data-i18n="pedals.clutch">EMB</span> <b class="inspector-clutch">0%</b></span>
    <span><span data-i18n="inspector.steer">DIR</span> <b class="inspector-steer">0%</b></span>
  </div>

  <div class="inspector-tires">
    ${CORNERS.map(
      ([key, label, fallback]) => `
      <span data-corner="${key}" data-state="cold">
        <span data-i18n="${label}">${fallback}</span> <b>—</b><i data-i18n="tires.pressure-none">Pression n/d</i>
      </span>`,
    ).join("")}
  </div>

  <div class="inspector-meta">
    <span><span data-i18n="inspector.g-lat">G lat</span> <b class="inspector-gx">0.00</b></span>
    <span><span data-i18n="inspector.g-long">G long</span> <b class="inspector-gz">0.00</b></span>
    <span>ALT <b class="inspector-alt">—</b><i class="unit inspector-alt-unit">m</i></span>
    <span>X <b class="inspector-x">—</b><i class="unit inspector-x-unit">m</i></span>
    <span>Z <b class="inspector-z">—</b><i class="unit inspector-z-unit">m</i></span>
    <span>POS <b class="inspector-position">—</b></span>
  </div>

  <footer class="inspector-foot">—</footer>
`;

let els = null;

function updateUnits() {
  if (!els) return;
  const unit = lengthUnit();
  els.speedUnit.textContent = speedUnit();
  els.altUnit.textContent = unit;
  els.xUnit.textContent = unit;
  els.zUnit.textContent = unit;
}

function render(telemetry) {
  if (!els || !telemetry) return;
  const lapNumber = telemetry.lapNumber ?? 0;
  const position = telemetry.position ?? { x: 0, y: 0, z: 0 };

  els.lap.textContent = t("lap.count", { n: lapNumber + 1 });
  els.laptime.textContent = formatLap(telemetry.currentLap);
  els.speed.textContent = String(Math.round(Math.max(0, convertSpeed(telemetry.speed ?? 0))));
  els.gear.textContent = gearLabel(telemetry.gear);
  els.rpm.textContent = Math.round(telemetry.rpm ?? 0).toLocaleString(uiLocale());

  const throttle = (telemetry.throttle ?? 0) / 255;
  const brake = (telemetry.brake ?? 0) / 255;
  const clutch = (telemetry.clutch ?? 0) / 255;
  els.throttle.textContent = `${Math.round(throttle * 100)}%`;
  els.brake.textContent = `${Math.round(brake * 100)}%`;
  els.clutch.textContent = `${Math.round(clutch * 100)}%`;
  els.steer.textContent = `${Math.round(((telemetry.steer ?? 0) / 127) * 100)}%`;

  const temps = telemetry.tireTemp ?? {};
  for (const [key] of CORNERS) {
    const element = els.tires[key];
    const fahrenheit = temps[key];
    const value = element.querySelector("b");
    if (!fahrenheit || fahrenheit <= 0) {
      element.dataset.state = "cold";
      value.textContent = "—";
      continue;
    }
    element.dataset.state = tireState((fahrenheit - 32) / 1.8);
    value.textContent = formatTemperature(fahrenheit);
  }

  const acceleration = telemetry.acceleration ?? { x: 0, y: 0, z: 0 };
  els.gx.textContent = (acceleration.x / 9.81).toFixed(2);
  els.gz.textContent = (acceleration.z / 9.81).toFixed(2);
  els.alt.textContent = String(Math.round(convertLength(position.y)));
  els.x.textContent = String(Math.round(convertLength(position.x)));
  els.z.textContent = String(Math.round(convertLength(position.z)));

  const racePosition = telemetry.racePosition ?? 0;
  els.position.textContent = racePosition > 0 ? `P${Math.round(racePosition)}` : "—";

  const raceTime = telemetry.raceTime ?? telemetry.currentRaceTime ?? 0;
  const sessionTime = telemetry.sessionTime ?? telemetry.currentRaceTime ?? 0;
  els.clock.textContent = t("analysis.session-of", {
    race: raceTime > 0 ? formatLap(raceTime) : "—",
    session: formatClock(sessionTime),
  });
}

function refresh() {
  updateUnits();
  render(state.lastTelemetry);
}

export const inspectorTile = {
  id: "inspector",
  labelKey: "panels.inspector",
  panelId: "inspector",
  placement: { page: 2, x: 0.02, y: 0.02, w: 0.34, h: 0.66 },

  mount(panel) {
    panel.insertAdjacentHTML("beforeend", HTML);
    els = {
      lap: panel.querySelector(".inspector-lap"),
      laptime: panel.querySelector(".inspector-laptime"),
      speed: panel.querySelector(".inspector-speed-value"),
      speedUnit: panel.querySelector(".inspector-speed-unit"),
      gear: panel.querySelector(".inspector-gear"),
      rpm: panel.querySelector(".inspector-rpm"),
      throttle: panel.querySelector(".inspector-throttle"),
      brake: panel.querySelector(".inspector-brake"),
      clutch: panel.querySelector(".inspector-clutch"),
      steer: panel.querySelector(".inspector-steer"),
      gx: panel.querySelector(".inspector-gx"),
      gz: panel.querySelector(".inspector-gz"),
      alt: panel.querySelector(".inspector-alt"),
      altUnit: panel.querySelector(".inspector-alt-unit"),
      x: panel.querySelector(".inspector-x"),
      xUnit: panel.querySelector(".inspector-x-unit"),
      z: panel.querySelector(".inspector-z"),
      zUnit: panel.querySelector(".inspector-z-unit"),
      position: panel.querySelector(".inspector-position"),
      clock: panel.querySelector(".inspector-foot"),
      tires: {},
    };
    for (const [key] of CORNERS) {
      els.tires[key] = panel.querySelector(`.inspector-tires [data-corner="${key}"]`);
    }

    refresh();
    bus.on("language:changed", refresh);
    bus.on("units:changed", refresh);
    bus.on("telemetry:display", render);
  },

  update(telemetry) {
    if (state.mode === "live") render(telemetry);
  },
};
