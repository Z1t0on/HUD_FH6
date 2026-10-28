import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PACKET_SIZE, decodePacket } from "../src/telemetry/decode.js";
import { SessionStore, type SessionMeta } from "../src/telemetry/sessions.js";

interface PacketOptions {
  timestampMs: number;
  lapNumber?: number;
  x?: number;
  z?: number;
  speed?: number;
  lastLap?: number;
  currentLap?: number;
}

function makePacket(options: PacketOptions): Buffer {
  const buffer = Buffer.alloc(PACKET_SIZE);
  buffer.writeInt32LE(1, 0);
  buffer.writeUInt32LE(options.timestampMs, 4);
  buffer.writeInt32LE(42, 212);
  buffer.writeInt32LE(3, 216);
  buffer.writeInt32LE(800, 220);
  buffer.writeFloatLE(options.x ?? 0, 244);
  buffer.writeFloatLE(12, 248);
  buffer.writeFloatLE(options.z ?? 0, 252);
  buffer.writeFloatLE(options.speed ?? 0, 256);
  buffer.writeFloatLE(0, 296);
  buffer.writeFloatLE(options.lastLap ?? 0, 300);
  buffer.writeFloatLE(options.currentLap ?? 0, 304);
  buffer.writeUInt16LE(options.lapNumber ?? 0, 312);
  return buffer;
}

function makeStore(dir: string, options: { now: () => number; onFinalized?: (m: SessionMeta) => void }) {
  return new SessionStore({
    dir,
    now: options.now,
    gapMs: 4000,
    teleportMeters: 800,
    maxSessions: 40,
    onFinalized: options.onFinalized,
  });
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "hud-fh6-sessions-"));
}

test("enregistre les paquets bruts et les relit en colonnes", () => {
  const dir = tempDir();
  let clock = 10_000;
  const store = makeStore(dir, { now: () => clock });

  const packets = [
    makePacket({ timestampMs: 100_000, speed: 10 }),
    makePacket({ timestampMs: 100_016, speed: 20 }),
    makePacket({ timestampMs: 100_032, speed: 30 }),
  ];
  for (const packet of packets) {
    store.push(decodePacket(packet), packet);
    clock += 16;
  }
  store.close();

  const sessions = store.list();
  assert.equal(sessions.length, 1);
  const meta = sessions[0]!;
  assert.equal(meta.packets, 3);
  assert.equal(meta.kind, "free");
  assert.ok(Math.abs(meta.duration - 0.032) < 1e-6);

  const payload = store.read(meta.id);
  assert.ok(payload);
  assert.equal(payload.count, 3);
  assert.equal(payload.stride, payload.fields.length);

  const speedIndex = payload.fields.findIndex((field) => field.key === "speed");
  assert.ok(speedIndex >= 0);
  for (let sample = 0; sample < 3; sample += 1) {
    const value = payload.data[sample * payload.stride + speedIndex];
    assert.equal(value, (sample + 1) * 10);
  }

  rmSync(dir, { recursive: true, force: true });
});

test("détecte les tours et le meilleur tour", () => {
  const dir = tempDir();
  let clock = 10_000;
  const finalized: SessionMeta[] = [];
  const store = makeStore(dir, {
    now: () => clock,
    onFinalized: (meta) => finalized.push(meta),
  });

  const packets = [
    makePacket({ timestampMs: 200_000, lapNumber: 0, currentLap: 30 }),
    makePacket({ timestampMs: 200_016, lapNumber: 0, currentLap: 30.1 }),
    makePacket({ timestampMs: 200_032, lapNumber: 1, currentLap: 2, lastLap: 62.5 }),
    makePacket({ timestampMs: 200_048, lapNumber: 1, currentLap: 2.2 }),
  ];
  for (const packet of packets) {
    store.push(decodePacket(packet), packet);
    clock += 16;
  }
  clock += 100;
  store.close();

  assert.equal(finalized.length, 1);
  const meta = finalized[0]!;
  assert.equal(meta.kind, "race");
  assert.equal(meta.laps.length, 2);
  assert.equal(meta.laps[0]!.complete, true);
  assert.equal(meta.laps[0]!.time, 62.5);
  assert.equal(meta.laps[0]!.number, 1);
  assert.equal(meta.laps[1]!.complete, false);
  assert.equal(meta.bestLap, 62.5);

  rmSync(dir, { recursive: true, force: true });
});

test("coupe la session après une interruption du flux", () => {
  const dir = tempDir();
  let clock = 10_000;
  const store = makeStore(dir, { now: () => clock });

  const first = makePacket({ timestampMs: 300_000 });
  store.push(decodePacket(first), first);
  clock += 16;
  const second = makePacket({ timestampMs: 300_016, x: 10 });
  store.push(decodePacket(second), second);

  clock += 5000;
  const third = makePacket({ timestampMs: 305_000, x: 20 });
  store.push(decodePacket(third), third);
  clock += 16;
  store.close();

  const sessions = store.list();
  assert.equal(sessions.length, 2);
  assert.notEqual(sessions[0]!.id, sessions[1]!.id);

  rmSync(dir, { recursive: true, force: true });
});

test("coupe la session quand l'horodatage du jeu repart de zéro", () => {
  const dir = tempDir();
  let clock = 10_000;
  const store = makeStore(dir, { now: () => clock });

  const first = makePacket({ timestampMs: 500_000 });
  store.push(decodePacket(first), first);
  clock += 16;
  const second = makePacket({ timestampMs: 100 });
  store.push(decodePacket(second), second);
  clock += 16;
  store.close();

  assert.equal(store.list().length, 2);

  rmSync(dir, { recursive: true, force: true });
});

test("coupe la session sur une téléportation", () => {
  const dir = tempDir();
  let clock = 10_000;
  const store = makeStore(dir, { now: () => clock });

  const first = makePacket({ timestampMs: 600_000, x: 0, z: 0 });
  store.push(decodePacket(first), first);
  clock += 16;
  const second = makePacket({ timestampMs: 600_016, x: 2000, z: 2000 });
  store.push(decodePacket(second), second);
  clock += 16;
  store.close();

  assert.equal(store.list().length, 2);

  rmSync(dir, { recursive: true, force: true });
});

test("clôt une session inactive lors du balayage", () => {
  const dir = tempDir();
  let clock = 10_000;
  const store = makeStore(dir, { now: () => clock });

  const packet = makePacket({ timestampMs: 800_000, speed: 12 });
  store.push(decodePacket(packet), packet);
  assert.equal(store.list().length, 0);
  assert.ok(store.activeInfo);

  clock += 5000;
  store.sweep();

  assert.equal(store.list().length, 1);
  assert.equal(store.activeInfo, null);
  assert.equal(store.list()[0]!.packets, 1);

  rmSync(dir, { recursive: true, force: true });
});

test("récupère un fichier brut laissé par un arrêt brutal", () => {
  const dir = tempDir();
  const raw = Buffer.concat([
    makePacket({ timestampMs: 700_000, speed: 25 }),
    makePacket({ timestampMs: 700_016, speed: 26 }),
  ]);
  writeFileSync(join(dir, "test-recovery.raw"), raw);

  const store = makeStore(dir, { now: () => 20_000 });
  const sessions = store.list();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.id, "test-recovery");
  assert.equal(sessions[0]!.packets, 2);

  rmSync(dir, { recursive: true, force: true });
});
