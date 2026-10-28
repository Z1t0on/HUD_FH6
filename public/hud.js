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
const speedMphEl = $("speed-mph");
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
const posXEl = $("pos-x");
const posZEl = $("pos-z");

const followToggle = $("follow-toggle");
const viewIsoButton = $("view-iso");
const viewFitButton = $("view-fit");
const clearTrailButton = $("clear-trail");
const fullscreenButton = $("fullscreen");
const udpInfo = $("udp-info");

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

const TRACK_CAPACITY = 40000;
const TRACK_MIN_DISTANCE = 1.2;
const TRACK_TELEPORT_DISTANCE = 800;

const TIRE_COLORS = {
  cold: "#38bdf8",
  ideal: "#2ee6a8",
  hot: "#ffb020",
  overheat: "#ff3b3b",
};

/* ------------------------------- État */

let latest = null;
let lastPacketAt = 0;
let hasReceivedData = false;

const smoothed = { speed: 0, initialized: false };
const gHistory = [];

let trackPoints = [];
let trackCount = 0;
let trackBuffer = null;
let trackAttribute = null;
let trackGeometry = null;

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

trackBuffer = new Float32Array(TRACK_CAPACITY * 3);
trackGeometry = new THREE.BufferGeometry();
trackAttribute = new THREE.BufferAttribute(trackBuffer, 3);
trackAttribute.setUsage(THREE.DynamicDrawUsage);
trackGeometry.setAttribute("position", trackAttribute);
trackGeometry.setDrawRange(0, 0);

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

const trailGlow = new THREE.Points(
  trackGeometry,
  new THREE.PointsMaterial({
    map: makeDotTexture(),
    color: 0x00e5ff,
    size: 6,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false,
  }),
);
trailGlow.frustumCulled = false;
scene.add(trailGlow);

const trailHalo = new THREE.Points(
  trackGeometry,
  new THREE.PointsMaterial({
    map: makeDotTexture(),
    color: 0x00a8ff,
    size: 11,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false,
  }),
);
trailHalo.frustumCulled = false;
scene.add(trailHalo);

const trackLine = new THREE.Line(
  trackGeometry,
  new THREE.LineBasicMaterial({
    color: 0x9bf6ff,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }),
);
trackLine.frustumCulled = false;
scene.add(trackLine);

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

function pushTrackPoint(x, y, z) {
  const last = trackPoints[trackPoints.length - 1];
  if (last) {
    const distance = Math.hypot(x - last.x, y - last.y, z - last.z);
    if (distance < TRACK_MIN_DISTANCE) return;
    if (distance > TRACK_TELEPORT_DISTANCE) {
      clearTrail();
    }
  }

  if (trackCount >= TRACK_CAPACITY) {
    // On conserve la seconde moitié du tracé et on libère de la place
    const keep = Math.floor(TRACK_CAPACITY / 2);
    trackPoints = trackPoints.slice(-keep);
    trackCount = trackPoints.length;
    for (let i = 0; i < trackCount; i += 1) {
      const point = trackPoints[i];
      trackBuffer[i * 3] = point.x;
      trackBuffer[i * 3 + 1] = point.y + 0.6;
      trackBuffer[i * 3 + 2] = point.z;
    }
  }

  trackPoints.push({ x, y, z });
  const index = trackCount;
  trackBuffer[index * 3] = x;
  trackBuffer[index * 3 + 1] = y + 0.6;
  trackBuffer[index * 3 + 2] = z;
  trackCount += 1;

  if (trackCount === 1) {
    startRing.position.set(x, y + 0.6, z);
    startRing.visible = true;
  }

  trackGeometry.setDrawRange(0, trackCount);
  trackAttribute.needsUpdate = true;
}

function clearTrail() {
  trackPoints = [];
  trackCount = 0;
  trackGeometry.setDrawRange(0, 0);
  trackAttribute.needsUpdate = true;
  startRing.visible = false;
}

function updateAltitudeLine(x, y, z) {
  const positions = altitudeGeometry.getAttribute("position");
  positions.setXYZ(0, x, 0.2, z);
  positions.setXYZ(1, x, Math.max(y, 0.6), z);
  positions.needsUpdate = true;

  groundMark.position.set(x, 0.25, z);
  groundMark.visible = trackCount > 0;
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

function fitTrail() {
  if (trackCount < 2) {
    setFollow(true);
    snapCameraToCar();
    return;
  }

  setFollow(false);
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const entry of trackPoints) {
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

function updateTelemetry(telemetry) {
  const isFirstPacket = !hasReceivedData;

  latest = telemetry;
  lastPacketAt = performance.now();
  hasReceivedData = true;

  // Piste 3D
  const position = telemetry.position;
  if (Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)) {
    pushTrackPoint(position.x, position.y, position.z);
    targetCarPosition.set(position.x, Math.max(position.y, 0) + 2.5, position.z);

    const last = trackPoints[trackPoints.length - 2] ?? trackPoints[trackPoints.length - 1];
    if (last && telemetry.speed > 3) {
      const dx = position.x - last.x;
      const dz = position.z - last.z;
      if (Math.hypot(dx, dz) > 0.2) {
        targetHeading = Math.atan2(dx, dz);
      }
    }

    altitudeEl.textContent = position.y.toFixed(0);
    posXEl.textContent = position.x.toFixed(0);
    posZEl.textContent = position.z.toFixed(0);
  }

  // G-force : historique
  const gx = telemetry.acceleration.x / 9.81;
  const gz = telemetry.acceleration.z / 9.81;
  gHistory.push({ gx, gz, t: performance.now() });
  const cutoff = performance.now() - G_HISTORY_SECONDS * 1000;
  while (gHistory.length > 0 && gHistory[0].t < cutoff) {
    gHistory.shift();
  }

  if (isFirstPacket) {
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

function drawGForce() {
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

  if (!latest) return;

  const now = performance.now();
  for (let i = 1; i < gHistory.length; i += 1) {
    const previous = gHistory[i - 1];
    const point = gHistory[i];
    const age = now - point.t;
    const alpha = clamp(1 - age / (G_HISTORY_SECONDS * 1000), 0, 1) * 0.65;
    if (alpha <= 0) continue;
    ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + (previous.gx / G_SCALE) * radius, cy - (previous.gz / G_SCALE) * radius);
    ctx.lineTo(cx + (point.gx / G_SCALE) * radius, cy - (point.gz / G_SCALE) * radius);
    ctx.stroke();
  }

  const gx = latest.acceleration.x / 9.81;
  const gz = latest.acceleration.z / 9.81;
  const magnitude = Math.hypot(gx, gz);
  const dotX = cx + clamp(gx / G_SCALE, -1, 1) * radius;
  const dotY = cy - clamp(gz / G_SCALE, -1, 1) * radius;

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

function renderInstruments(telemetry) {
  if (!smoothed.initialized) {
    smoothed.speed = telemetry.speed;
    smoothed.initialized = true;
  } else {
    smoothed.speed += (telemetry.speed - smoothed.speed) * 0.22;
  }

  const speedKmh = Math.max(0, Math.round(smoothed.speed * 3.6));
  const speedMph = Math.max(0, Math.round(smoothed.speed * 2.23693629));
  speedEl.textContent = String(speedKmh);
  speedMphEl.textContent = String(speedMph);
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

  rpmEl.textContent = Math.round(telemetry.rpm).toLocaleString("fr-FR");

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
    element.querySelector(".tire-temp").textContent = `${Math.round(celsius)}°C`;
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

/* ------------------------------- Scène : animation */

function animateCarAndCamera() {
  carGroup.position.lerp(targetCarPosition, 0.2);
  currentHeading = lerpAngle(currentHeading, targetHeading, 0.18);
  carGroup.rotation.y = currentHeading;

  glowSprite.position.set(0, 5, 0);

  updateAltitudeLine(carGroup.position.x, carGroup.position.y, carGroup.position.z);

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
  app.classList.toggle("is-live", Boolean(live));

  if (live) {
    renderInstruments(latest);
    if (now - lastGForceDraw > 33) {
      drawGForce();
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

connect();
loadHealth();
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
    trackGeometry,
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
  };
}
