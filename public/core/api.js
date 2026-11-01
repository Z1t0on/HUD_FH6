/** Accès REST au serveur HUD (santé, sessions, archivage). */

async function readJson(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** Port UDP réellement écouté, pour l'afficher dans la barre supérieure. */
export async function fetchHealth() {
  const response = await fetch("/health", { cache: "no-store" });
  return readJson(response);
}

/** Liste des sessions archivées avec leurs statistiques. */
export async function fetchSessions() {
  const response = await fetch("/sessions", { cache: "no-store" });
  return readJson(response);
}

/** Télécharge une session archivée (format binaire FH6S). */
export async function fetchSessionData(id) {
  const response = await fetch(`/sessions/${encodeURIComponent(id)}/data`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer();
}

export async function deleteSessionRequest(id) {
  const response = await fetch(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
}

/** Épingle ou désépingle une session pour la soustraire à la purge. */
export async function keepSessionRequest(id, kept) {
  const response = await fetch(`/sessions/${encodeURIComponent(id)}/keep`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kept }),
  });
  return readJson(response);
}

/** Suspend ou reprend l'archivage des nouvelles sessions. */
export async function setRecordingRequest(enabled) {
  const response = await fetch("/recording", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return readJson(response);
}
