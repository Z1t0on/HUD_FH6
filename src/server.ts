import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Telemetry } from "./telemetry/decode.js";
import { SessionStore } from "./telemetry/sessions.js";
import { listenTelemetry } from "./telemetry/udp.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PUBLIC_DIR = join(ROOT, "public");
const THREE_DIR = join(ROOT, "node_modules", "three");
const SESSIONS_DIR = process.env.HUD_SESSIONS_DIR ?? join(ROOT, "data", "sessions");

const HTTP_PORT = Number(process.env.HUD_PORT ?? 3000);
const UDP_PORT = Number(process.env.UDP_PORT ?? 9999);
const SESSION_KEEP = Number(process.env.HUD_SESSION_KEEP ?? 40);

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
  onFinalized: (meta) => broadcastToClients("session", meta),
});

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
      }),
    );
    return;
  }

  if (url.pathname === "/sessions" && req.method === "GET") {
    const sessions = sessionStore.list();
    const totalBytes = sessions.reduce((sum, meta) => sum + (meta.bytes || 0), 0);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(
      JSON.stringify({
        sessions,
        active: sessionStore.activeInfo,
        totalBytes,
        keep: SESSION_KEEP,
      }),
    );
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
});

server.listen(HTTP_PORT, () => {
  console.log(`[hud] dashboard sur http://localhost:${HTTP_PORT}`);
  console.log(`[hud] état du flux : http://localhost:${HTTP_PORT}/health`);
  console.log(`[hud] sessions enregistrées dans ${SESSIONS_DIR} (max ${SESSION_KEEP})`);
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
