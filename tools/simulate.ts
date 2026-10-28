/**
 * Simulateur de flux Data Out — permet de tester le HUD sans lancer FH6.
 * Envoie des paquets 324 octets à 60 Hz sur 127.0.0.1:<UDP_PORT|9999>.
 *
 * Simule un tour de circuit circulaire, des rapports, des températures de
 * pneus et des chronos cohérents.
 *
 * Usage : npm run sim
 */

import dgram from "node:dgram";
import { PACKET_SIZE } from "../src/telemetry/decode.js";

const PORT = Number(process.env.UDP_PORT ?? 9999);
const HOST = process.env.UDP_HOST ?? "127.0.0.1";

const socket = dgram.createSocket("udp4");
const started = Date.now();

const TRACK_RADIUS = 260; // mètres
const LAP_DURATION = 78; // secondes
const BEST_LAP = 74.312;
const GEAR_SPEEDS = [0, 12, 22, 33, 45, 58, 72, 90]; // m/s en début de rapport

let angle = 0;
let previousTime = 0;

function speedAt(t: number): number {
  // 28 à 78 m/s selon une sinusoïde lente (100 à 280 km/h)
  return 53 + 25 * Math.sin(t * 0.42) + 4 * Math.sin(t * 1.7);
}

function gearForSpeed(speedMs: number): number {
  for (let gear = 1; gear < GEAR_SPEEDS.length; gear += 1) {
    if (speedMs < GEAR_SPEEDS[gear]) return gear + 1;
  }
  return 7;
}

function celsiusToFahrenheit(celsius: number): number {
  return celsius * 1.8 + 32;
}

function buildPacket(t: number): Buffer {
  const buffer = Buffer.alloc(PACKET_SIZE);

  const dt = Math.max(0, t - previousTime);
  previousTime = t;

  const speedMs = speedAt(t);
  angle += (speedMs / TRACK_RADIUS) * dt;

  const throttle = clamp01(0.5 + 0.45 * Math.sin(t * 0.42 + 0.6));
  const brake = clamp01(Math.max(0, Math.sin(t * 0.42 + 3.4)) ** 5);
  const gear = gearForSpeed(speedMs);
  const bandLow = GEAR_SPEEDS[gear - 1];
  const bandHigh = GEAR_SPEEDS[gear] ?? 95;
  const gearRatio = clamp01((speedMs - bandLow) / Math.max(1, bandHigh - bandLow));
  const rpm = 2800 + gearRatio * 6200;

  const lateralG = (speedMs * speedMs) / TRACK_RADIUS / 9.81;
  const longitudinalG = (throttle - brake) * 0.55;

  const lapNumber = Math.floor(t / LAP_DURATION);
  const currentLap = t - lapNumber * LAP_DURATION;
  const lastLap = LAP_DURATION + 1.2 * Math.sin(lapNumber * 1.7);
  const raceTime = t;

  const tireBase = 88 + 9 * throttle - 5 * brake;
  const tireFrontLeft = tireBase + 4 + 2 * Math.sin(t * 0.2);
  const tireFrontRight = tireBase + 2 + 2 * Math.sin(t * 0.23 + 1);
  const tireRearLeft = tireBase - 2 + 2 * Math.sin(t * 0.27 + 2);
  const tireRearRight = tireBase - 3 + 2 * Math.sin(t * 0.31 + 3);

  buffer.writeInt32LE(1, 0);
  buffer.writeUInt32LE((Date.now() - started) >>> 0, 4);
  buffer.writeFloatLE(8800, 8);
  buffer.writeFloatLE(900, 12);
  buffer.writeFloatLE(rpm, 16);
  buffer.writeFloatLE(lateralG * 9.81 * 0.35, 20);
  buffer.writeFloatLE(9.81, 24);
  buffer.writeFloatLE(longitudinalG * 9.81, 28);

  buffer.writeFloatLE(Math.cos(angle) * speedMs, 32);
  buffer.writeFloatLE(0, 36);
  buffer.writeFloatLE(Math.sin(angle) * speedMs, 40);

  buffer.writeFloatLE(angle + Math.PI / 2, 56);

  const altitude = 45 + 18 * Math.sin(angle * 2.1) + 6 * Math.cos(angle * 5.3);

  buffer.writeFloatLE(TRACK_RADIUS * Math.cos(angle), 244);
  buffer.writeFloatLE(altitude, 248);
  buffer.writeFloatLE(TRACK_RADIUS * Math.sin(angle), 252);

  buffer.writeFloatLE(speedMs, 256);
  buffer.writeFloatLE(210_000, 260);
  buffer.writeFloatLE(480, 264);

  buffer.writeFloatLE(celsiusToFahrenheit(tireFrontLeft), 268);
  buffer.writeFloatLE(celsiusToFahrenheit(tireFrontRight), 272);
  buffer.writeFloatLE(celsiusToFahrenheit(tireRearLeft), 276);
  buffer.writeFloatLE(celsiusToFahrenheit(tireRearRight), 280);

  buffer.writeFloatLE(4.2, 284);
  buffer.writeFloatLE(0.62, 288);
  buffer.writeFloatLE(speedMs * t, 292);

  buffer.writeFloatLE(BEST_LAP, 296);
  buffer.writeFloatLE(lastLap, 300);
  buffer.writeFloatLE(currentLap, 304);
  buffer.writeFloatLE(raceTime, 308);

  buffer.writeUInt16LE(lapNumber, 312);
  buffer.writeUInt8(4, 314);
  buffer.writeUInt8(Math.round(throttle * 255), 315);
  buffer.writeUInt8(Math.round(brake * 255), 316);
  buffer.writeUInt8(0, 317);
  buffer.writeUInt8(0, 318);
  buffer.writeUInt8(gear, 319);
  buffer.writeInt8(Math.round(100 * Math.sin(t * 0.9)), 320);
  buffer.writeInt8(0, 321);
  buffer.writeInt8(0, 322);

  return buffer;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const timer = setInterval(() => {
  const t = (Date.now() - started) / 1000;
  socket.send(buildPacket(t), PORT, HOST, (error) => {
    if (error) console.error("[sim] envoi impossible :", error.message);
  });
}, 1000 / 60);

console.log(`[sim] envoi de paquets simulés vers ${HOST}:${PORT} (Ctrl+C pour arrêter)`);

process.on("SIGINT", () => {
  clearInterval(timer);
  socket.close();
  console.log("\n[sim] arrêté");
});
