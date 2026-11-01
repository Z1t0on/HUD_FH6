/**
 * Tuile Carte 3D : scène Three.js, tracé direct, suivi voiture et analyse
 * d'une session archivée.
 *
 * C'est la seule tuile qui possède une boucle de rendu : elle redessine la
 * scène à 60 Hz et pilote le G-Force (dessin 2D) au même rythme. Les autres
 * tuiles se contentent de réagir aux paquets et aux événements du bus.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { fetchSessionData } from "../core/api.js";
import { bus } from "../core/bus.js";
import {
  FRAME_INTERVAL_MS,
  FRAME_WATCHDOG_MS,
  G_HISTORY_SECONDS,
  IDLE_TIMEOUT,
  TRACK_CAPACITY,
  TRACK_MAX_SEGMENT,
  TRACK_MIN_DISTANCE,
  TRACK_TELEPORT_DISTANCE,
} from "../core/constants.js";
import { formatClock, formatLap } from "../core/format.js";
import { t } from "../core/i18n.js";
import { lapColorHex, lapColorRgb } from "../core/lap-colors.js";
import {
  parseSessionPayload,
  sampleIndexForTime,
  sampleToTelemetry,
  sampleValue,
} from "../core/session-data.js";
import { state } from "../core/state.js";
import { themeState } from "../core/theme.js";
import { showToast } from "../core/toast.js";
import { convertLength, lengthUnit, mapScaleHint } from "../core/units.js";
import { clamp, lerpAngle } from "../core/utils.js";
import { drawGForce, liveGForceCurrent, liveGForceTrail } from "./gforce.js";

const HTML = `
  <canvas id="scene"></canvas>

  <div class="map-overlay map-top">
    <div>
      <span class="panel-title" data-i18n="map.title">Carte 3D</span>
      <span class="map-sub">Position X / Y / Z en temps réel</span>
    </div>
    <div class="map-metrics">
      <span>ALT <b class="altitude">—</b><i class="unit altitude-unit">m</i></span>
      <span>X <b class="pos-x">—</b><i class="unit pos-x-unit">m</i></span>
      <span>Z <b class="pos-z">—</b><i class="unit pos-z-unit">m</i></span>
    </div>
  </div>

  <div class="lap-legend" aria-label="Tours enregistrés"></div>

  <div class="map-overlay map-bottom">
    <div class="analysis-bar" hidden>
      <button class="btn analysis-exit" type="button" data-i18n="map.back-live">
        Retour au direct
      </button>
      <span class="analysis-title">—</span>
      <input
        class="analysis-range"
        type="range"
        min="0"
        max="1"
        step="0.02"
        value="0"
        aria-label="Position dans la session"
      />
      <span class="analysis-clock">0:00.000</span>
    </div>
    <div class="map-controls-row">
      <div class="map-controls">
        <button class="btn view-iso" type="button" data-i18n="map.iso">Vue iso</button>
        <button class="btn view-fit" type="button" data-i18n="map.fit">Vue d'ensemble</button>
        <button class="btn is-active follow-toggle" type="button" data-i18n="map.follow">
          Suivi
        </button>
        <button class="btn clear-trail" type="button" data-i18n="map.clear">
          Effacer tracé
        </button>
      </div>
      <span class="map-hint">Glisser pour orbiter · molette pour zoomer · 1 carreau = 20 m</span>
    </div>
  </div>

  <div class="map-waiting" data-i18n="map.waiting">En attente du flux Data Out…</div>
`;

/* ------------------------------- Scène */

let canvas = null;
let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let ground = null;
let grid = null;
let livePointGeometry = null;
let livePointPositionAttribute = null;
let livePointColorAttribute = null;
let liveSegmentGeometry = null;
let liveSegmentPositionAttribute = null;
let liveSegmentColorAttribute = null;
let liveTrailGroup = null;
let trailGlow = null;
let trailHalo = null;
let trackLine = null;
let startRing = null;
let carGroup = null;
let carBody = null;
let carRing = null;
let glowSprite = null;
let altitudeGeometry = null;
let altitudeLine = null;
let groundMark = null;
let archiveGroup = null;

let els = null;
let liveLaps = [];
let lastLiveLap = null;
let currentHeading = 0;
let targetHeading = 0;
let analysisPreviousFollow = true;
let pickStart = null;

const targetCarPosition = new THREE.Vector3();
const isoOffset = new THREE.Vector3(220, 260, 220);
/** Cible réutilisée par `renderer.getSize` (pas d'allocation par image). */
const rendererSize = new THREE.Vector2();

const FRAME_WATCHDOG = FRAME_WATCHDOG_MS;
let lastGForceDraw = 0;
let frameHandle = 0;
let frameUsesTimer = false;
let lastFrameAt = performance.now();

/** Références exposées au point d'inspection `window.__hud`. */
export const sceneRefs = {};

function makeDotTexture() {
  const size = 64;
  const dotCanvas = document.createElement("canvas");
  dotCanvas.width = size;
  dotCanvas.height = size;
  const context = dotCanvas.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.35, "rgba(170, 245, 255, 0.8)");
  gradient.addColorStop(1, "rgba(0, 180, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(dotCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGlowTexture() {
  const size = 128;
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = size;
  glowCanvas.height = size;
  const context = glowCanvas.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 190, 80, 0.95)");
  gradient.addColorStop(0.35, "rgba(255, 140, 30, 0.35)");
  gradient.addColorStop(1, "rgba(255, 120, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(glowCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildScene() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(themeState.bg);
  scene.fog = new THREE.FogExp2(themeState.bg, 0.0011);

  camera = new THREE.PerspectiveCamera(45, 1, 0.5, 8000);
  camera.position.set(150, 190, 150);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 18;
  controls.maxDistance = 2200;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.9;

  scene.add(new THREE.HemisphereLight(0x9adfff, 0x0a141c, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(260, 480, 180);
  scene.add(sun);

  ground = new THREE.Mesh(
    new THREE.CircleGeometry(1800, 64),
    new THREE.MeshBasicMaterial({ color: 0x06111a, transparent: true, opacity: 0.85 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  scene.add(ground);

  grid = new THREE.GridHelper(3600, 180, 0x1c5f7a, 0x0d2633);
  grid.position.y = 0;
  grid.material.transparent = true;
  grid.material.opacity = 0.6;
  grid.material.depthWrite = false;
  scene.add(grid);

  /* ----- Piste : ligne lumineuse construite au fil des paquets */

  livePointGeometry = new THREE.BufferGeometry();
  livePointPositionAttribute = new THREE.BufferAttribute(state.live.pointPositions, 3);
  livePointPositionAttribute.setUsage(THREE.DynamicDrawUsage);
  livePointColorAttribute = new THREE.BufferAttribute(state.live.pointColors, 3);
  livePointColorAttribute.setUsage(THREE.DynamicDrawUsage);
  livePointGeometry.setAttribute("position", livePointPositionAttribute);
  livePointGeometry.setAttribute("color", livePointColorAttribute);
  livePointGeometry.setDrawRange(0, 0);

  liveSegmentGeometry = new THREE.BufferGeometry();
  liveSegmentPositionAttribute = new THREE.BufferAttribute(state.live.segmentPositions, 3);
  liveSegmentPositionAttribute.setUsage(THREE.DynamicDrawUsage);
  liveSegmentColorAttribute = new THREE.BufferAttribute(state.live.segmentColors, 3);
  liveSegmentColorAttribute.setUsage(THREE.DynamicDrawUsage);
  liveSegmentGeometry.setAttribute("position", liveSegmentPositionAttribute);
  liveSegmentGeometry.setAttribute("color", liveSegmentColorAttribute);
  liveSegmentGeometry.setDrawRange(0, 0);

  liveTrailGroup = new THREE.Group();
  scene.add(liveTrailGroup);

  trailGlow = new THREE.Points(
    livePointGeometry,
    new THREE.PointsMaterial({
      map: makeDotTexture(),
      color: 0xffffff,
      size: 6,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false,
    }),
  );
  trailGlow.frustumCulled = false;
  liveTrailGroup.add(trailGlow);

  trailHalo = new THREE.Points(
    livePointGeometry,
    new THREE.PointsMaterial({
      map: makeDotTexture(),
      color: 0xffffff,
      size: 11,
      vertexColors: true,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false,
    }),
  );
  trailHalo.frustumCulled = false;
  liveTrailGroup.add(trailHalo);

  trackLine = new THREE.LineSegments(
    liveSegmentGeometry,
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  trackLine.frustumCulled = false;
  liveTrailGroup.add(trackLine);

  /* ----- Repère de départ */

  startRing = new THREE.Mesh(
    new THREE.RingGeometry(4.5, 6, 32),
    new THREE.MeshBasicMaterial({
      color: 0x7fefff,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  startRing.rotation.x = -Math.PI / 2;
  startRing.position.y = 0.35;
  startRing.visible = false;
  scene.add(startRing);

  /* ----- Voiture */

  carGroup = new THREE.Group();

  carBody = new THREE.Mesh(
    new THREE.ConeGeometry(3.4, 11, 4),
    new THREE.MeshStandardMaterial({
      color: 0xffb020,
      emissive: 0xff7a00,
      emissiveIntensity: 1.2,
      metalness: 0.35,
      roughness: 0.35,
    }),
  );
  carBody.rotation.x = Math.PI / 2;
  carBody.position.y = 4;
  carGroup.add(carBody);

  carRing = new THREE.Mesh(
    new THREE.RingGeometry(6.5, 7.6, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffb020,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  carRing.rotation.x = -Math.PI / 2;
  carRing.position.y = 0.4;
  carGroup.add(carRing);

  glowSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glowSprite.scale.set(46, 46, 1);
  carGroup.add(glowSprite);

  scene.add(carGroup);

  /* ----- Ligne d'altitude (rapport au sol) */

  altitudeGeometry = new THREE.BufferGeometry();
  altitudeGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  altitudeLine = new THREE.Line(
    altitudeGeometry,
    new THREE.LineBasicMaterial({
      color: 0x7fefff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  altitudeLine.frustumCulled = false;
  scene.add(altitudeLine);

  /* ----- Projection au sol (repère d'altitude) */

  groundMark = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 28),
    new THREE.MeshBasicMaterial({
      color: 0x7fefff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  groundMark.rotation.x = -Math.PI / 2;
  groundMark.position.y = 0.25;
  groundMark.visible = false;
  scene.add(groundMark);

  archiveGroup = new THREE.Group();
  archiveGroup.visible = false;
  scene.add(archiveGroup);

  Object.assign(sceneRefs, {
    scene,
    camera,
    controls,
    renderer,
    carGroup,
    livePointGeometry,
    liveSegmentGeometry,
    liveTrailGroup,
    archiveGroup,
    trailGlow,
    trailHalo,
    trackLine,
    startRing,
    altitudeLine,
    groundMark,
  });
}

/* ------------------------------- Gestion du tracé */

function addLivePoint(x, y, z, lap) {
  const index = state.live.pointCount;
  const base = index * 3;
  const color = lapColorRgb(lap);

  state.live.pointPositions[base] = x;
  state.live.pointPositions[base + 1] = y + 0.6;
  state.live.pointPositions[base + 2] = z;
  state.live.pointColors[base] = color.r;
  state.live.pointColors[base + 1] = color.g;
  state.live.pointColors[base + 2] = color.b;

  state.live.points.push({ x, y, z, lap });
  state.live.pointCount += 1;

  livePointGeometry.setDrawRange(0, state.live.pointCount);
  livePointPositionAttribute.needsUpdate = true;
  livePointColorAttribute.needsUpdate = true;
}

function addLiveSegment(from, to, color) {
  if (state.live.segmentCount >= TRACK_CAPACITY) return;
  const base = state.live.segmentCount * 6;

  state.live.segmentPositions[base] = from.x;
  state.live.segmentPositions[base + 1] = from.y + 0.6;
  state.live.segmentPositions[base + 2] = from.z;
  state.live.segmentPositions[base + 3] = to.x;
  state.live.segmentPositions[base + 4] = to.y + 0.6;
  state.live.segmentPositions[base + 5] = to.z;

  for (let vertex = 0; vertex < 2; vertex += 1) {
    const offset = base + vertex * 3;
    state.live.segmentColors[offset] = color.r;
    state.live.segmentColors[offset + 1] = color.g;
    state.live.segmentColors[offset + 2] = color.b;
  }

  state.live.segmentCount += 1;
  liveSegmentGeometry.setDrawRange(0, state.live.segmentCount * 2);
  liveSegmentPositionAttribute.needsUpdate = true;
  liveSegmentColorAttribute.needsUpdate = true;
}

function pushTrackPoint(telemetry) {
  const { x, y, z } = telemetry.position;
  const lap = telemetry.lapNumber;
  const last = state.live.points[state.live.points.length - 1];

  if (last) {
    const step = Math.hypot(x - last.x, y - last.y, z - last.z);
    if (step < TRACK_MIN_DISTANCE) return;
    if (step > TRACK_TELEPORT_DISTANCE) {
      clearTrail();
    } else if (step <= TRACK_MAX_SEGMENT) {
      addLiveSegment(last, { x, y, z }, lapColorRgb(last.lap));
    }
  }

  if (state.live.pointCount >= TRACK_CAPACITY) {
    // Le tracé direct est un affichage : l'archive serveur reste complète.
    clearTrail();
  }

  addLivePoint(x, y, z, lap);

  if (state.live.pointCount === 1) {
    startRing.position.set(x, y + 0.6, z);
    startRing.visible = true;
  }

  if (lastLiveLap === null) {
    lastLiveLap = lap;
  } else if (lap !== lastLiveLap) {
    liveLaps.push({
      index: lastLiveLap,
      number: lastLiveLap + 1,
      time: telemetry.lastLap,
      complete: telemetry.lastLap > 0,
      startSample: 0,
      endSample: 0,
    });
    lastLiveLap = lap;
    if (state.mode === "live") renderLapLegend(liveLaps, false);
  }
}

export function clearTrail() {
  state.live.points = [];
  state.live.pointCount = 0;
  state.live.segmentCount = 0;
  livePointGeometry.setDrawRange(0, 0);
  liveSegmentGeometry.setDrawRange(0, 0);
  livePointPositionAttribute.needsUpdate = true;
  livePointColorAttribute.needsUpdate = true;
  liveSegmentPositionAttribute.needsUpdate = true;
  liveSegmentColorAttribute.needsUpdate = true;
  startRing.visible = false;
  liveLaps = [];
  lastLiveLap = null;
  if (state.mode === "live") renderLapLegend([], false);
}

function updateAltitudeLine(x, y, z, visible = state.live.pointCount > 0) {
  const positions = altitudeGeometry.getAttribute("position");
  positions.setXYZ(0, x, 0.2, z);
  positions.setXYZ(1, x, Math.max(y, 0.6), z);
  positions.needsUpdate = true;

  groundMark.position.set(x, 0.25, z);
  groundMark.visible = visible;
}

/** Légende des tours, interactive pendant l'analyse. */
function renderLapLegend(laps, interactive) {
  if (!els?.legend) return;
  /* Au direct, seuls les derniers tours restent affichés : la bande garde
     une longueur raisonnable même après une longue session. */
  const visible = interactive ? laps : laps.slice(-10);
  els.legend.replaceChildren();

  for (const lap of visible) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "lap-chip";
    chip.style.setProperty("--lap-color", lapColorHex(lap.index));
    chip.title = `Tour ${lap.number}${lap.time > 0 ? ` — ${formatLap(lap.time)}` : ""}`;

    const dot = document.createElement("i");
    const label = document.createElement("span");
    label.textContent = `T${lap.number}`;
    const time = document.createElement("b");
    time.textContent = lap.complete && lap.time > 0 ? formatLap(lap.time) : "…";
    chip.append(dot, label, time);

    if (interactive) {
      chip.classList.add("is-interactive");
      chip.addEventListener("click", () => {
        if (!state.analysis) return;
        const index = Math.max(0, Math.min(lap.startSample, state.analysis.count - 1));
        selectSample(index);
      });
    }

    els.legend.appendChild(chip);
  }

  /* Au direct, la vue suit le dernier tour : il reste visible sans défiler. */
  if (!interactive) els.legend.scrollLeft = els.legend.scrollWidth;
}

/* ------------------------------- Caméra */

function snapCameraToCar() {
  controls.target.copy(targetCarPosition);
  camera.position.copy(targetCarPosition).add(isoOffset);
  controls.update();
}

function setFollow(enabled) {
  state.followCar = enabled;
  els.follow.classList.toggle("is-active", enabled);
  els.follow.textContent = enabled ? t("map.follow") : t("map.free");
  if (enabled) {
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1) direction.copy(isoOffset);
    direction.normalize();
    controls.target.copy(targetCarPosition);
    camera.position
      .copy(targetCarPosition)
      .add(direction.multiplyScalar(isoOffset.length()));
    controls.update();
  }
}

function fitPoints(points) {
  if (points.length < 2) return false;

  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const entry of points) {
    box.expandByPoint(point.set(entry.x, entry.y, entry.z));
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z, 60) / 2;
  const distance = clamp(
    (radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.35,
    140,
    controls.maxDistance,
  );
  const direction = isoOffset.clone().normalize();
  controls.target.copy(center);
  camera.position.copy(center).add(direction.multiplyScalar(distance));
  controls.update();
  return true;
}

function fitTrail() {
  if (state.mode === "analysis" && state.analysis) {
    setFollow(false);
    fitPoints(state.analysis.trailPoints);
    return;
  }

  if (state.live.pointCount < 2) {
    setFollow(true);
    snapCameraToCar();
    return;
  }

  setFollow(false);
  fitPoints(state.live.points);
}

/* ------------------------------- Mise à jour télémétrie */

function renderLivePosition(position) {
  els.altitude.textContent = String(Math.round(convertLength(position.y)));
  els.posX.textContent = String(Math.round(convertLength(position.x)));
  els.posZ.textContent = String(Math.round(convertLength(position.z)));
}

/** Applique les unités et le rappel d'échelle de la carte. */
function applyUnitLabels() {
  if (!els) return;
  const unit = lengthUnit();
  els.altitudeUnit.textContent = unit;
  els.posXUnit.textContent = unit;
  els.posZUnit.textContent = unit;
  els.hint.textContent = mapScaleHint();
  if (state.lastTelemetry) renderLivePosition(state.lastTelemetry.position);
}

function updatePacket(telemetry) {
  const isFirstPacket = !state.activity.hasReceivedData;

  state.latest = telemetry;
  state.activity.lastPacketAt = performance.now();
  state.activity.hasReceivedData = true;

  // Piste 3D : alimentée même en mode analyse pour retrouver le direct au retour.
  const position = telemetry.position;
  if (Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)) {
    pushTrackPoint(telemetry);

    if (state.mode === "live") {
      targetCarPosition.set(position.x, Math.max(position.y, 0) + 2.5, position.z);

      const last = state.live.points[state.live.points.length - 2] ?? state.live.points[state.live.points.length - 1];
      if (last && telemetry.speed > 3) {
        const dx = position.x - last.x;
        const dz = position.z - last.z;
        if (Math.hypot(dx, dz) > 0.2) {
          targetHeading = Math.atan2(dx, dz);
        }
      }

      renderLivePosition(position);
    }
  }

  if (isFirstPacket && state.mode === "live") {
    snapCameraToCar();
  }
}

/* ------------------------------- Analyse d'une session */

function disposeArchive() {
  for (const child of archiveGroup.children) {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      for (const material of child.material) material.dispose?.();
    } else {
      child.material?.dispose?.();
    }
  }
  archiveGroup.clear();
  archiveGroup.visible = false;
}

function buildArchiveTrail(session) {
  disposeArchive();
  session.trailPoints = [];

  const stride = session.stride;
  const count = session.count;
  const xIndex = session.fieldIndex.get("x") ?? -1;
  const yIndex = session.fieldIndex.get("y") ?? -1;
  const zIndex = session.fieldIndex.get("z") ?? -1;
  const lapIndex = session.fieldIndex.get("lapNumber") ?? -1;
  if (xIndex < 0 || yIndex < 0 || zIndex < 0 || lapIndex < 0) {
    throw new Error("Colonnes de position absentes");
  }

  const pointPositions = new Float32Array(count * 3);
  const pointColors = new Float32Array(count * 3);
  const segmentPositions = new Float32Array(count * 6);
  const segmentColors = new Float32Array(count * 6);
  let pointCount = 0;
  let segmentCount = 0;
  let last = null;

  for (let sample = 0; sample < count; sample += 1) {
    const x = session.data[sample * stride + xIndex];
    const y = session.data[sample * stride + yIndex];
    const z = session.data[sample * stride + zIndex];
    const lap = session.data[sample * stride + lapIndex];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

    if (last) {
      const step = Math.hypot(x - last.x, y - last.y, z - last.z);
      if (step < TRACK_MIN_DISTANCE) continue;
      if (step <= TRACK_TELEPORT_DISTANCE) {
        const base = segmentCount * 6;
        const color = lapColorRgb(last.lap);
        segmentPositions[base] = last.x;
        segmentPositions[base + 1] = last.y + 0.6;
        segmentPositions[base + 2] = last.z;
        segmentPositions[base + 3] = x;
        segmentPositions[base + 4] = y + 0.6;
        segmentPositions[base + 5] = z;
        for (let vertex = 0; vertex < 2; vertex += 1) {
          const offset = base + vertex * 3;
          segmentColors[offset] = color.r;
          segmentColors[offset + 1] = color.g;
          segmentColors[offset + 2] = color.b;
        }
        segmentCount += 1;
      }
    }

    const color = lapColorRgb(lap);
    pointPositions[pointCount * 3] = x;
    pointPositions[pointCount * 3 + 1] = y + 0.6;
    pointPositions[pointCount * 3 + 2] = z;
    pointColors[pointCount * 3] = color.r;
    pointColors[pointCount * 3 + 1] = color.g;
    pointColors[pointCount * 3 + 2] = color.b;
    session.trailPoints.push({ x, y, z, lap, sample });
    pointCount += 1;
    last = { x, y, z, lap };
  }

  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(pointPositions.slice(0, pointCount * 3), 3),
  );
  pointGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(pointColors.slice(0, pointCount * 3), 3),
  );

  const segmentGeometry = new THREE.BufferGeometry();
  segmentGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(segmentPositions.slice(0, segmentCount * 6), 3),
  );
  segmentGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(segmentColors.slice(0, segmentCount * 6), 3),
  );

  const points = new THREE.Points(
    pointGeometry,
    new THREE.PointsMaterial({
      map: makeDotTexture(),
      color: 0xffffff,
      size: 5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false,
    }),
  );
  points.frustumCulled = false;

  const line = new THREE.LineSegments(
    segmentGeometry,
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  line.frustumCulled = false;

  archiveGroup.add(points, line);
  archiveGroup.visible = true;
}

/** Charge une archive et bascule la carte en mode analyse. */
export async function loadSession(id) {
  try {
    const session = parseSessionPayload(await fetchSessionData(id));
    enterAnalysis(session);
  } catch (error) {
    console.error("Chargement de la session impossible :", error);
    showToast(t("toast.load-failed"));
  }
}

function enterAnalysis(session) {
  if (state.analysis) exitAnalysis();

  state.analysis = session;
  state.mode = "analysis";
  analysisPreviousFollow = state.followCar;

  liveTrailGroup.visible = false;
  startRing.visible = false;
  archiveGroup.visible = true;
  carGroup.visible = true;

  buildArchiveTrail(session);

  els.analysisBar.hidden = false;
  els.analysisTitle.textContent =
    session.meta.kind === "race"
      ? t("analysis.race", { n: session.meta.lapCount, time: formatClock(session.meta.duration) })
      : t("analysis.free", { time: formatClock(session.meta.duration) });
  els.analysisRange.min = "0";
  els.analysisRange.max = String(Math.max(0.001, session.meta.duration));
  els.analysisRange.value = "0";
  els.analysisClock.textContent = "0:00.000";
  els.mapSub.textContent = t("map.sub-analysis");
  els.clear.disabled = true;
  document.getElementById("app")?.classList.add("is-analysis");

  setFollow(false);
  fitPoints(session.trailPoints);
  renderLapLegend(session.meta.laps ?? [], true);
  selectSample(0);
  bus.emit("analysis:enter", session);
}

/** Quitte l'analyse et revient au direct. */
export function exitAnalysis() {
  if (!state.analysis) return;

  disposeArchive();
  state.analysis = null;
  state.mode = "live";

  liveTrailGroup.visible = true;
  startRing.visible = state.live.pointCount > 0;

  els.analysisBar.hidden = true;
  els.mapSub.textContent = t("map.sub-live");
  els.clear.disabled = false;
  document.getElementById("app")?.classList.remove("is-analysis");
  renderLapLegend(liveLaps, false);

  setFollow(analysisPreviousFollow);
  state.smoothed.initialized = false;

  if (state.latest) {
    const position = state.latest.position;
    targetCarPosition.set(position.x, Math.max(position.y, 0) + 2.5, position.z);
    carGroup.position.copy(targetCarPosition);
  }

  state.lastTelemetry = state.latest;
  if (state.latest) bus.emit("telemetry:display", state.latest);
  bus.emit("analysis:exit");
}

/** Sélectionne un échantillon : voiture, chrono, instruments et inspecteur. */
export function selectSample(index) {
  const session = state.analysis;
  if (!session) return;
  if (session.count === 0) return;
  const sample = clamp(Math.round(index), 0, session.count - 1);
  session.sampleIndex = sample;

  const x = sampleValue(session, sample, "x");
  const y = sampleValue(session, sample, "y");
  const z = sampleValue(session, sample, "z");

  targetCarPosition.set(x, Math.max(y, 0) + 2.5, z);
  carGroup.position.copy(targetCarPosition);

  const next = Math.min(sample + 1, session.count - 1);
  const dx = sampleValue(session, next, "x") - x;
  const dz = sampleValue(session, next, "z") - z;
  if (Math.hypot(dx, dz) > 0.1) {
    targetHeading = Math.atan2(dx, dz);
    currentHeading = targetHeading;
  }

  updateAltitudeLine(x, y, z, true);

  const time = session.data[sample * session.stride];
  els.analysisRange.value = String(time);
  els.analysisClock.textContent = formatClock(time);

  const telemetry = sampleToTelemetry(session, sample);
  state.lastTelemetry = telemetry;
  state.smoothed.initialized = false;
  state.smoothed.speed = telemetry.speed;
  bus.emit("telemetry:display", telemetry);
}

function analysisGForce() {
  const session = state.analysis;
  if (!session) return { current: null, trail: [] };
  const sample = session.sampleIndex;
  const g = (index) => ({
    gx: sampleValue(session, index, "accelX") / 9.81,
    gz: sampleValue(session, index, "accelZ") / 9.81,
  });

  const time = session.data[sample * session.stride];
  let start = sample;
  while (start > 0 && time - session.data[start * session.stride] < G_HISTORY_SECONDS) {
    start -= 1;
  }

  const trail = [];
  for (let index = start + 1; index <= sample; index += 1) {
    const span = Math.max(1, sample - start);
    const alpha = clamp(1 - (sample - index) / span, 0, 1) * 0.65;
    trail.push({ from: g(index - 1), to: g(index), alpha });
  }
  return { current: g(sample), trail };
}

function pickArchiveSample(clientX, clientY) {
  const session = state.analysis;
  if (!session || state.mode !== "analysis") return;
  const rect = canvas.getBoundingClientRect();
  const projected = new THREE.Vector3();
  let bestSample = -1;
  let bestDistance = 18;

  for (const entry of session.trailPoints) {
    projected.set(entry.x, entry.y + 0.6, entry.z).project(camera);
    if (projected.z > 1) continue;
    const screenX = rect.left + ((projected.x + 1) / 2) * rect.width;
    const screenY = rect.top + ((1 - projected.y) / 2) * rect.height;
    const distance = Math.hypot(screenX - clientX, screenY - clientY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSample = entry.sample;
    }
  }

  if (bestSample >= 0) selectSample(bestSample);
}

/* ------------------------------- Scène : animation */

function animateCarAndCamera() {
  carGroup.position.lerp(targetCarPosition, 0.2);
  currentHeading = lerpAngle(currentHeading, targetHeading, 0.18);
  carGroup.rotation.y = currentHeading;

  glowSprite.position.set(0, 5, 0);

  updateAltitudeLine(
    carGroup.position.x,
    carGroup.position.y,
    carGroup.position.z,
    state.mode === "analysis" ? true : state.live.pointCount > 0,
  );

  if (state.followCar) {
    const offset = camera.position.clone().sub(controls.target);
    controls.target.lerp(targetCarPosition, 0.1);
    camera.position.copy(controls.target).add(offset);
  }

  controls.update();
}

/* ------------------------------- Boucle de rendu */

function scheduleFrame() {
  if (frameUsesTimer) {
    frameHandle = setTimeout(() => frame(performance.now()), FRAME_INTERVAL_MS);
  } else {
    frameHandle = requestAnimationFrame(frame);
  }
}

function useTimerLoop() {
  if (frameUsesTimer) return;
  frameUsesTimer = true;
  cancelAnimationFrame(frameHandle);
  clearTimeout(frameHandle);
  scheduleFrame();
}

function useRafLoop() {
  if (!frameUsesTimer) return;
  frameUsesTimer = false;
  cancelAnimationFrame(frameHandle);
  clearTimeout(frameHandle);
  scheduleFrame();
}

function frame(now) {
  lastFrameAt = performance.now();

  /* Carte sur l'autre espace ou masquée : on saute le rendu 3D, mais la
     boucle continue — le G-Force et l'animation d'autres tuiles en dépendent. */
  const mapVisible = canvas.clientWidth > 0 && canvas.clientHeight > 0;
  if (mapVisible) resizeRenderer();
  const live = state.latest && now - state.activity.lastPacketAt < IDLE_TIMEOUT;
  document.getElementById("app")?.classList.toggle(
    "is-live",
    Boolean(live) || state.mode === "analysis",
  );

  if (state.mode === "analysis" && state.analysis) {
    if (now - lastGForceDraw > 33) {
      const gforce = analysisGForce();
      drawGForce(gforce.current, gforce.trail);
      lastGForceDraw = now;
    }
  } else if (live) {
    if (now - lastGForceDraw > 33) {
      drawGForce(liveGForceCurrent(), liveGForceTrail());
      lastGForceDraw = now;
    }
  }

  animateCarAndCamera();
  if (mapVisible) renderer.render(scene, camera);
  scheduleFrame();
}

/*
 * Certains navigateurs gèlent requestAnimationFrame quand la fenêtre est occultée
 * (OBS, second écran verrouillé, onglet en arrière-plan). Si aucun frame n'est
 * produit, on bascule sur setTimeout pour continuer à rafraîchir le HUD.
 */
setInterval(() => {
  if (performance.now() - lastFrameAt > FRAME_WATCHDOG) {
    useTimerLoop();
  }
}, FRAME_WATCHDOG);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") useRafLoop();
});

/* ------------------------------- Redimensionnement */

function resizeRenderer() {
  if (!renderer || !canvas) return;
  const panel = canvas.parentElement;
  const width = panel.clientWidth;
  const height = panel.clientHeight;
  if (width === 0 || height === 0) return;

  /* Le navigateur peut suspendre les notifications de redimensionnement
     quand l'onglet n'est plus composé : on ne rappelle setSize que sur un
     changement réel, et la boucle de rendu s'en charge aussi. */
  const size = renderer.getSize(rendererSize);
  if (Math.round(size.x) === width && Math.round(size.y) === height) return;

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

/* ------------------------------- Câblage de la tuile */

function bindControls() {
  els.follow.addEventListener("click", () => setFollow(!state.followCar));
  els.iso.addEventListener("click", () => {
    setFollow(true);
    snapCameraToCar();
  });
  els.fit.addEventListener("click", () => fitTrail());
  els.clear.addEventListener("click", () => clearTrail());
  els.analysisExit.addEventListener("click", () => exitAnalysis());
  els.analysisRange.addEventListener("input", () => {
    if (!state.analysis) return;
    selectSample(sampleIndexForTime(state.analysis, Number(els.analysisRange.value)));
  });

  canvas.addEventListener("pointerdown", (event) => {
    pickStart = { x: event.clientX, y: event.clientY, at: performance.now() };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pickStart) return;
    const moved = Math.hypot(event.clientX - pickStart.x, event.clientY - pickStart.y);
    const elapsed = performance.now() - pickStart.at;
    pickStart = null;
    if (state.mode === "analysis" && moved < 6 && elapsed < 600) {
      pickArchiveSample(event.clientX, event.clientY);
    }
  });
  canvas.addEventListener("pointerleave", () => {
    pickStart = null;
  });
}

export const mapTile = {
  id: "map",
  labelKey: "panels.map",
  panelId: "map-panel",
  placement: { page: 1, x: 0.245, y: 0, w: 0.505, h: 1 },

  mount(panel) {
    panel.insertAdjacentHTML("beforeend", HTML);
    canvas = panel.querySelector("#scene");
    els = {
      mapSub: panel.querySelector(".map-sub"),
      altitude: panel.querySelector(".altitude"),
      altitudeUnit: panel.querySelector(".altitude-unit"),
      posX: panel.querySelector(".pos-x"),
      posXUnit: panel.querySelector(".pos-x-unit"),
      posZ: panel.querySelector(".pos-z"),
      posZUnit: panel.querySelector(".pos-z-unit"),
      legend: panel.querySelector(".lap-legend"),
      analysisBar: panel.querySelector(".analysis-bar"),
      analysisExit: panel.querySelector(".analysis-exit"),
      analysisTitle: panel.querySelector(".analysis-title"),
      analysisRange: panel.querySelector(".analysis-range"),
      analysisClock: panel.querySelector(".analysis-clock"),
      follow: panel.querySelector(".follow-toggle"),
      iso: panel.querySelector(".view-iso"),
      fit: panel.querySelector(".view-fit"),
      clear: panel.querySelector(".clear-trail"),
      hint: panel.querySelector(".map-hint"),
    };

    buildScene();
    bindControls();
    applyUnitLabels();
    els.mapSub.textContent = t("map.sub-live");

    const observer = new ResizeObserver(() => resizeRenderer());
    observer.observe(canvas.parentElement);
    resizeRenderer();
    snapCameraToCar();
    scheduleFrame();

    bus.on("units:changed", applyUnitLabels);
    bus.on("language:changed", () => {
      applyUnitLabels();
      els.follow.textContent = state.followCar ? t("map.follow") : t("map.free");
      els.mapSub.textContent = state.mode === "analysis" ? t("map.sub-analysis") : t("map.sub-live");
      if (state.analysis) {
        const session = state.analysis;
        els.analysisTitle.textContent =
          session.meta.kind === "race"
            ? t("analysis.race", { n: session.meta.lapCount, time: formatClock(session.meta.duration) })
            : t("analysis.free", { time: formatClock(session.meta.duration) });
      }
    });
    bus.on("theme:changed", (theme) => {
      if (!scene) return;
      scene.background = new THREE.Color(theme.bg);
      if (scene.fog) scene.fog.color.set(theme.bg);
    });
    bus.on("session:analyze", (id) => loadSession(id));
    bus.on("session:removed", (id) => {
      if (state.analysis?.meta.id === id) exitAnalysis();
    });
  },

  update(telemetry) {
    updatePacket(telemetry);
  },
};

