/** Petits utilitaires partagés : sélection DOM et calculs courants. */

/** Raccourci `document.getElementById`. */
export const $ = (id) => document.getElementById(id);

/** Contraint une valeur dans un intervalle fermé. */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Interpolation angulaire la plus courte entre deux caps (radians). */
export function lerpAngle(from, to, amount) {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * amount;
}

/** Ajuste la résolution d'un canevas 2D au facteur d'écran courant. */
export function sizeCanvas(canvasEl, ctx) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvasEl.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvasEl.width !== width || canvasEl.height !== height) {
    canvasEl.width = width;
    canvasEl.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

/** Construit un élément avec ses classes et son contenu texte. */
export function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
