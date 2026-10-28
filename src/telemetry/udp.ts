import dgram from "node:dgram";
import { decodePacket, InvalidPacketError, type Telemetry } from "./decode.js";

export interface ListenerOptions {
  port: number;
  host?: string;
}

export interface TelemetryListener {
  close(): void;
  readonly port: number;
}

/**
 * Écoute le flux Data Out de Forza Horizon 6.
 * Configurer dans le jeu : Data Out ON, IP du PC qui exécute le HUD
 * (127.0.0.1 en local), port identique (9999 par défaut).
 */
export function listenTelemetry(
  options: ListenerOptions,
  onTelemetry: (telemetry: Telemetry) => void,
): TelemetryListener {
  const { port, host = "0.0.0.0" } = options;
  const socket = dgram.createSocket("udp4");

  let invalidPackets = 0;

  socket.on("message", (message) => {
    try {
      onTelemetry(decodePacket(message));
    } catch (error) {
      invalidPackets += 1;
      if (error instanceof InvalidPacketError) {
        console.warn(
          `[udp] paquet ignoré (${error.length} octets) — total ignorés : ${invalidPackets}`,
        );
      } else {
        console.error("[udp] erreur de décodage :", error);
      }
    }
  });

  socket.on("error", (error) => {
    console.error(`[udp] erreur socket sur le port ${port} :`, error.message);
  });

  socket.bind(port, host, () => {
    console.log(`[udp] en écoute sur ${host}:${port} (Data Out à configurer sur ce port)`);
  });

  return {
    port,
    close: () => socket.close(),
  };
}
