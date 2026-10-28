import assert from "node:assert/strict";
import { test } from "node:test";
import { PACKET_SIZE, decodePacket, InvalidPacketError } from "../src/telemetry/decode.js";

function buildPacket(): Buffer {
  const buffer = Buffer.alloc(PACKET_SIZE);

  buffer.writeInt32LE(1, 0);
  buffer.writeUInt32LE(123_456, 4);
  buffer.writeFloatLE(8500, 8);
  buffer.writeFloatLE(850, 12);
  buffer.writeFloatLE(6200, 16);
  buffer.writeFloatLE(1.5, 20);
  buffer.writeFloatLE(9.81, 24);
  buffer.writeFloatLE(-3.25, 28);

  buffer.writeFloatLE(41.5, 256); // vitesse m/s
  buffer.writeFloatLE(210_000, 260); // puissance W
  buffer.writeFloatLE(480, 264); // couple N·m

  buffer.writeUInt32LE(7, 232); // carGroup
  buffer.writeFloatLE(1.25, 236); // smashableVelDiff
  buffer.writeFloatLE(130, 240); // smashableMass

  buffer.writeFloatLE(12.5, 244);
  buffer.writeFloatLE(0, 248);
  buffer.writeFloatLE(-88.25, 252);

  buffer.writeFloatLE(190, 268);
  buffer.writeFloatLE(192, 272);
  buffer.writeFloatLE(188, 276);
  buffer.writeFloatLE(189, 280);

  buffer.writeFloatLE(3.5, 284);
  buffer.writeFloatLE(0.4, 288);
  buffer.writeFloatLE(12_000, 292);
  buffer.writeFloatLE(62.4, 296);
  buffer.writeFloatLE(63.9, 300);
  buffer.writeFloatLE(12.2, 304);
  buffer.writeFloatLE(180.5, 308);

  buffer.writeUInt16LE(4, 312);
  buffer.writeUInt8(3, 314);
  buffer.writeUInt8(200, 315);
  buffer.writeUInt8(12, 316);
  buffer.writeUInt8(0, 317);
  buffer.writeUInt8(0, 318);
  buffer.writeUInt8(5, 319);
  buffer.writeInt8(-96, 320);
  buffer.writeInt8(42, 321);
  buffer.writeInt8(-7, 322);

  return buffer;
}

test("décode les champs essentiels correctement", () => {
  const telemetry = decodePacket(buildPacket());

  assert.equal(telemetry.isRaceOn, true);
  assert.equal(telemetry.timestampMs, 123_456);
  assert.equal(telemetry.rpm, 6200);
  assert.equal(telemetry.speed, 41.5);
  assert.equal(telemetry.gear, 5);
  assert.equal(telemetry.throttle, 200);
  assert.equal(telemetry.brake, 12);
  assert.equal(telemetry.steer, -96);
  assert.equal(telemetry.lapNumber, 4);
  assert.equal(telemetry.racePosition, 3);
  assert.equal(telemetry.tireTemp.frontLeft, 190);
});

test("lit les 3 champs propres à Horizon (FH6)", () => {
  const telemetry = decodePacket(buildPacket());

  assert.equal(telemetry.carGroup, 7);
  assert.equal(telemetry.smashableVelDiff, 1.25);
  assert.equal(telemetry.smashableMass, 130);
});

test("lit la position monde et les G-forces", () => {
  const telemetry = decodePacket(buildPacket());

  assert.deepEqual(telemetry.position, { x: 12.5, y: 0, z: -88.25 });
  // Les valeurs sont des float32 : comparaison avec tolérance
  const near = (actual: number, expected: number) =>
    assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);
  near(telemetry.acceleration.x, 1.5);
  near(telemetry.acceleration.y, 9.81);
  near(telemetry.acceleration.z, -3.25);
});

test("rejette un paquet de mauvaise taille", () => {
  assert.throws(() => decodePacket(Buffer.alloc(323)), InvalidPacketError);
  assert.throws(() => decodePacket(Buffer.alloc(331)), InvalidPacketError);
});

test("convertit un paquet de 324 octets sans erreur", () => {
  assert.doesNotThrow(() => decodePacket(Buffer.alloc(PACKET_SIZE)));
});
