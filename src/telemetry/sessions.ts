/**
 * Enregistrement des sessions de télémétrie.
 *
 * Chaque paquet brut de 324 octets reçu en UDP est écrit sur disque, sans
 * perte ni transformation : la session peut être rejouée plus tard avec
 * exactement les mêmes données que celles reçues du jeu.
 *
 * Une session est close automatiquement dans trois cas :
 *  - plus aucun paquet depuis `gapMs` (menu, pause, chargement, fin de course) ;
 *  - remise à zéro de l'horodatage du jeu (redémarrage, nouvelle instance) ;
 *  - téléportation de plus de `teleportMeters` (déplacement rapide, changement
 *    de zone). Les deux positions n'ont alors aucune continuité spatiale.
 *
 * À la clôture, une session qui n'a pas réellement roulé (moins de
 * `minDistanceMeters` parcourus, moins de `minPackets` paquets ou moins de
 * `minDurationSeconds` de données) est supprimée : les menus, l'atelier et les
 * arrêts au stand ne laissent donc aucune archive.
 *
 * L'enregistrement peut être suspendu à chaud (`setRecording`) et une session
 * peut être épinglée (`kept`) pour échapper à la purge automatique.
 *
 * Fichiers produits dans `data/sessions/` :
 *  - `<id>.raw`  : paquets de 324 octets concaténés (source de vérité) ;
 *  - `<id>.json` : métadonnées (date, durée, tours, meilleur tour, distance…).
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { PACKET_SIZE, decodePacket, type Telemetry } from "./decode.js";
import { ALL_FIELDS, ANALYSIS_FIELDS, SAMPLE_STRIDE, TIME_FIELD } from "./fields.js";

const DEFAULT_GAP_MS = 4000;
const DEFAULT_TELEPORT_METERS = 800;
const DEFAULT_MAX_SESSIONS = 40;
const TIMESTAMP_RESET_MS = 1000;
/** En dessous, la session n'a pas roulé : menus, atelier, arrêt au stand. */
const DEFAULT_MIN_DISTANCE_METERS = 30;
const DEFAULT_MIN_DURATION_SECONDS = 2;
const DEFAULT_MIN_PACKETS = 60;
const SAFE_ID = /^[A-Za-z0-9-]{1,80}$/;

export interface LapInfo {
  /** Index brut du tour (0 = « T1 »). */
  index: number;
  /** Numéro affiché, à partir de 1. */
  number: number;
  /** Durée du tour en secondes ; 0 si inconnue. */
  time: number;
  /** true si le tour a été bouclé avant la fin de la session. */
  complete: boolean;
  /** Indice du premier échantillon du tour dans la session. */
  startSample: number;
  /** Indice du dernier échantillon du tour dans la session. */
  endSample: number;
}

export interface SessionMeta {
  id: string;
  /** Horodatage mural (ms epoch) du premier paquet enregistré. */
  startedAt: number;
  /** Horodatage mural (ms epoch) de la fin de l'enregistrement. */
  endedAt: number;
  /** Durée en secondes d'après l'horodatage du jeu. */
  duration: number;
  packets: number;
  kind: "race" | "free";
  lapCount: number;
  bestLap: number;
  /** Distance parcourue en mètres (hors téléportations). */
  distance: number;
  /** Vitesse maximale en m/s. */
  maxSpeed: number;
  carOrdinal: number;
  carClass: number;
  performanceIndex: number;
  laps: LapInfo[];
  /** Taille du fichier brut en octets. */
  bytes: number;
  /** Épinglée : jamais supprimée par la purge automatique. */
  kept?: boolean;
}

export interface SessionPayload {
  meta: SessionMeta;
  fields: typeof ALL_FIELDS;
  count: number;
  stride: number;
  /** Colonnes row-major : `data[sample * stride + fieldIndex]`. */
  data: Float32Array;
}

export interface ActiveSessionInfo {
  id: string;
  startedAt: number;
  packets: number;
  duration: number;
}

export interface SessionStoreOptions {
  dir: string;
  maxSessions?: number;
  gapMs?: number;
  teleportMeters?: number;
  /** En dessous de cette distance, la session est jetée à la clôture. */
  minDistanceMeters?: number;
  minDurationSeconds?: number;
  minPackets?: number;
  /** Enregistrement actif au démarrage. */
  recording?: boolean;
  now?: () => number;
  onFinalized?: (meta: SessionMeta) => void;
}

export interface SessionStoreStats {
  recording: boolean;
  /** Sessions jetées faute de roulage depuis le démarrage. */
  discarded: number;
}

interface ActiveSession {
  id: string;
  startedAt: number;
  lastPacketAt: number;
  fd: number;
  bytes: number;
  packets: number;
  firstTimestampMs: number;
  lastTimestampMs: number;
  lastPosition: { x: number; y: number; z: number } | null;
  distance: number;
  maxSpeed: number;
  bestLap: number;
  hasLapData: boolean;
  currentLap: number;
  lapStartSample: number;
  laps: LapInfo[];
  lastTelemetry: Telemetry;
  carOrdinal: number;
  carClass: number;
  performanceIndex: number;
}

interface BuiltSession {
  meta: SessionMeta;
  count: number;
  stride: number;
  data: Float32Array | null;
}

function distanceBetween(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function makeId(now: number): string {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

function isSafeId(id: string): boolean {
  return SAFE_ID.test(id);
}

/**
 * Décode un fichier brut et reconstruit métadonnées et colonnes.
 * Utilisé à la lecture d'une session et à la récupération d'un fichier
 * orphelin (arrêt brutal du serveur).
 */
function buildSession(
  id: string,
  raw: Buffer,
  startedAt: number,
  endedAt: number,
  withColumns: boolean,
): BuiltSession {
  const count = Math.floor(raw.length / PACKET_SIZE);
  const stride = SAMPLE_STRIDE;
  const data = withColumns ? new Float32Array(count * stride) : null;

  const laps: LapInfo[] = [];
  let firstTimestampMs = 0;
  let lastTimestampMs = 0;
  let lastPosition: { x: number; y: number; z: number } | null = null;
  let distance = 0;
  let maxSpeed = 0;
  let bestLap = 0;
  let hasLapData = false;
  let currentLap = 0;
  let lapStartSample = 0;
  let lastTelemetry: Telemetry | null = null;
  let carOrdinal = 0;
  let carClass = 0;
  let performanceIndex = 0;

  for (let index = 0; index < count; index += 1) {
    const offset = index * PACKET_SIZE;
    const telemetry = decodePacket(raw.subarray(offset, offset + PACKET_SIZE));

    if (index === 0) {
      firstTimestampMs = telemetry.timestampMs;
      currentLap = telemetry.lapNumber;
      lapStartSample = 0;
      carOrdinal = telemetry.carOrdinal;
      carClass = telemetry.carClass;
      performanceIndex = telemetry.performanceIndex;
    } else if (telemetry.lapNumber !== currentLap) {
      const lapTime = telemetry.lastLap;
      const complete = lapTime > 0;
      if (complete) bestLap = bestLap > 0 ? Math.min(bestLap, lapTime) : lapTime;
      laps.push({
        index: currentLap,
        number: currentLap + 1,
        time: lapTime,
        complete,
        startSample: lapStartSample,
        endSample: index - 1,
      });
      currentLap = telemetry.lapNumber;
      lapStartSample = index;
    }

    if (telemetry.lapNumber > 0 || telemetry.lastLap > 0 || telemetry.bestLap > 0) {
      hasLapData = true;
    }

    if (lastPosition) {
      const step = distanceBetween(lastPosition, telemetry.position);
      if (step < DEFAULT_TELEPORT_METERS) distance += step;
    }
    lastPosition = telemetry.position;
    maxSpeed = Math.max(maxSpeed, telemetry.speed);
    lastTimestampMs = telemetry.timestampMs;

    if (data) {
      const base = index * stride;
      data[base] = (telemetry.timestampMs - firstTimestampMs) / 1000;
      for (let fieldIndex = 0; fieldIndex < ANALYSIS_FIELDS.length; fieldIndex += 1) {
        const field = ANALYSIS_FIELDS[fieldIndex];
        if (field) data[base + 1 + fieldIndex] = field.get(telemetry);
      }
    }

    lastTelemetry = telemetry;
  }

  if (lastTelemetry && count > 0) {
    laps.push({
      index: currentLap,
      number: currentLap + 1,
      time: lastTelemetry.currentLap,
      complete: false,
      startSample: lapStartSample,
      endSample: count - 1,
    });
  }

  const duration = count > 0 ? Math.max(0, (lastTimestampMs - firstTimestampMs) / 1000) : 0;

  return {
    count,
    stride,
    data,
    meta: {
      id,
      startedAt,
      endedAt,
      duration,
      packets: count,
      kind: hasLapData ? "race" : "free",
      lapCount: laps.length,
      bestLap: bestLap || lastTelemetry?.bestLap || 0,
      distance,
      maxSpeed,
      carOrdinal,
      carClass,
      performanceIndex,
      laps,
      bytes: raw.length,
    },
  };
}

export class SessionStore {
  readonly dir: string;
  private readonly maxSessions: number;
  private readonly gapMs: number;
  private readonly teleportMeters: number;
  private readonly minDistanceMeters: number;
  private readonly minDurationSeconds: number;
  private readonly minPackets: number;
  private readonly now: () => number;
  private readonly onFinalized?: (meta: SessionMeta) => void;
  private recordingEnabled: boolean;
  private discardedCount = 0;
  private active: ActiveSession | null = null;

  constructor(options: SessionStoreOptions) {
    this.dir = options.dir;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.gapMs = options.gapMs ?? DEFAULT_GAP_MS;
    this.teleportMeters = options.teleportMeters ?? DEFAULT_TELEPORT_METERS;
    this.minDistanceMeters = options.minDistanceMeters ?? DEFAULT_MIN_DISTANCE_METERS;
    this.minDurationSeconds = options.minDurationSeconds ?? DEFAULT_MIN_DURATION_SECONDS;
    this.minPackets = options.minPackets ?? DEFAULT_MIN_PACKETS;
    this.recordingEnabled = options.recording ?? true;
    this.now = options.now ?? Date.now;
    this.onFinalized = options.onFinalized;

    mkdirSync(this.dir, { recursive: true });
    this.recover();
    this.prune();
  }

  get recording(): boolean {
    return this.recordingEnabled;
  }

  get stats(): SessionStoreStats {
    return { recording: this.recordingEnabled, discarded: this.discardedCount };
  }

  /** Suspend ou reprend l'archivage à chaud (le direct n'est pas affecté). */
  setRecording(enabled: boolean): void {
    if (enabled === this.recordingEnabled) return;
    this.recordingEnabled = enabled;
    if (!enabled) this.finalize();
    console.log(`[sessions] enregistrement ${enabled ? "activé" : "suspendu"}`);
  }

  /** Épingle ou désépingle une session (les épinglées échappent à la purge). */
  setKept(id: string, kept: boolean): SessionMeta | null {
    if (!isSafeId(id)) return null;
    const metaPath = join(this.dir, `${id}.json`);
    if (!existsSync(metaPath)) return null;
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as SessionMeta;
      meta.kept = kept;
      writeFileSync(metaPath, JSON.stringify(meta));
      return meta;
    } catch (error) {
      console.error(`[sessions] épinglage impossible (${id}) :`, error);
      return null;
    }
  }

  /** true si la session a réellement roulé (distance, durée et volume suffisants). */
  private worthKeeping(distance: number, duration: number, packets: number): boolean {
    return (
      distance >= this.minDistanceMeters &&
      duration >= this.minDurationSeconds &&
      packets >= this.minPackets
    );
  }

  get activeInfo(): ActiveSessionInfo | null {
    const active = this.active;
    if (!active) return null;
    return {
      id: active.id,
      startedAt: active.startedAt,
      packets: active.packets,
      duration: Math.max(0, (active.lastTimestampMs - active.firstTimestampMs) / 1000),
    };
  }

  push(telemetry: Telemetry, raw: Buffer): void {
    const now = this.now();

    if (!this.recordingEnabled) {
      // Rien n'est écrit : on clôt la session ouverte pour ne pas la prolonger.
      if (this.active) this.finalize();
      return;
    }

    if (this.active && this.shouldRollover(this.active, telemetry, now)) {
      this.finalize();
    }
    if (!this.active) {
      this.start(telemetry, now);
    }

    const active = this.active;
    if (!active) return;

    try {
      writeSync(active.fd, raw);
    } catch (error) {
      console.error(`[sessions] écriture impossible (${active.id}) :`, error);
      this.finalize();
      return;
    }

    const sampleIndex = active.packets;
    active.packets += 1;
    active.bytes += raw.length;
    active.lastPacketAt = now;
    active.lastTimestampMs = telemetry.timestampMs;
    active.lastTelemetry = telemetry;
    active.maxSpeed = Math.max(active.maxSpeed, telemetry.speed);
    active.hasLapData =
      active.hasLapData || telemetry.lapNumber > 0 || telemetry.lastLap > 0 || telemetry.bestLap > 0;

    if (sampleIndex > 0 && telemetry.lapNumber !== active.currentLap) {
      const lapTime = telemetry.lastLap;
      const complete = lapTime > 0;
      if (complete) {
        active.bestLap = active.bestLap > 0 ? Math.min(active.bestLap, lapTime) : lapTime;
      }
      active.laps.push({
        index: active.currentLap,
        number: active.currentLap + 1,
        time: lapTime,
        complete,
        startSample: active.lapStartSample,
        endSample: sampleIndex - 1,
      });
      active.currentLap = telemetry.lapNumber;
      active.lapStartSample = sampleIndex;
    }

    if (active.lastPosition) {
      const step = distanceBetween(active.lastPosition, telemetry.position);
      if (step < this.teleportMeters) active.distance += step;
    }
    active.lastPosition = { ...telemetry.position };
  }

  /** Liste les sessions terminées, de la plus récente à la plus ancienne. */
  list(): SessionMeta[] {
    const metas: SessionMeta[] = [];
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const meta = JSON.parse(readFileSync(join(this.dir, file), "utf8")) as SessionMeta;
        if (meta && typeof meta.id === "string" && isSafeId(meta.id)) metas.push(meta);
      } catch (error) {
        console.warn(`[sessions] métadonnées illisibles (${file}) :`, error);
      }
    }
    metas.sort((a, b) => b.startedAt - a.startedAt);
    return metas;
  }

  /** Charge une session et la convertit en colonnes pour le navigateur. */
  read(id: string): SessionPayload | null {
    if (!isSafeId(id)) return null;
    const metaPath = join(this.dir, `${id}.json`);
    const rawPath = join(this.dir, `${id}.raw`);
    if (!existsSync(metaPath) || !existsSync(rawPath)) return null;

    try {
      const stored = JSON.parse(readFileSync(metaPath, "utf8")) as SessionMeta;
      const raw = readFileSync(rawPath);
      const built = buildSession(id, raw, stored.startedAt, stored.endedAt, true);
      if (!built.data) return null;
      return {
        meta: built.meta,
        fields: [TIME_FIELD, ...ALL_FIELDS.slice(1)],
        count: built.count,
        stride: built.stride,
        data: built.data,
      };
    } catch (error) {
      console.error(`[sessions] lecture impossible (${id}) :`, error);
      return null;
    }
  }

  remove(id: string): boolean {
    if (!isSafeId(id)) return false;
    let removed = false;
    for (const ext of ["raw", "json"]) {
      const filePath = join(this.dir, `${id}.${ext}`);
      if (!existsSync(filePath)) continue;
      try {
        unlinkSync(filePath);
        removed = true;
      } catch (error) {
        console.error(`[sessions] suppression impossible (${filePath}) :`, error);
      }
    }
    return removed;
  }

  /** Clôt la session en cours (appelé à l'arrêt du serveur). */
  close(): void {
    this.finalize();
  }

  /** Clôt la session si plus aucun paquet n'est arrivé depuis `gapMs`. */
  sweep(): void {
    if (this.active && this.now() - this.active.lastPacketAt > this.gapMs) {
      this.finalize();
    }
  }

  private start(telemetry: Telemetry, now: number): void {
    const id = makeId(now);
    const filePath = join(this.dir, `${id}.raw`);
    const fd = openSync(filePath, "wx");
    this.active = {
      id,
      startedAt: now,
      lastPacketAt: now,
      fd,
      bytes: 0,
      packets: 0,
      firstTimestampMs: telemetry.timestampMs,
      lastTimestampMs: telemetry.timestampMs,
      lastPosition: null,
      distance: 0,
      maxSpeed: 0,
      bestLap: 0,
      hasLapData: telemetry.lapNumber > 0 || telemetry.lastLap > 0 || telemetry.bestLap > 0,
      currentLap: telemetry.lapNumber,
      lapStartSample: 0,
      laps: [],
      lastTelemetry: telemetry,
      carOrdinal: telemetry.carOrdinal,
      carClass: telemetry.carClass,
      performanceIndex: telemetry.performanceIndex,
    };
  }

  private shouldRollover(active: ActiveSession, telemetry: Telemetry, now: number): boolean {
    if (now - active.lastPacketAt > this.gapMs) return true;
    if (telemetry.timestampMs + TIMESTAMP_RESET_MS < active.lastTimestampMs) return true;
    if (active.lastPosition) {
      const step = distanceBetween(active.lastPosition, telemetry.position);
      if (step > this.teleportMeters) return true;
    }
    return false;
  }

  private finalize(): void {
    const active = this.active;
    if (!active) return;
    this.active = null;

    if (active.packets > 0) {
      const last = active.lastTelemetry;
      active.laps.push({
        index: active.currentLap,
        number: active.currentLap + 1,
        time: last.currentLap,
        complete: false,
        startSample: active.lapStartSample,
        endSample: active.packets - 1,
      });
    }

    try {
      closeSync(active.fd);
    } catch (error) {
      console.error(`[sessions] fermeture impossible (${active.id}) :`, error);
    }

    if (active.packets === 0) {
      try {
        unlinkSync(join(this.dir, `${active.id}.raw`));
      } catch {
        // Le fichier vide n'a aucune valeur, l'échec est sans conséquence.
      }
      return;
    }

    const duration = Math.max(0, (active.lastTimestampMs - active.firstTimestampMs) / 1000);

    // Menus, atelier, arrêt au stand : aucun roulage réel, rien à archiver.
    if (!this.worthKeeping(active.distance, duration, active.packets)) {
      this.discardedCount += 1;
      try {
        unlinkSync(join(this.dir, `${active.id}.raw`));
      } catch (error) {
        console.error(`[sessions] suppression impossible (${active.id}) :`, error);
      }
      console.log(
        `[sessions] session ignorée : ${active.distance.toFixed(0)} m, ` +
          `${duration.toFixed(1)} s, ${active.packets} paquets`,
      );
      return;
    }

    const meta: SessionMeta = {
      id: active.id,
      startedAt: active.startedAt,
      endedAt: active.lastPacketAt,
      duration,
      packets: active.packets,
      kind: active.hasLapData ? "race" : "free",
      lapCount: active.laps.length,
      bestLap: active.bestLap || active.lastTelemetry.bestLap || 0,
      distance: active.distance,
      maxSpeed: active.maxSpeed,
      carOrdinal: active.carOrdinal,
      carClass: active.carClass,
      performanceIndex: active.performanceIndex,
      laps: active.laps,
      bytes: active.bytes,
    };

    try {
      writeFileSync(join(this.dir, `${active.id}.json`), JSON.stringify(meta));
    } catch (error) {
      console.error(`[sessions] métadonnées non écrites (${active.id}) :`, error);
    }

    this.prune();
    this.onFinalized?.(meta);
  }

  /** Récupère les fichiers `.raw` laissés par un arrêt brutal du serveur. */
  private recover(): void {
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith(".raw")) continue;
      const id = file.slice(0, -4);
      if (!isSafeId(id)) continue;
      const rawPath = join(this.dir, file);
      const metaPath = join(this.dir, `${id}.json`);
      if (existsSync(metaPath)) continue;

      try {
        const raw = readFileSync(rawPath);
        const endedAt = Math.round(statSync(rawPath).mtimeMs);
        const built = buildSession(id, raw, endedAt, endedAt, false);
        if (built.count === 0 || !this.worthKeeping(built.meta.distance, built.meta.duration, built.count)) {
          unlinkSync(rawPath);
          continue;
        }
        built.meta.startedAt = Math.round(endedAt - built.meta.duration * 1000);
        writeFileSync(metaPath, JSON.stringify(built.meta));
        console.log(`[sessions] session récupérée : ${id} (${built.count} paquets)`);
      } catch (error) {
        console.warn(`[sessions] récupération impossible (${file}) :`, error);
      }
    }
  }

  /**
   * Purge les sessions les plus anciennes.
   *
   * Les sessions épinglées ne sont jamais supprimées : seules les
   * `maxSessions` plus récentes **non épinglées** sont conservées, les autres
   * sont effacées de la plus ancienne à la plus récente.
   */
  private prune(): void {
    const removable = this.list().filter((meta) => !meta.kept);
    if (removable.length <= this.maxSessions) return;
    for (const meta of removable.slice(this.maxSessions)) {
      this.remove(meta.id);
    }
  }
}
