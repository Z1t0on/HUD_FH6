/**
 * Décodage du paquet « Data Out » de Forza Horizon 6.
 *
 * Format : 324 octets, Little-Endian, format « Dash » d'Horizon.
 * Compatible à l'octet près avec le format v2 (FH4/FH5) ; FH6 renseigne en plus
 * CarGroup (232), SmashableVelDiff (236) et SmashableMass (240).
 *
 * Référence : Documentation/Créer un HUD pour FH6.md
 */

export const PACKET_SIZE = 324;

export interface WheelValues {
  frontLeft: number;
  frontRight: number;
  rearLeft: number;
  rearRight: number;
}

export interface Telemetry {
  isRaceOn: boolean;
  timestampMs: number;

  engineMaxRpm: number;
  engineIdleRpm: number;
  rpm: number;

  /** m/s², repère voiture : X = droite, Y = haut, Z = avant */
  acceleration: { x: number; y: number; z: number };
  /** m/s, repère voiture */
  velocity: { x: number; y: number; z: number };
  /** rad/s */
  angularVelocity: { x: number; y: number; z: number };
  /** radians */
  yaw: number;
  pitch: number;
  roll: number;

  suspensionNorm: WheelValues;
  tireSlipRatio: WheelValues;
  wheelRotationSpeed: WheelValues;
  wheelOnRumbleStrip: WheelValues;
  wheelInPuddle: WheelValues;
  surfaceRumble: WheelValues;
  tireSlipAngle: WheelValues;
  tireCombinedSlip: WheelValues;
  suspensionMeters: WheelValues;

  carOrdinal: number;
  /** 0 = D … 7 = X */
  carClass: number;
  /** 100 … 999 */
  performanceIndex: number;
  /** 0 = FWD, 1 = RWD, 2 = AWD */
  drivetrain: number;
  numCylinders: number;

  /** Champs propres à Horizon (FH6) */
  carGroup: number;
  smashableVelDiff: number;
  smashableMass: number;

  /** mètres */
  position: { x: number; y: number; z: number };
  /** m/s */
  speed: number;
  /** watts */
  power: number;
  /** N·m */
  torque: number;
  /** °F */
  tireTemp: WheelValues;
  /** PSI au-dessus de l'atmosphérique */
  boost: number;
  /** 0 = vide, 1 = plein */
  fuel: number;
  /** mètres */
  distanceTraveled: number;

  /** secondes ; 0 si non applicable */
  bestLap: number;
  lastLap: number;
  currentLap: number;
  currentRaceTime: number;

  lapNumber: number;
  racePosition: number;

  /** 0 … 255 */
  throttle: number;
  brake: number;
  clutch: number;
  handbrake: number;
  /** 0 = R, 1 = N, 2 = 1ère … */
  gear: number;
  /** -127 (gauche) … +127 (droite) */
  steer: number;
  normalizedDrivingLine: number;
  normalizedAiBrakeDifference: number;
}

export class InvalidPacketError extends Error {
  constructor(public readonly length: number) {
    super(`Taille de paquet invalide : ${length} octets (attendu : ${PACKET_SIZE})`);
    this.name = "InvalidPacketError";
  }
}

/** Décode un paquet UDP Forza Horizon 6. Lève InvalidPacketError si la taille est incorrecte. */
export function decodePacket(buffer: Buffer): Telemetry {
  if (buffer.length !== PACKET_SIZE) {
    throw new InvalidPacketError(buffer.length);
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const i32 = (offset: number) => view.getInt32(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u8 = (offset: number) => view.getUint8(offset);
  const i8 = (offset: number) => view.getInt8(offset);
  const f32 = (offset: number) => view.getFloat32(offset, true);
  const wheel = (offset: number): WheelValues => ({
    frontLeft: view.getFloat32(offset, true),
    frontRight: view.getFloat32(offset + 4, true),
    rearLeft: view.getFloat32(offset + 8, true),
    rearRight: view.getFloat32(offset + 12, true),
  });
  const wheelInt = (offset: number): WheelValues => ({
    frontLeft: i32(offset),
    frontRight: i32(offset + 4),
    rearLeft: i32(offset + 8),
    rearRight: i32(offset + 12),
  });

  return {
    isRaceOn: i32(0) === 1,
    timestampMs: u32(4),

    engineMaxRpm: f32(8),
    engineIdleRpm: f32(12),
    rpm: f32(16),

    acceleration: { x: f32(20), y: f32(24), z: f32(28) },
    velocity: { x: f32(32), y: f32(36), z: f32(40) },
    angularVelocity: { x: f32(44), y: f32(48), z: f32(52) },
    yaw: f32(56),
    pitch: f32(60),
    roll: f32(64),

    suspensionNorm: wheel(68),
    tireSlipRatio: wheel(84),
    wheelRotationSpeed: wheel(100),
    wheelOnRumbleStrip: wheelInt(116),
    wheelInPuddle: wheelInt(132),
    surfaceRumble: wheel(148),
    tireSlipAngle: wheel(164),
    tireCombinedSlip: wheel(180),
    suspensionMeters: wheel(196),

    carOrdinal: i32(212),
    carClass: i32(216),
    performanceIndex: i32(220),
    drivetrain: i32(224),
    numCylinders: i32(228),

    carGroup: u32(232),
    smashableVelDiff: f32(236),
    smashableMass: f32(240),

    position: { x: f32(244), y: f32(248), z: f32(252) },
    speed: f32(256),
    power: f32(260),
    torque: f32(264),
    tireTemp: wheel(268),
    boost: f32(284),
    fuel: f32(288),
    distanceTraveled: f32(292),

    bestLap: f32(296),
    lastLap: f32(300),
    currentLap: f32(304),
    currentRaceTime: f32(308),

    lapNumber: u16(312),
    racePosition: u8(314),

    throttle: u8(315),
    brake: u8(316),
    clutch: u8(317),
    handbrake: u8(318),
    gear: u8(319),
    steer: i8(320),
    normalizedDrivingLine: i8(321),
    normalizedAiBrakeDifference: i8(322),
  };
}
