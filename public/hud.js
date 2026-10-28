/**
 * HUD FH6 — dashboard de télémétrie Forza Horizon 6.
 *
 * - Reçoit les paquets décodés via SSE (/events)
 * - Affiche les instruments temps réel
 * - Trace la position X/Y/Z dans une scène Three.js (carte 3D interactive)
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const $ = (id) => document.getElementById(id);

const app = $("app");
const conn = $("conn");
const statusEl = $("status");

const speedEl = $("speed");
const speedSecondaryEl = $("speed-secondary");
const speedUnitEl = $("speed-unit");
const speedSecondaryUnitEl = $("speed-secondary-unit");
const unitsButton = $("units-toggle");
const gearEl = $("gear");
const rpmEl = $("rpm");
const rpmArc = $("rpm-arc");
const rpmCap = $("rpm-cap");
const shiftLights = $("shift-lights");
const cluster = $("cluster");

const throttleFill = $("throttle-fill");
const brakeFill = $("brake-fill");
const clutchFill = $("clutch-fill");
const throttleValue = $("throttle-value");
const brakeValue = $("brake-value");
const clutchValue = $("clutch-value");

const gforceCanvas = $("gforce");
const gforceCtx = gforceCanvas.getContext("2d");
const gforceReadout = $("gforce-readout");

const lapCurrentEl = $("lap-current");
const lapLastEl = $("lap-last");
const lapBestEl = $("lap-best");
const lapCountEl = $("lap-count");
const deltaEl = $("delta");
const deltaValueEl = $("delta-value");

const altitudeEl = $("altitude");
const altitudeUnitEl = $("altitude-unit");
const posXEl = $("pos-x");
const posXUnitEl = $("pos-x-unit");
const posZEl = $("pos-z");
const posZUnitEl = $("pos-z-unit");
const mapHintEl = $("map-hint");

const followToggle = $("follow-toggle");
const viewIsoButton = $("view-iso");
const viewFitButton = $("view-fit");
const clearTrailButton = $("clear-trail");
const fullscreenButton = $("fullscreen");
const udpInfo = $("udp-info");

const sessionsButton = $("sessions-open");
const sessionsCountEl = $("sessions-count");
const sessionsModal = $("sessions-modal");
const sessionsListEl = $("session-list");
const sessionsSummaryEl = $("sessions-summary");
const sessionsCloseButton = $("sessions-close");
const sessionsRefreshButton = $("sessions-refresh");
const mapSubEl = $("map-sub");
const lapLegendEl = $("lap-legend");
const analysisBar = $("analysis-bar");
const analysisExitButton = $("analysis-exit");
const analysisTitleEl = $("analysis-title");
const analysisRange = $("analysis-time");
const analysisClockEl = $("analysis-clock");
const inspectorEl = $("inspector");
const toastEl = $("toast");

const inspectorEls = {
  lap: $("inspector-lap"),
  laptime: $("inspector-laptime"),
  speed: $("inspector-speed"),
  speedUnit: $("inspector-speed-unit"),
  gear: $("inspector-gear"),
  rpm: $("inspector-rpm"),
  throttle: $("inspector-throttle"),
  brake: $("inspector-brake"),
  clutch: $("inspector-clutch"),
  steer: $("inspector-steer"),
  gx: $("inspector-gx"),
  gz: $("inspector-gz"),
  alt: $("inspector-alt"),
  altUnit: $("inspector-alt-unit"),
  x: $("inspector-x"),
  xUnit: $("inspector-x-unit"),
  z: $("inspector-z"),
  zUnit: $("inspector-z-unit"),
  position: $("inspector-position"),
  clock: $("inspector-clock"),
  tires: {
    frontLeft: $("inspector-tire-fl"),
    frontRight: $("inspector-tire-fr"),
    rearLeft: $("inspector-tire-rl"),
    rearRight: $("inspector-tire-rr"),
  },
};

const tireEls = {
  frontLeft: $("tire-fl"),
  frontRight: $("tire-fr"),
  rearLeft: $("tire-rl"),
  rearRight: $("tire-rr"),
};

/* ------------------------------- Constantes */

const ARC_CIRCUMFERENCE = 2 * Math.PI * 100;
const IDLE_TIMEOUT = 1500;
const SHIFT_THRESHOLD = 0.94;
const G_SCALE = 2.5;
const G_HISTORY_SECONDS = 2.2;

const TRACK_CAPACITY = 60000;
const TRACK_MIN_DISTANCE = 1.2;
const TRACK_TELEPORT_DISTANCE = 800;
const TRACK_MAX_SEGMENT = 80;

const LAP_PALETTE = [
  "#00e5ff",
  "#2ee6a8",
  "#ffb020",
  "#ff4d9d",
  "#a06cff",
  "#ff8a3d",
  "#7dd3fc",
  "#e6ff3b",
  "#ff5c5c",
  "#9dffb0",
];
const LAP_COLORS = LAP_PALETTE.map((hex) => new THREE.Color(hex));

const TIRE_COLORS = {
  cold: "#38bdf8",
  ideal: "#2ee6a8",
  hot: "#ffb020",
  overheat: "#ff3b3b",
};

/* ------------------------------- Unités */

const UNITS_STORAGE_KEY = "hud-fh6:units";
const MS_TO_KMH = 3.6;
const MS_TO_MPH = 2.23693629;
const METERS_TO_FEET = 3.280839895;
const METERS_TO_MILES = 1 / 1609.344;
const GRID_CELL_METERS = 20;

/** Pays qui utilisent encore les unités impériales dans la vie courante. */
const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);

const LOCALE =
  (Array.isArray(navigator.languages) && navigator.languages[0]) || navigator.language || "fr-FR";

function detectUnitSystem() {
  try {
    const stored = localStorage.getItem(UNITS_STORAGE_KEY);
    if (stored === "metric" || stored === "imperial") return stored;
  } catch {
    // Stockage indisponible (navigation privée) : on garde la détection par langue.
  }

  const tags = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  for (const tag of tags) {
    if (!tag) continue;
    try {
      const region = new Intl.Locale(tag).maximize().region;
      if (region && IMPERIAL_REGIONS.has(region)) return "imperial";
    } catch {
      // Locale exotique : on retombe sur l'analyse de la chaîne.
    }
    if (/(?:^|[-_])US(?:$|[-_])/i.test(tag)) return "imperial";
  }
  return "metric";
}

let unitSystem = detectUnitSystem();

const isImperial = () => unitSystem === "imperial";

function speedUnit() {
  return isImperial() ? "MPH" : "KM/H";
}

function secondarySpeedUnit() {
  return isImperial() ? "KM/H" : "MPH";
}

/** Vitesse en m/s convertie dans l'unité principale. */
function convertSpeed(metersPerSecond) {
  return isImperial() ? metersPerSecond * MS_TO_MPH : metersPerSecond * MS_TO_KMH;
}

/** Vitesse en m/s convertie dans l'unité secondaire (rappel). */
function convertSecondarySpeed(metersPerSecond) {
  return isImperial() ? metersPerSecond * MS_TO_KMH : metersPerSecond * MS_TO_MPH;
}

function lengthUnit() {
  return isImperial() ? "ft" : "m";
}

function convertLength(meters) {
  return isImperial() ? meters * METERS_TO_FEET : meters;
}

function formatLength(meters) {
  if (!Number.isFinite(meters)) return "—";
  if (!isImperial()) {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
  }
  const feet = meters * METERS_TO_FEET;
  return feet >= 5280 ? `${(meters * METERS_TO_MILES).toFixed(1)} mi` : `${Math.round(feet)} ft`;
}

function formatTemperature(fahrenheit) {
  if (!Number.isFinite(fahrenheit) || fahrenheit <= 0) return "—";
  return isImperial()
    ? `${Math.round(fahrenheit)}°F`
    : `${Math.round(fahrenheitToCelsius(fahrenheit))}°C`;
}

function mapScaleHint() {
  const cell = isImperial()
    ? `${Math.round(GRID_CELL_METERS * METERS_TO_FEET)} ft`
    : `${GRID_CELL_METERS} m`;
  return `Glisser pour orbiter · molette pour zoomer · 1 carreau = ${cell}`;
}

function applyUnitLabels() {
  const length = lengthUnit();

  speedUnitEl.textContent = speedUnit();
  speedSecondaryUnitEl.textContent = secondarySpeedUnit();
  inspectorEls.speedUnit.textContent = speedUnit();

  altitudeUnitEl.textContent = length;
  posXUnitEl.textContent = length;
  posZUnitEl.textContent = length;
  inspectorEls.altUnit.textContent = length;
  inspectorEls.xUnit.textContent = length;
  inspectorEls.zUnit.textContent = length;

  mapHintEl.textContent = mapScaleHint();

  unitsButton.textContent = isImperial() ? "MPH · °F" : "KM/H · °C";
  unitsButton.dataset.units = unitSystem;
  unitsButton.setAttribute(
    "aria-label",
    isImperial() ? "Système d'unités : impérial" : "Système d'unités : métrique",
  );
  unitsButton.title = isImperial()
    ? "Passer au système métrique (km/h, °C, m)"
    : "Passer au système impérial (mph, °F, ft)";
}

/** Réaffiche les valeurs visibles après un changement d'unités. */
function refreshUnitReadouts() {
  if (analysis) {
    const index = analysis.sampleIndex ?? 0;
    const telemetry = sampleToTelemetry(analysis, index);
    smoothed.initialized = false;
    smoothed.speed = telemetry.speed;
    renderInstruments(telemetry);
    updateInspector(index);
  } else if (latest) {
    if (Number.isFinite(latest.position?.y)) renderLivePosition(latest.position);
    smoothed.speed = latest.speed;
    renderInstruments(latest);
  }

  if (!sessionsModal.hidden) renderSessionList(lastSessionsPayload ?? { sessions });
}

function setUnitSystem(next) {
  const value = next === "imperial" ? "imperial" : "metric";
  if (value === unitSystem) return;
  unitSystem = value;
  try {
    localStorage.setItem(UNITS_STORAGE_KEY, value);
  } catch {
    // Préférence non persistée : le choix reste actif pour la session en cours.
  }
  applyUnitLabels();
  refreshUnitReadouts();
}

/* ------------------------------- État */

let latest = null;
let lastPacketAt = 0;
let hasReceivedData = false;

const smoothed = { speed: 0, initialized: false };
const gHistory = [];

const live = {
  points: [],
  pointCount: 0,
  segmentCount: 0,
  pointPositions: new Float32Array(TRACK_CAPACITY * 3),
  pointColors: new Float32Array(TRACK_CAPACITY * 3),
  segmentPositions: new Float32Array(TRACK_CAPACITY * 2 * 3),
  segmentColors: new Float32Array(TRACK_CAPACITY * 2 * 3),
};
let liveLaps = [];
let lastLiveLap = null;

let mode = "live";
let analysis = null;
let sessions = [];
let lastSessionsPayload = null;

let followCar = true;
let currentHeading = 0;
let targetHeading = 0;
const targetCarPosition = new THREE.Vector3();

/* ------------------------------- Outils */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function formatLap(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--.---";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.000";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
}

function gearLabel(gear) {
  if (gear === 0) return "R";
  if (gear === 1) return "N";
  if (gear >= 2 && gear <= 11) return String(gear - 1);
  return "—";
}

function tireState(celsius) {
  if (celsius < 70) return "cold";
  if (celsius <= 100) return "ideal";
  if (celsius <= 115) return "hot";
  return "overheat";
}

const fahrenheitToCelsius = (value) => (value - 32) / 1.8;

function lerpAngle(from, to, amount) {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * amount;
}

function lapColorIndex(lapNumber) {
  const length = LAP_PALETTE.length;
  return ((Math.trunc(lapNumber) % length) + length) % length;
}

function lapColorHex(lapNumber) {
  return LAP_PALETTE[lapColorIndex(lapNumber)];
}

function lapColorRgb(lapNumber) {
  return LAP_COLORS[lapColorIndex(lapNumber)];
}

function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  return formatLength(meters);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Mo";
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} Mo`;
}

function formatDateTime(epochMs) {
  if (!Number.isFinite(epochMs)) return "—";
  return new Date(epochMs).toLocaleString(LOCALE, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/* ------------------------------- Three.js */

const canvas = $("scene");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05080d);
scene.fog = new THREE.FogExp2(0x05080d, 0.0011);

const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 8000);
camera.position.set(150, 190, 150);

const controls = new OrbitControls(camera, canvas);
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

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(1800, 64),
  new THREE.MeshBasicMaterial({ color: 0x06111a, transparent: true, opacity: 0.85 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.2;
scene.add(ground);

const grid = new THREE.GridHelper(3600, 180, 0x1c5f7a, 0x0d2633);
grid.position.y = 0;
grid.material.transparent = true;
grid.material.opacity = 0.6;
grid.material.depthWrite = false;
scene.add(grid);

/* ----- Piste : ligne lumineuse construite au fil des paquets */

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

const livePointGeometry = new THREE.BufferGeometry();
const livePointPositionAttribute = new THREE.BufferAttribute(live.pointPositions, 3);
livePointPositionAttribute.setUsage(THREE.DynamicDrawUsage);
const livePointColorAttribute = new THREE.BufferAttribute(live.pointColors, 3);
livePointColorAttribute.setUsage(THREE.DynamicDrawUsage);
livePointGeometry.setAttribute("position", livePointPositionAttribute);
livePointGeometry.setAttribute("color", livePointColorAttribute);
livePointGeometry.setDrawRange(0, 0);

const liveSegmentGeometry = new THREE.BufferGeometry();
const liveSegmentPositionAttribute = new THREE.BufferAttribute(live.segmentPositions, 3);
liveSegmentPositionAttribute.setUsage(THREE.DynamicDrawUsage);
const liveSegmentColorAttribute = new THREE.BufferAttribute(live.segmentColors, 3);
liveSegmentColorAttribute.setUsage(THREE.DynamicDrawUsage);
liveSegmentGeometry.setAttribute("position", liveSegmentPositionAttribute);
liveSegmentGeometry.setAttribute("color", liveSegmentColorAttribute);
liveSegmentGeometry.setDrawRange(0, 0);

const liveTrailGroup = new THREE.Group();
scene.add(liveTrailGroup);

const trailGlow = new THREE.Points(
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

const trailHalo = new THREE.Points(
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

const trackLine = new THREE.LineSegments(
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

const startRing = new THREE.Mesh(
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

const carGroup = new THREE.Group();

const carBody = new THREE.Mesh(
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

const carRing = new THREE.Mesh(
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

const glowSprite = new THREE.Sprite(
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

const altitudeGeometry = new THREE.BufferGeometry();
altitudeGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
const altitudeLine = new THREE.Line(
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

const groundMark = new THREE.Mesh(
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

/* ------------------------------- Gestion du tracé */

function addLivePoint(x, y, z, lap) {
  const index = live.pointCount;
  const base = index * 3;
  const color = lapColorRgb(lap);

  live.pointPositions[base] = x;
  live.pointPositions[base + 1] = y + 0.6;
  live.pointPositions[base + 2] = z;
  live.pointColors[base] = color.r;
  live.pointColors[base + 1] = color.g;
  live.pointColors[base + 2] = color.b;

  live.points.push({ x, y, z, lap });
  live.pointCount += 1;

  livePointGeometry.setDrawRange(0, live.pointCount);
  livePointPositionAttribute.needsUpdate = true;
  livePointColorAttribute.needsUpdate = true;
}

function addLiveSegment(from, to, color) {
  if (live.segmentCount >= TRACK_CAPACITY) return;
  const base = live.segmentCount * 6;

  live.segmentPositions[base] = from.x;
  live.segmentPositions[base + 1] = from.y + 0.6;
  live.segmentPositions[base + 2] = from.z;
  live.segmentPositions[base + 3] = to.x;
  live.segmentPositions[base + 4] = to.y + 0.6;
  live.segmentPositions[base + 5] = to.z;

  for (let vertex = 0; vertex < 2; vertex += 1) {
    const offset = base + vertex * 3;
    live.segmentColors[offset] = color.r;
    live.segmentColors[offset + 1] = color.g;
    live.segmentColors[offset + 2] = color.b;
  }

  live.segmentCount += 1;
  liveSegmentGeometry.setDrawRange(0, live.segmentCount * 2);
  liveSegmentPositionAttribute.needsUpdate = true;
  liveSegmentColorAttribute.needsUpdate = true;
}

function pushTrackPoint(telemetry) {
  const { x, y, z } = telemetry.position;
  const lap = telemetry.lapNumber;
  const last = live.points[live.points.length - 1];

  if (last) {
    const step = Math.hypot(x - last.x, y - last.y, z - last.z);
    if (step < TRACK_MIN_DISTANCE) return;
    if (step > TRACK_TELEPORT_DISTANCE) {
      clearTrail();
    } else if (step <= TRACK_MAX_SEGMENT) {
      addLiveSegment(last, { x, y, z }, lapColorRgb(last.lap));
    }
  }

  if (live.pointCount >= TRACK_CAPACITY) {
    // Le tracé direct est un affichage : l'archive serveur reste complète.
    clearTrail();
  }

  addLivePoint(x, y, z, lap);

  if (live.pointCount === 1) {
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
    if (mode === "live") renderLapLegend(liveLaps, false);
  }
}

function clearTrail() {
  live.points = [];
  live.pointCount = 0;
  live.segmentCount = 0;
  livePointGeometry.setDrawRange(0, 0);
  liveSegmentGeometry.setDrawRange(0, 0);
  livePointPositionAttribute.needsUpdate = true;
  livePointColorAttribute.needsUpdate = true;
  liveSegmentPositionAttribute.needsUpdate = true;
  liveSegmentColorAttribute.needsUpdate = true;
  startRing.visible = false;
  liveLaps = [];
  lastLiveLap = null;
  if (mode === "live") renderLapLegend([], false);
}

function updateAltitudeLine(x, y, z, visible = live.pointCount > 0) {
  const positions = altitudeGeometry.getAttribute("position");
  positions.setXYZ(0, x, 0.2, z);
  positions.setXYZ(1, x, Math.max(y, 0.6), z);
  positions.needsUpdate = true;

  groundMark.position.set(x, 0.25, z);
  groundMark.visible = visible;
}

/* ------------------------------- Caméra */

const isoOffset = new THREE.Vector3(220, 260, 220);

function snapCameraToCar() {
  const target = targetCarPosition;
  controls.target.copy(target);
  camera.position.copy(target).add(isoOffset);
  controls.update();
}

function setFollow(enabled) {
  followCar = enabled;
  followToggle.classList.toggle("is-active", enabled);
  followToggle.textContent = enabled ? "Suivi" : "Libre";
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
  if (mode === "analysis" && analysis) {
    setFollow(false);
    fitPoints(analysis.trailPoints);
    return;
  }

  if (live.pointCount < 2) {
    setFollow(true);
    snapCameraToCar();
    return;
  }

  setFollow(false);
  fitPoints(live.points);
}

followToggle.addEventListener("click", () => setFollow(!followCar));
viewIsoButton.addEventListener("click", () => {
  setFollow(true);
  snapCameraToCar();
});
viewFitButton.addEventListener("click", () => {
  fitTrail();
});
clearTrailButton.addEventListener("click", () => {
  clearTrail();
});

fullscreenButton.addEventListener("click", () => {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
});

/* ------------------------------- Mise à jour télémétrie */

function renderLivePosition(position) {
  altitudeEl.textContent = String(Math.round(convertLength(position.y)));
  posXEl.textContent = String(Math.round(convertLength(position.x)));
  posZEl.textContent = String(Math.round(convertLength(position.z)));
}

function updateTelemetry(telemetry) {
  const isFirstPacket = !hasReceivedData;

  latest = telemetry;
  lastPacketAt = performance.now();
  hasReceivedData = true;

  // Piste 3D : alimentée même en mode analyse pour retrouver le direct au retour.
  const position = telemetry.position;
  if (Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)) {
    pushTrackPoint(telemetry);

    if (mode === "live") {
      targetCarPosition.set(position.x, Math.max(position.y, 0) + 2.5, position.z);

      const last = live.points[live.points.length - 2] ?? live.points[live.points.length - 1];
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

  // G-force : historique
  const gx = telemetry.acceleration.x / 9.81;
  const gz = telemetry.acceleration.z / 9.81;
  gHistory.push({ gx, gz, t: performance.now() });
  const cutoff = performance.now() - G_HISTORY_SECONDS * 1000;
  while (gHistory.length > 0 && gHistory[0].t < cutoff) {
    gHistory.shift();
  }

  if (isFirstPacket && mode === "live") {
    snapCameraToCar();
  }
}

/* ------------------------------- Instruments */

const shiftLightEls = [];
for (let i = 0; i < 10; i += 1) {
  const light = document.createElement("span");
  shiftLights.appendChild(light);
  shiftLightEls.push(light);
}

function sizeCanvas(canvasEl, ctx) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvasEl.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvasEl.width !== width || canvasEl.height !== height) {
    canvasEl.width = width;
    canvasEl.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

function drawGForce(current, trail) {
  const { width, height } = sizeCanvas(gforceCanvas, gforceCtx);
  const ctx = gforceCtx;
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

  gforceReadout.textContent = `${magnitude.toFixed(2)} g`;
  gforceReadout.style.color =
    magnitude > 1.8 ? TIRE_COLORS.overheat : magnitude > 1.2 ? "#ffb020" : "#7f8ea3";
}

function liveGForceTrail() {
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

function liveGForceCurrent() {
  if (!latest) return null;
  return { gx: latest.acceleration.x / 9.81, gz: latest.acceleration.z / 9.81 };
}

function renderInstruments(telemetry) {
  if (!smoothed.initialized) {
    smoothed.speed = telemetry.speed;
    smoothed.initialized = true;
  } else {
    smoothed.speed += (telemetry.speed - smoothed.speed) * 0.22;
  }

  const speedPrimary = Math.max(0, Math.round(convertSpeed(smoothed.speed)));
  const speedSecondary = Math.max(0, Math.round(convertSecondarySpeed(smoothed.speed)));
  speedEl.textContent = String(speedPrimary);
  speedSecondaryEl.textContent = String(speedSecondary);
  gearEl.textContent = gearLabel(telemetry.gear);

  const maxRpm = telemetry.engineMaxRpm > 1000 ? telemetry.engineMaxRpm : 8000;
  const ratio = clamp(telemetry.rpm / maxRpm, 0, 1);
  rpmArc.style.strokeDashoffset = String(ARC_CIRCUMFERENCE * (1 - ratio));

  const angle = ratio * Math.PI * 2;
  rpmCap.setAttribute("cx", String(120 + Math.cos(angle) * 100));
  rpmCap.setAttribute("cy", String(120 + Math.sin(angle) * 100));
  rpmCap.style.opacity = ratio > 0.01 ? "1" : "0";

  const litCount = Math.round(ratio * shiftLightEls.length);
  for (let i = 0; i < shiftLightEls.length; i += 1) {
    shiftLightEls[i].classList.toggle("on", i < litCount);
  }
  cluster.classList.toggle("shift-active", ratio >= SHIFT_THRESHOLD);

  rpmEl.textContent = Math.round(telemetry.rpm).toLocaleString(LOCALE);

  const throttle = telemetry.throttle / 255;
  const brake = telemetry.brake / 255;
  const clutch = telemetry.clutch / 255;
  throttleFill.style.height = `${(throttle * 100).toFixed(1)}%`;
  brakeFill.style.height = `${(brake * 100).toFixed(1)}%`;
  clutchFill.style.height = `${(clutch * 100).toFixed(1)}%`;
  throttleValue.textContent = `${Math.round(throttle * 100)}%`;
  brakeValue.textContent = `${Math.round(brake * 100)}%`;
  clutchValue.textContent = `${Math.round(clutch * 100)}%`;

  const temps = telemetry.tireTemp;
  const tireMap = [
    ["frontLeft", temps.frontLeft],
    ["frontRight", temps.frontRight],
    ["rearLeft", temps.rearLeft],
    ["rearRight", temps.rearRight],
  ];
  for (const [key, fahrenheit] of tireMap) {
    const element = tireEls[key];
    if (!element) continue;
    if (!fahrenheit || fahrenheit <= 0) {
      element.dataset.state = "cold";
      element.querySelector(".tire-temp").textContent = "—";
      continue;
    }
    const celsius = fahrenheitToCelsius(fahrenheit);
    element.dataset.state = tireState(celsius);
    element.querySelector(".tire-temp").textContent = formatTemperature(fahrenheit);
  }

  lapCurrentEl.textContent = formatLap(telemetry.currentLap);
  lapLastEl.textContent = formatLap(telemetry.lastLap);
  lapBestEl.textContent = formatLap(telemetry.bestLap);
  lapCountEl.textContent = `TOUR ${telemetry.lapNumber + 1}`;

  if (telemetry.lastLap > 0 && telemetry.bestLap > 0) {
    const delta = telemetry.lastLap - telemetry.bestLap;
    deltaValueEl.textContent = `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(3)}`;
    deltaEl.dataset.state = Math.abs(delta) < 0.05 ? "idle" : delta > 0 ? "positive" : "negative";
  } else {
    deltaValueEl.textContent = "—";
    deltaEl.dataset.state = "idle";
  }
}

/* ------------------------------- Sessions enregistrées */

let toastTimer = 0;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 4200);
}

function renderLapLegend(laps, interactive) {
  lapLegendEl.replaceChildren();

  for (const lap of laps) {
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
        if (!analysis) return;
        const index = Math.max(0, Math.min(lap.startSample, analysis.count - 1));
        selectSample(index);
      });
    }

    lapLegendEl.appendChild(chip);
  }
}

function makeStat(label, value) {
  const span = document.createElement("span");
  span.append(`${label} `);
  const strong = document.createElement("b");
  strong.textContent = value;
  span.appendChild(strong);
  return span;
}

function sessionRow(meta) {
  const row = document.createElement("div");
  row.className = "session-row";

  const main = document.createElement("div");
  main.className = "session-main";

  const date = document.createElement("span");
  date.className = "session-date";
  date.textContent = formatDateTime(meta.startedAt);

  const kind = document.createElement("span");
  kind.className = "session-kind";
  kind.textContent =
    meta.kind === "race"
      ? `Course · ${meta.lapCount} ${meta.lapCount > 1 ? "tours" : "tour"}`
      : "Balade libre";

  const laps = document.createElement("div");
  laps.className = "session-laps";
  for (const lap of meta.laps ?? []) {
    const stripe = document.createElement("i");
    stripe.style.setProperty("--lap-color", lapColorHex(lap.index));
    stripe.title = `Tour ${lap.number}${lap.time > 0 ? ` — ${formatLap(lap.time)}` : ""}`;
    laps.appendChild(stripe);
  }

  main.append(date, kind, laps);

  const stats = document.createElement("div");
  stats.className = "session-stats";
  stats.append(
    makeStat("Durée", formatLap(meta.duration)),
    makeStat("Meilleur", meta.bestLap > 0 ? formatLap(meta.bestLap) : "—"),
    makeStat("Distance", formatDistance(meta.distance)),
    makeStat("V. max", `${Math.round(convertSpeed(meta.maxSpeed))} ${speedUnit().toLowerCase()}`),
  );

  const actions = document.createElement("div");
  actions.className = "session-actions";

  const analyzeButton = document.createElement("button");
  analyzeButton.type = "button";
  analyzeButton.className = "btn";
  analyzeButton.dataset.action = "analyze";
  analyzeButton.dataset.id = meta.id;
  analyzeButton.textContent = "Analyser";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "btn danger";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.id = meta.id;
  deleteButton.textContent = "Supprimer";

  actions.append(analyzeButton, deleteButton);
  row.append(main, stats, actions);
  return row;
}

function renderSessionList(data) {
  const payload = data ?? lastSessionsPayload;
  const list = payload?.sessions ?? sessions;
  sessionsListEl.replaceChildren();

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "session-empty";
    empty.textContent =
      "Aucune session enregistrée pour l'instant. Roulez : l'enregistrement est automatique.";
    sessionsListEl.appendChild(empty);
    sessionsSummaryEl.textContent = "0 session";
    return;
  }

  const totalBytes = payload?.totalBytes ?? list.reduce((sum, meta) => sum + (meta.bytes || 0), 0);
  const keep = payload?.keep ?? 40;
  sessionsSummaryEl.textContent = `${list.length} session(s) · ${formatBytes(totalBytes)} · conservation : ${keep} max`;

  for (const meta of list) {
    sessionsListEl.appendChild(sessionRow(meta));
  }
}

async function refreshSessions({ render = true } = {}) {
  try {
    const response = await fetch("/sessions", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    sessions = Array.isArray(data.sessions) ? data.sessions : [];
    lastSessionsPayload = data;
    sessionsCountEl.textContent = String(sessions.length);
    if (render) renderSessionList(data);
    return data;
  } catch (error) {
    console.warn("Liste des sessions indisponible :", error);
    if (render) {
      sessionsListEl.replaceChildren();
      const empty = document.createElement("p");
      empty.className = "session-empty";
      empty.textContent = "Impossible de charger les sessions : serveur injoignable.";
      sessionsListEl.appendChild(empty);
      sessionsSummaryEl.textContent = "Serveur injoignable";
    }
    return null;
  }
}

function openSessions() {
  sessionsModal.hidden = false;
  refreshSessions();
}

function closeSessions() {
  sessionsModal.hidden = true;
}

async function deleteSession(id) {
  if (!window.confirm("Supprimer définitivement cette session enregistrée ?")) return;
  try {
    const response = await fetch(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
    if (analysis?.meta.id === id) exitAnalysis();
    await refreshSessions();
    showToast("Session supprimée");
  } catch (error) {
    console.warn("Suppression impossible :", error);
    showToast("Suppression impossible");
  }
}

sessionsButton.addEventListener("click", openSessions);
sessionsCloseButton.addEventListener("click", closeSessions);
sessionsRefreshButton.addEventListener("click", () => refreshSessions());
sessionsModal.addEventListener("click", (event) => {
  if (event.target === sessionsModal) closeSessions();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !sessionsModal.hidden) closeSessions();
});
sessionsListEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (!id) return;
  if (button.dataset.action === "analyze") {
    closeSessions();
    loadSession(id);
  } else if (button.dataset.action === "delete") {
    deleteSession(id);
  }
});

/* ------------------------------- Analyse d'une session */

const archiveGroup = new THREE.Group();
archiveGroup.visible = false;
scene.add(archiveGroup);

let analysisPreviousFollow = true;

function sampleValue(session, sample, key) {
  const index = session.fieldIndex.get(key);
  if (index === undefined) return 0;
  return session.data[sample * session.stride + index] ?? 0;
}

function parseSessionPayload(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12) throw new Error("Charge utile trop courte");
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "FH6S") {
    throw new Error("Format de session inconnu");
  }

  const view = new DataView(buffer);
  const headerLength = view.getUint32(4, true);
  const headerEnd = 8 + headerLength;
  if (headerEnd > bytes.length) throw new Error("En-tête tronqué");

  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, headerEnd)).trim());
  const dataOffset = headerEnd;
  if (dataOffset % 4 !== 0) throw new Error("Colonnes non alignées");

  const expected = header.count * header.stride;
  if (dataOffset + expected * 4 > bytes.length) throw new Error("Colonnes tronquées");

  const data = new Float32Array(buffer, dataOffset, expected);
  const fieldIndex = new Map();
  header.fields.forEach((field, index) => fieldIndex.set(field.key, index));

  return {
    meta: header.meta,
    header,
    count: header.count,
    stride: header.stride,
    data,
    fieldIndex,
    trailPoints: [],
    sampleIndex: 0,
  };
}

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

async function loadSession(id) {
  try {
    const response = await fetch(`/sessions/${encodeURIComponent(id)}/data`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const session = parseSessionPayload(await response.arrayBuffer());
    enterAnalysis(session);
  } catch (error) {
    console.error("Chargement de la session impossible :", error);
    showToast("Impossible de charger la session");
  }
}

function enterAnalysis(session) {
  if (analysis) exitAnalysis();

  analysis = session;
  mode = "analysis";
  analysisPreviousFollow = followCar;

  liveTrailGroup.visible = false;
  startRing.visible = false;
  archiveGroup.visible = true;
  carGroup.visible = true;

  buildArchiveTrail(session);

  analysisBar.hidden = false;
  analysisTitleEl.textContent =
    session.meta.kind === "race"
      ? `Course · ${session.meta.lapCount} ${session.meta.lapCount > 1 ? "tours" : "tour"} · ${formatClock(session.meta.duration)}`
      : `Balade · ${formatClock(session.meta.duration)}`;
  analysisRange.min = "0";
  analysisRange.max = String(Math.max(0.001, session.meta.duration));
  analysisRange.value = "0";
  analysisClockEl.textContent = "0:00.000";
  mapSubEl.textContent = "Session archivée · cliquez sur le tracé";
  clearTrailButton.disabled = true;
  inspectorEl.hidden = false;
  app.classList.add("is-analysis");

  setFollow(false);
  fitPoints(session.trailPoints);
  renderLapLegend(session.meta.laps ?? [], true);
  selectSample(0);
}

function exitAnalysis() {
  if (!analysis) return;

  disposeArchive();
  analysis = null;
  mode = "live";

  liveTrailGroup.visible = true;
  startRing.visible = live.pointCount > 0;

  analysisBar.hidden = true;
  inspectorEl.hidden = true;
  mapSubEl.textContent = "Position X / Y / Z en temps réel";
  clearTrailButton.disabled = false;
  app.classList.remove("is-analysis");
  renderLapLegend(liveLaps, false);

  setFollow(analysisPreviousFollow);
  smoothed.initialized = false;

  if (latest) {
    const position = latest.position;
    targetCarPosition.set(position.x, Math.max(position.y, 0) + 2.5, position.z);
    carGroup.position.copy(targetCarPosition);
  }

  drawGForce(liveGForceCurrent(), liveGForceTrail());
}

function sampleIndexForTime(session, time) {
  let low = 0;
  let high = session.count - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    const middleTime = session.data[middle * session.stride];
    if (middleTime < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function sampleToTelemetry(session, sample) {
  const get = (key) => sampleValue(session, sample, key);
  return {
    speed: get("speed"),
    gear: get("gear"),
    rpm: get("rpm"),
    engineMaxRpm: get("engineMaxRpm"),
    currentLap: get("lapTime"),
    lastLap: get("lastLap"),
    bestLap: get("bestLap"),
    lapNumber: get("lapNumber"),
    throttle: get("throttle"),
    brake: get("brake"),
    clutch: get("clutch"),
    tireTemp: {
      frontLeft: get("tireTempFL"),
      frontRight: get("tireTempFR"),
      rearLeft: get("tireTempRL"),
      rearRight: get("tireTempRR"),
    },
    acceleration: { x: get("accelX"), y: get("accelY"), z: get("accelZ") },
  };
}

function updateInspector(sample) {
  if (!analysis) return;
  const session = analysis;
  const get = (key) => sampleValue(session, sample, key);

  inspectorEls.lap.textContent = `TOUR ${get("lapNumber") + 1}`;
  inspectorEls.laptime.textContent = formatLap(get("lapTime"));
  inspectorEls.speed.textContent = String(
    Math.round(Math.max(0, convertSpeed(get("speed")))),
  );
  inspectorEls.gear.textContent = gearLabel(get("gear"));
  inspectorEls.rpm.textContent = Math.round(get("rpm")).toLocaleString(LOCALE);

  const throttle = get("throttle") / 255;
  const brake = get("brake") / 255;
  const clutch = get("clutch") / 255;
  inspectorEls.throttle.textContent = `${Math.round(throttle * 100)}%`;
  inspectorEls.brake.textContent = `${Math.round(brake * 100)}%`;
  inspectorEls.clutch.textContent = `${Math.round(clutch * 100)}%`;
  inspectorEls.steer.textContent = `${Math.round((get("steer") / 127) * 100)}%`;

  const tires = [
    ["frontLeft", "tireTempFL"],
    ["frontRight", "tireTempFR"],
    ["rearLeft", "tireTempRL"],
    ["rearRight", "tireTempRR"],
  ];
  for (const [key, field] of tires) {
    const element = inspectorEls.tires[key];
    if (!element) continue;
    const fahrenheit = get(field);
    const value = element.querySelector("b");
    if (!value) continue;
    if (!fahrenheit || fahrenheit <= 0) {
      element.dataset.state = "cold";
      value.textContent = "—";
      continue;
    }
    const celsius = fahrenheitToCelsius(fahrenheit);
    element.dataset.state = tireState(celsius);
    value.textContent = formatTemperature(fahrenheit);
  }

  inspectorEls.gx.textContent = (get("accelX") / 9.81).toFixed(2);
  inspectorEls.gz.textContent = (get("accelZ") / 9.81).toFixed(2);
  inspectorEls.alt.textContent = String(Math.round(convertLength(get("y"))));
  inspectorEls.x.textContent = String(Math.round(convertLength(get("x"))));
  inspectorEls.z.textContent = String(Math.round(convertLength(get("z"))));
  const position = get("racePosition");
  inspectorEls.position.textContent = position > 0 ? `P${Math.round(position)}` : "—";

  const raceTime = get("raceTime");
  const sessionTime = get("time");
  inspectorEls.clock.textContent = `Course ${raceTime > 0 ? formatLap(raceTime) : "—"} · ${formatClock(sessionTime)} de session`;
}

function selectSample(index) {
  if (!analysis) return;
  const session = analysis;
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
  updateInspector(sample);

  const time = session.data[sample * session.stride];
  analysisRange.value = String(time);
  analysisClockEl.textContent = formatClock(time);
  smoothed.initialized = false;
  smoothed.speed = sampleValue(session, sample, "speed");
  renderInstruments(sampleToTelemetry(session, sample));
}

function analysisGForce() {
  if (!analysis) return { current: null, trail: [] };
  const session = analysis;
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
  if (!analysis || mode !== "analysis") return;
  const rect = canvas.getBoundingClientRect();
  const projected = new THREE.Vector3();
  let bestSample = -1;
  let bestDistance = 18;

  for (const entry of analysis.trailPoints) {
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

let pickStart = null;
canvas.addEventListener("pointerdown", (event) => {
  pickStart = { x: event.clientX, y: event.clientY, at: performance.now() };
});
canvas.addEventListener("pointerup", (event) => {
  if (!pickStart) return;
  const moved = Math.hypot(event.clientX - pickStart.x, event.clientY - pickStart.y);
  const elapsed = performance.now() - pickStart.at;
  pickStart = null;
  if (mode === "analysis" && moved < 6 && elapsed < 600) {
    pickArchiveSample(event.clientX, event.clientY);
  }
});
canvas.addEventListener("pointerleave", () => {
  pickStart = null;
});

analysisExitButton.addEventListener("click", () => exitAnalysis());
analysisRange.addEventListener("input", () => {
  if (!analysis) return;
  selectSample(sampleIndexForTime(analysis, Number(analysisRange.value)));
});

unitsButton.addEventListener("click", () => {
  setUnitSystem(isImperial() ? "metric" : "imperial");
});

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
    mode === "analysis" ? true : live.pointCount > 0,
  );

  if (followCar) {
    const offset = camera.position.clone().sub(controls.target);
    controls.target.lerp(targetCarPosition, 0.1);
    camera.position.copy(controls.target).add(offset);
  }

  controls.update();
}

/* ------------------------------- Boucle de rendu */

const FRAME_INTERVAL_MS = 1000 / 60;
const FRAME_WATCHDOG_MS = 400;

let lastGForceDraw = 0;
let frameHandle = 0;
let frameUsesTimer = false;
let lastFrameAt = performance.now();

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
  const live = latest && now - lastPacketAt < IDLE_TIMEOUT;
  app.classList.toggle("is-live", Boolean(live) || mode === "analysis");

  if (mode === "analysis" && analysis) {
    if (now - lastGForceDraw > 33) {
      const gforce = analysisGForce();
      drawGForce(gforce.current, gforce.trail);
      lastGForceDraw = now;
    }
  } else if (live) {
    renderInstruments(latest);
    if (now - lastGForceDraw > 33) {
      drawGForce(liveGForceCurrent(), liveGForceTrail());
      lastGForceDraw = now;
    }
  }

  animateCarAndCamera();
  renderer.render(scene, camera);
  scheduleFrame();
}

/*
 * Certains navigateurs gèlent requestAnimationFrame quand la fenêtre est occultée
 * (OBS, second écran verrouillé, onglet en arrière-plan). Si aucun frame n'est
 * produit, on bascule sur setTimeout pour continuer à rafraîchir le HUD.
 */
setInterval(() => {
  if (performance.now() - lastFrameAt > FRAME_WATCHDOG_MS) {
    useTimerLoop();
  }
}, FRAME_WATCHDOG_MS);

/* ------------------------------- Redimensionnement */

function resizeRenderer() {
  const panel = canvas.parentElement;
  const width = panel.clientWidth;
  const height = panel.clientHeight;
  if (width === 0 || height === 0) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

const mapObserver = new ResizeObserver(resizeRenderer);
mapObserver.observe(canvas.parentElement);
resizeRenderer();

/* ------------------------------- Connexion SSE */

function setConnection(state, text) {
  conn.classList.toggle("is-live", state === "live");
  conn.classList.toggle("is-error", state === "error");
  statusEl.textContent = text;
}

function connect() {
  const source = new EventSource("/events");

  source.onopen = () => {
    setConnection("idle", "En attente du flux Data Out");
  };

  source.onmessage = (event) => {
    try {
      const telemetry = JSON.parse(event.data);
      updateTelemetry(telemetry);
      setConnection("live", "Data Out actif");
    } catch (error) {
      console.warn("Paquet invalide ignoré", error);
    }
  };

  source.addEventListener("session", (event) => {
    let meta;
    try {
      meta = JSON.parse(event.data);
    } catch {
      return;
    }
    const count = Number(sessionsCountEl.textContent) || 0;
    sessionsCountEl.textContent = String(count + 1);
    if (meta.kind === "race") {
      showToast(
        `Course enregistrée · ${meta.lapCount} tour(s) · meilleur ${meta.bestLap > 0 ? formatLap(meta.bestLap) : "—"}`,
      );
    } else {
      showToast("Balade enregistrée");
    }
    if (!sessionsModal.hidden) refreshSessions();
  });

  source.onerror = () => {
    setConnection("error", "Serveur injoignable — reconnexion…");
  };
}

async function loadHealth() {
  try {
    const response = await fetch("/health");
    if (!response.ok) return;
    const health = await response.json();
    udpInfo.textContent = `UDP ${health.udpPort}`;
  } catch {
    // Le flux SSE signalera déjà le problème.
  }
}

setInterval(() => {
  if (!latest) return;
  if (performance.now() - lastPacketAt >= IDLE_TIMEOUT) {
    setConnection("idle", "En attente du flux Data Out");
    if (performance.now() - lastPacketAt > 10_000) {
      latest = null;
      smoothed.initialized = false;
    }
  }
}, 400);

applyUnitLabels();
connect();
loadHealth();
refreshSessions({ render: false });
snapCameraToCar();
scheduleFrame();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    useRafLoop();
  }
});

/* Point d'inspection pour les tests (http://localhost:3000/?debug=1) */
if (new URLSearchParams(location.search).has("debug")) {
  window.__hud = {
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
    get latest() {
      return latest;
    },
    get followCar() {
      return followCar;
    },
    get mode() {
      return mode;
    },
    get analysis() {
      return analysis;
    },
    get sessions() {
      return sessions;
    },
    get livePoints() {
      return live.points;
    },
    get units() {
      return unitSystem;
    },
    setUnits: setUnitSystem,
    formatLength,
    formatTemperature,
    convertSpeed,
    selectSample,
    loadSession,
    exitAnalysis,
    refreshSessions,
  };
}
