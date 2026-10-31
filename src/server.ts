import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Telemetry } from "./telemetry/decode.js";
import { SessionStore } from "./telemetry/sessions.js";
import { listenTelemetry } from "./telemetry/udp.js";

/** Vrai dans l'exécutable Windows produit par pkg (snapshot en lecture seule). */
const IS_PACKAGED = Boolean((process as typeof process & { pkg?: unknown }).pkg);

/** `__dirname` vient du bundle CommonJS ; en ESM on repart de `import.meta.url`. */
const MODULE_DIR =
  typeof __dirname === "string" ? __dirname : dirname(fileURLToPath(import.meta.url));

/** Ressources embarquées : racine du projet en dev, snapshot pkg dans l'exécutable. */
const APP_ROOT = resolve(MODULE_DIR, "..");
/** Données modifiables : à côté de l'exécutable en version packagée. */
const DATA_ROOT = IS_PACKAGED ? dirname(process.execPath) : APP_ROOT;

const PUBLIC_DIR = join(APP_ROOT, "public");
/** Three.js servi au navigateur : copie figée (vendor/) ou node_modules en dev. */
const VENDOR_DIR = join(APP_ROOT, "vendor", "three");
const THREE_DIR = existsSync(join(VENDOR_DIR, "build"))
  ? VENDOR_DIR
  : join(APP_ROOT, "node_modules", "three");
const SESSIONS_DIR = process.env.HUD_SESSIONS_DIR ?? join(DATA_ROOT, "data", "sessions");
const SETTINGS_PATH = join(DATA_ROOT, "data", "settings.json");

const HTTP_PORT = Number(process.env.HUD_PORT ?? 3000);
const UDP_PORT = Number(process.env.UDP_PORT ?? 9999);
const SESSION_KEEP = Number(process.env.HUD_SESSION_KEEP ?? 40);
/** Seuils de roulage : en dessous, la session n'est pas archivée. */
const SESSION_MIN_DISTANCE = Number(process.env.HUD_SESSION_MIN_DISTANCE ?? 30);
const SESSION_MIN_DURATION = Number(process.env.HUD_SESSION_MIN_DURATION ?? 2);
const SESSION_MIN_PACKETS = Number(process.env.HUD_SESSION_MIN_PACKETS ?? 60);

interface HudSettings {
  /** Archivage des sessions activé (préférence persistée à côté des données). */
  recording: boolean;
}

function readSettings(): HudSettings {
  const fallback: HudSettings = { recording: process.env.HUD_RECORD !== "0" };
  try {
    const raw = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as Partial<HudSettings>;
    return { recording: raw.recording !== false };
  } catch {
    return fallback;
  }
}

function writeSettings(settings: HudSettings): void {
  try {
    mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error("[hud] préférences non enregistrées :", error);
  }
}

const settings = readSettings();

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

/** Clients SSE connectés (overlay navigateur). */
const clients = new Set<ServerResponse>();
let lastPacketAt = 0;
let packetCount = 0;

function broadcastToClients(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

const sessionStore = new SessionStore({
  dir: SESSIONS_DIR,
  maxSessions: SESSION_KEEP,
  minDistanceMeters: SESSION_MIN_DISTANCE,
  minDurationSeconds: SESSION_MIN_DURATION,
  minPackets: SESSION_MIN_PACKETS,
  recording: settings.recording,
  onFinalized: (meta) => broadcastToClients("session", meta),
});

/** Lit un petit corps JSON (POST) sans dépendance externe. */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("corps de requête trop volumineux");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  const parsed: unknown = JSON.parse(text);
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

/** Sans ce balayage, une session resterait ouverte après la fin du flux. */
const sessionSweep = setInterval(() => sessionStore.sweep(), 2000);
sessionSweep.unref();

const listener = listenTelemetry({ port: UDP_PORT }, (telemetry: Telemetry, raw: Buffer) => {
  lastPacketAt = Date.now();
  packetCount += 1;

  sessionStore.push(telemetry, raw);

  // Diffusion aux overlays ; les clients lents sont ignorés plutôt que bloquants.
  const payload = `data: ${JSON.stringify(telemetry)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
});

function sendFile(res: ServerResponse, filePath: string): void {
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

/** Vérifie qu'un chemin résolu reste bien sous le dossier parent. */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Sert Three.js depuis node_modules (pas de bundler nécessaire). */
function resolveVendor(pathname: string): string | null {
  let base: string;
  let rest: string;

  if (pathname.startsWith("/vendor/build/")) {
    base = join(THREE_DIR, "build");
    rest = pathname.slice("/vendor/build/".length);
  } else if (pathname.startsWith("/vendor/addons/")) {
    base = join(THREE_DIR, "examples", "jsm");
    rest = pathname.slice("/vendor/addons/".length);
  } else {
    return null;
  }

  const filePath = resolve(base, rest);
  return isInside(base, filePath) ? filePath : null;
}

function localAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry !== undefined && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry!.address);
}

const server = createServer((req, res) => {
  void handleRequest(req, res);
});

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        udpPort: UDP_PORT,
        packets: packetCount,
        lastPacketAgoMs: lastPacketAt ? Date.now() - lastPacketAt : null,
        clients: clients.size,
        sessions: sessionStore.list().length,
        activeSession: sessionStore.activeInfo,
        recording: sessionStore.recording,
        discarded: sessionStore.stats.discarded,
      }),
    );
    return;
  }

  if (url.pathname === "/recording" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      if (typeof body.enabled !== "boolean") {
        sendJson(res, 400, { error: "champ 'enabled' (booléen) attendu" });
        return;
      }
      sessionStore.setRecording(body.enabled);
      settings.recording = body.enabled;
      writeSettings(settings);
      broadcastToClients("recording", sessionStore.stats);
      sendJson(res, 200, sessionStore.stats);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "requête invalide" });
    }
    return;
  }

  if (url.pathname === "/sessions" && req.method === "GET") {
    const sessions = sessionStore.list();
    const totalBytes = sessions.reduce((sum, meta) => sum + (meta.bytes || 0), 0);
    sendJson(res, 200, {
      sessions,
      active: sessionStore.activeInfo,
      totalBytes,
      keep: SESSION_KEEP,
      kept: sessions.filter((meta) => meta.kept).length,
      recording: sessionStore.recording,
      discarded: sessionStore.stats.discarded,
    });
    return;
  }

  const dataMatch = url.pathname.match(/^\/sessions\/([A-Za-z0-9-]+)\/data$/);
  if (dataMatch && req.method === "GET") {
    const id = dataMatch[1];
    const payload = id ? sessionStore.read(id) : null;
    if (!payload) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Session introuvable");
      return;
    }

    const header = {
      version: 1,
      id: payload.meta.id,
      meta: payload.meta,
      fields: payload.fields,
      count: payload.count,
      stride: payload.stride,
      littleEndian: true,
    };

    let headerBuffer = Buffer.from(JSON.stringify(header), "utf8");
    const padding = (4 - (headerBuffer.length % 4)) % 4;
    if (padding > 0) {
      headerBuffer = Buffer.concat([headerBuffer, Buffer.alloc(padding, 0x20)]);
    }

    const body = Buffer.alloc(8 + headerBuffer.length + payload.data.byteLength);
    body.write("FH6S", 0, "ascii");
    body.writeUInt32LE(headerBuffer.length, 4);
    headerBuffer.copy(body, 8);
    Buffer.from(payload.data.buffer, payload.data.byteOffset, payload.data.byteLength).copy(
      body,
      8 + headerBuffer.length,
    );

    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
    });
    res.end(body);
    return;
  }

  const keepMatch = url.pathname.match(/^\/sessions\/([A-Za-z0-9-]+)\/keep$/);
  if (keepMatch && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      if (typeof body.kept !== "boolean") {
        sendJson(res, 400, { error: "champ 'kept' (booléen) attendu" });
        return;
      }
      const id = keepMatch[1];
      const meta = id ? sessionStore.setKept(id, body.kept) : null;
      if (!meta) {
        sendJson(res, 404, { error: "session introuvable" });
        return;
      }
      broadcastToClients("sessions", { updated: meta.id, kept: meta.kept === true });
      sendJson(res, 200, meta);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "requête invalide" });
    }
    return;
  }

  const deleteMatch = url.pathname.match(/^\/sessions\/([A-Za-z0-9-]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    const id = deleteMatch[1];
    const removed = id ? sessionStore.remove(id) : false;
    res.writeHead(removed ? 200 : 404, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ removed }));
    return;
  }

  const relative = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(
    /^([/\\])+/,
    "",
  );
  const filePath = join(PUBLIC_DIR, relative);

  if (isInside(PUBLIC_DIR, filePath) && existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }

  const vendorFile = resolveVendor(url.pathname);
  if (vendorFile && existsSync(vendorFile) && statSync(vendorFile).isFile()) {
    sendFile(res, vendorFile);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

server.listen(HTTP_PORT, () => {
  console.log(`[hud] dashboard sur http://localhost:${HTTP_PORT}`);
  console.log(`[hud] état du flux : http://localhost:${HTTP_PORT}/health`);
  console.log(
    `[hud] sessions enregistrées dans ${SESSIONS_DIR} (max ${SESSION_KEEP}, ` +
      `archivage ${sessionStore.recording ? "actif" : "suspendu"})`,
  );
  console.log(
    `[hud] seuils d'archivage : ${SESSION_MIN_DISTANCE} m, ${SESSION_MIN_DURATION} s, ${SESSION_MIN_PACKETS} paquets`,
  );
  const addresses = localAddresses();
  if (addresses.length > 0) {
    console.log(
      `[hud] IP locale(s) à saisir dans Forza (Data Out IP) : ${addresses.join(", ")} — port UDP ${UDP_PORT}`,
    );
  } else {
    console.log("[hud] aucune IP locale détectée (réseau indisponible ?)");
  }
});

function shutdown(): void {
  console.log("\n[hud] arrêt…");
  clearInterval(sessionSweep);
  listener.close();
  sessionStore.close();
  server.close(() => process.exit(0));
  for (const client of clients) client.end();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
