/**
 * Lecture des archives de session au format FH6S.
 *
 * Le serveur exporte les colonnes utiles sous forme de `Float32Array` aligné ;
 * ce module ne s'occupe que de la lecture, sans toucher au DOM ni à la scène.
 */

/** Valeur d'un champ pour un échantillon donné. */
export function sampleValue(session, sample, key) {
  const index = session.fieldIndex.get(key);
  if (index === undefined) return 0;
  return session.data[sample * session.stride + index] ?? 0;
}

/** Décode l'en-tête JSON puis les colonnes binaires d'une archive. */
export function parseSessionPayload(buffer) {
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

/** Index de l'échantillon le plus proche d'un temps de session (recherche dichotomique). */
export function sampleIndexForTime(session, time) {
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

/** Reconstruit un paquet de télémétrie à partir d'un échantillon d'archive. */
export function sampleToTelemetry(session, sample) {
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
    steer: get("steer"),
    tireTemp: {
      frontLeft: get("tireTempFL"),
      frontRight: get("tireTempFR"),
      rearLeft: get("tireTempRL"),
      rearRight: get("tireTempRR"),
    },
    acceleration: { x: get("accelX"), y: get("accelY"), z: get("accelZ") },
    position: { x: get("x"), y: get("y"), z: get("z") },
    racePosition: get("racePosition"),
    raceTime: get("raceTime"),
    sessionTime: get("time"),
  };
}
