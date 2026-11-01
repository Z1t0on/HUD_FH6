/**
 * Gestion des fenêtres flottantes et des espaces de travail.
 *
 * Chaque tuile est une fenêtre libre : déplaçable, redimensionnable par ses
 * quatre coins, superposable à ses voisines. La tuile saisie passe au premier
 * plan (z-index 20 à 59, la carte restant à 10). Les positions sont mémorisées
 * en fractions de l'espace de travail, avec l'espace (page) d'appartenance.
 *
 * Deux espaces accueillent les tuiles : le second se rejoint par les flèches de
 * la barre supérieure, et une tuile change d'espace en étant déposée sur l'une
 * d'elles.
 */

import { bus } from "./bus.js";
import { t, translateTree } from "./i18n.js";
import { showToast } from "./toast.js";
import { $, clamp } from "./utils.js";

const LAYOUT_KEY = "hud-fh6:layout";
const PAGE_COUNT = 2;

/* Ancienne position d'usine de l'inspecteur : elle recouvrait les boutons de
   la carte. Une disposition enregistrée à cet emplacement exact est réalignée
   sur la nouvelle position par défaut. */
const LEGACY_INSPECTOR_PLACEMENT = { x: 0.255, y: 0.6 };

const STACKED_QUERY = window.matchMedia("(max-width: 760px)");
const WORKSPACE_MIN_PX = { width: 150, height: 110 };
const SNAP_DISTANCE = 12;

const workspaces = new Map([
  [1, $("workspace")],
  [2, $("workspace-2")],
]);

const panelsMenuBody = $("panels-menu-body");
const pageLabelEl = $("page-label");
const pagePrevButton = $("page-prev");
const pageNextButton = $("page-next");

/** Définitions de tuiles enregistrées, dans l'ordre d'affichage du menu. */
const tiles = new Map();
/** Éléments `.panel` créés pour chaque tuile. */
const panelEls = new Map();

let panelState = {};
let currentPage = 1;
let panelZ = 20;

/** Session de glissement ou de redimensionnement en cours. */
let dragSession = null;

/* ------------------------------- Enregistrement */

/** Déclare une tuile auprès du gestionnaire de fenêtres. */
export function registerTile(tile) {
  tiles.set(tile.id, tile);
}

export function getPanelElement(id) {
  return panelEls.get(id) ?? null;
}

export function getPanelLayout() {
  return panelState;
}

export function getDragSession() {
  return dragSession;
}

export function getCurrentPage() {
  return currentPage;
}

/* ------------------------------- Disposition */

function workspaceFor(page) {
  return workspaces.get(page === 2 ? 2 : 1);
}

function defaultPanelState() {
  const next = {};
  for (const tile of tiles.values()) {
    if (tile.panel === false) continue;
    const placement = tile.placement ?? {};
    next[tile.id] = {
      page: placement.page === 2 ? 2 : 1,
      x: placement.x ?? 0,
      y: placement.y ?? 0,
      w: placement.w ?? 0.2,
      h: placement.h ?? 0.3,
      hidden: tile.hidden === true,
    };
  }
  return next;
}

function loadPanelState() {
  const base = defaultPanelState();
  try {
    const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null");
    if (!stored || typeof stored !== "object") return base;
    for (const [name, value] of Object.entries(stored)) {
      if (!base[name] || !value || typeof value !== "object") continue;
      if (
        name === "inspector" &&
        Math.abs(Number(value.x) - LEGACY_INSPECTOR_PLACEMENT.x) < 0.002 &&
        Math.abs(Number(value.y) - LEGACY_INSPECTOR_PLACEMENT.y) < 0.002
      ) {
        continue;
      }
      const w = clamp(Number(value.w) || base[name].w, 0.05, 1);
      const h = clamp(Number(value.h) || base[name].h, 0.05, 1);
      base[name] = {
        page: value.page === 2 ? 2 : 1,
        x: clamp(Number(value.x) || 0, 0, 1 - w),
        y: clamp(Number(value.y) || 0, 0, 1 - h),
        w,
        h,
        hidden: Boolean(value.hidden),
      };
    }
  } catch {
    return base;
  }
  return base;
}

function savePanelState() {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(panelState));
  } catch {
    // Stockage indisponible : la disposition reste valable pour la session.
  }
}

function isStackedLayout() {
  return STACKED_QUERY.matches;
}

/** Applique la position mémorisée d'un panneau dans son espace. */
export function applyPanelLayout(name) {
  const element = panelEls.get(name);
  const entry = panelState[name];
  if (!element || !entry) return;

  const visible = !entry.hidden && entry.page === currentPage;
  element.hidden = !visible;
  if (!visible) return;

  if (isStackedLayout()) {
    element.style.removeProperty("left");
    element.style.removeProperty("top");
    element.style.removeProperty("width");
    element.style.removeProperty("height");
    return;
  }

  const workspace = workspaceFor(entry.page);
  const width = workspace.clientWidth;
  const height = workspace.clientHeight;
  if (width === 0 || height === 0) return;

  element.style.left = `${Math.round(entry.x * width)}px`;
  element.style.top = `${Math.round(entry.y * height)}px`;
  element.style.width = `${Math.round(entry.w * width)}px`;
  element.style.height = `${Math.round(entry.h * height)}px`;
}

export function applyAllPanels() {
  for (const name of panelEls.keys()) applyPanelLayout(name);
}

/** Place un panneau au premier plan, dans la plage autorisée (20 à 59). */
export function bringToFront(element) {
  panelZ = panelZ >= 59 ? 21 : panelZ + 1;
  element.style.zIndex = String(panelZ);
}

export function setPanelHidden(name, hidden) {
  const entry = panelState[name];
  const element = panelEls.get(name);
  if (!entry || !element) return;

  entry.hidden = hidden;
  element.hidden = hidden || entry.page !== currentPage;
  /* Une tuile réaffichée repasse devant : elle ne doit jamais apparaître
     sous une voisine installée entre-temps. */
  if (!hidden && entry.page === currentPage) bringToFront(element);
  savePanelState();
  syncPanelsMenu();
}

/* ------------------------------- Espaces */

function updatePageControls() {
  if (pageLabelEl) {
    pageLabelEl.textContent = t("page.label", { n: currentPage, total: PAGE_COUNT });
  }
  if (pagePrevButton) {
    pagePrevButton.disabled = currentPage <= 1;
    pagePrevButton.title = t("page.prev");
    pagePrevButton.setAttribute("aria-label", t("page.prev"));
  }
  if (pageNextButton) {
    pageNextButton.disabled = currentPage >= PAGE_COUNT;
    pageNextButton.title = t("page.next");
    pageNextButton.setAttribute("aria-label", t("page.next"));
  }
  const container = $("page-switch");
  if (container) container.setAttribute("aria-label", t("page.switch"));
}

/** Bascule sur un espace de travail. */
export function setPage(page) {
  currentPage = page === 2 ? 2 : 1;
  for (const [number, workspace] of workspaces) {
    workspace.hidden = number !== currentPage;
  }
  updatePageControls();
  applyAllPanels();
}

/** Déplace une tuile vers l'autre espace et l'y affiche. */
export function movePanelToPage(name, page) {
  const tile = tiles.get(name);
  const entry = panelState[name];
  const element = panelEls.get(name);
  const target = page === 2 ? 2 : 1;
  if (!tile || !entry || !element || entry.page === target) return;

  entry.page = target;
  entry.hidden = false;
  workspaceFor(target).appendChild(element);
  savePanelState();
  setPage(target);
  applyPanelLayout(name);
  showToast(t("toast.panel-moved", { name: t(tile.labelKey), page: target }));
}

/* ------------------------------- Menu des panneaux */

function syncPanelsMenu() {
  if (!panelsMenuBody) return;
  for (const input of panelsMenuBody.querySelectorAll("input[data-panel-toggle]")) {
    const entry = panelState[input.dataset.panelToggle];
    if (entry) input.checked = !entry.hidden;
  }
}

function buildPanelsMenu() {
  if (!panelsMenuBody) return;
  panelsMenuBody.textContent = "";

  for (const tile of tiles.values()) {
    if (tile.panel === false) continue;
    const label = document.createElement("label");
    label.className = "menu-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.panelToggle = tile.id;
    input.checked = !panelState[tile.id].hidden;
    input.addEventListener("change", () => setPanelHidden(tile.id, !input.checked));

    const text = document.createElement("span");
    text.textContent = t(tile.labelKey);

    label.append(input, text);
    panelsMenuBody.append(label);
  }

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "btn btn-small menu-reset";
  reset.textContent = t("menu.reset-layout");
  reset.addEventListener("click", () => {
    panelState = defaultPanelState();
    savePanelState();
    for (const [name, element] of panelEls) {
      const entry = panelState[name];
      element.hidden = entry.hidden || entry.page !== currentPage;
      workspaceFor(entry.page).appendChild(element);
    }
    applyAllPanels();
    syncPanelsMenu();
    showToast(t("toast.layout-reset"));
  });
  panelsMenuBody.append(reset);
}

/* ------------------------------- Glissement et redimensionnement */

/** Convertit un rectangle en fractions de l'espace de travail. */
function rectToFractions(left, top, width, height, workspace) {
  const wsWidth = Math.max(1, workspace.clientWidth);
  const wsHeight = Math.max(1, workspace.clientHeight);
  const w = clamp(width / wsWidth, 0.05, 1);
  const h = clamp(height / wsHeight, 0.05, 1);
  return {
    x: clamp(left / wsWidth, 0, 1 - w),
    y: clamp(top / wsHeight, 0, 1 - h),
    w,
    h,
  };
}

/** Complète un rectangle par ses bords droit et bas. */
function toBox(rect) {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
  };
}

/** Rectangles des panneaux visibles du même espace, dans son repère. */
function capturePanelRects(excludeName, page) {
  const workspace = workspaceFor(page);
  const wsRect = workspace.getBoundingClientRect();
  const rects = new Map();
  for (const [name, element] of panelEls) {
    if (name === excludeName || element.hidden) continue;
    if (panelState[name].page !== page) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    rects.set(name, {
      left: rect.left - wsRect.left,
      top: rect.top - wsRect.top,
      width: rect.width,
      height: rect.height,
    });
  }
  return rects;
}

/**
 * Aimantation : bords de l'espace de travail et arêtes des panneaux voisins,
 * uniquement à courte distance. Elle aligne la tuile, elle ne l'empêche pas de
 * recouvrir un voisin.
 */
function snapPanelRect(rect, neighbours, bounds) {
  const box = toBox(rect);
  let bestX = 0;
  let bestY = 0;

  const considerX = (target) => {
    const delta = target - box.left;
    if (delta !== 0 && Math.abs(delta) <= SNAP_DISTANCE && Math.abs(delta) < Math.abs(bestX)) bestX = delta;
  };
  const considerY = (target) => {
    const delta = target - box.top;
    if (delta !== 0 && Math.abs(delta) <= SNAP_DISTANCE && Math.abs(delta) < Math.abs(bestY)) bestY = delta;
  };

  considerX(0);
  considerX(bounds.width - box.width);
  considerY(0);
  considerY(bounds.height - box.height);

  for (const rect of neighbours.values()) {
    const other = toBox(rect);
    const verticalOverlap = Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
    const horizontalOverlap = Math.min(box.right, other.right) - Math.max(box.left, other.left);
    if (verticalOverlap > 0) {
      considerX(other.right); // accoler à droite du voisin
      considerX(other.left - box.width); // accoler à gauche du voisin
    }
    if (horizontalOverlap > 0) {
      considerY(other.bottom); // accoler sous le voisin
      considerY(other.top - box.height); // accoler au-dessus du voisin
    }
  }

  return {
    left: clamp(box.left + bestX, 0, Math.max(0, bounds.width - box.width)),
    top: clamp(box.top + bestY, 0, Math.max(0, bounds.height - box.height)),
  };
}

/** Mémorise la disposition courante en fractions de l'espace de travail. */
function commitPanelLayout() {
  for (const [name, element] of panelEls) {
    if (element.hidden) continue;
    const entry = panelState[name];
    const workspace = workspaceFor(entry.page);
    const wsRect = workspace.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    panelState[name] = {
      ...entry,
      ...rectToFractions(
        rect.left - wsRect.left,
        rect.top - wsRect.top,
        rect.width,
        rect.height,
        workspace,
      ),
    };
  }
  savePanelState();
}

/** Direction de la poignée de redimensionnement saisie (quatre coins). */
function resizeDirectionOf(target) {
  for (const direction of ["br", "bl", "tr", "tl"]) {
    if (target.classList.contains(direction)) return direction;
  }
  return "br";
}

/**
 * Calcule le rectangle cible d'un redimensionnement directionnel, borné par
 * l'espace de travail et la taille minimale. Le recouvrement d'un voisin est
 * autorisé : c'est le prix du glissement libre.
 */
function resizePanelRect(session, dx, dy) {
  const bounds = session.bounds;
  const start = session.start;
  const minWidth = WORKSPACE_MIN_PX.width;
  const minHeight = WORKSPACE_MIN_PX.height;

  let left = start.left;
  let top = start.top;
  let width = start.width;
  let height = start.height;

  if (session.direction.includes("r")) {
    width = clamp(start.width + dx, minWidth, Math.max(minWidth, bounds.width - start.left));
  }
  if (session.direction.includes("l")) {
    left = clamp(start.left + dx, 0, start.left + start.width - minWidth);
    width = start.left + start.width - left;
  }
  if (session.direction.includes("b")) {
    height = clamp(start.height + dy, minHeight, Math.max(minHeight, bounds.height - start.top));
  }
  if (session.direction.includes("t")) {
    top = clamp(start.top + dy, 0, start.top + start.height - minHeight);
    height = start.top + start.height - top;
  }

  return { left, top, width, height };
}

/** Espace cible sous le pointeur, en survol des flèches de navigation. */
function pageUnderPointer(x, y) {
  for (const button of [pagePrevButton, pageNextButton]) {
    if (!button || button.disabled) continue;
    const rect = button.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return Number(button.dataset.page);
    }
  }
  return null;
}

function highlightDropTarget(page) {
  for (const button of [pagePrevButton, pageNextButton]) {
    if (!button) continue;
    const active = page !== null && Number(button.dataset.page) === page;
    button.classList.toggle("is-drop-target", active);
  }
}

/**
 * Démarre le glissement ou le redimensionnement d'un panneau. La tuile
 * manipulée passe au premier plan et peut recouvrir ses voisines ; ses
 * voisines, elles, ne bougent jamais.
 */
function startPanelInteraction(element, event, kind) {
  if (isStackedLayout() || event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest("button, input, summary, label")) return;

  const name = element.dataset.panel;
  const entry = panelState[name];
  if (!entry) return;

  const workspace = workspaceFor(entry.page);
  const bounds = { width: workspace.clientWidth, height: workspace.clientHeight };
  if (bounds.width === 0 || bounds.height === 0) return;

  const wsRect = workspace.getBoundingClientRect();
  const rect = element.getBoundingClientRect();

  const start = {
    left: rect.left - wsRect.left,
    top: rect.top - wsRect.top,
    width: rect.width,
    height: rect.height,
  };

  const session = {
    name,
    page: entry.page,
    kind,
    bounds,
    pointerX: event.clientX,
    pointerY: event.clientY,
    start,
    /* Dernière position acceptée, utile à l'inspection et au repli. */
    current: start,
    neighbours: capturePanelRects(name, entry.page),
    direction: kind === "resize" ? resizeDirectionOf(event.target) : null,
    dropPage: null,
  };
  dragSession = session;

  element.classList.add(kind === "drag" ? "is-dragging" : "is-resizing");
  bringToFront(element);
  event.preventDefault();

  const onMove = (moveEvent) => {
    const dx = moveEvent.clientX - session.pointerX;
    const dy = moveEvent.clientY - session.pointerY;

    let target;
    if (kind === "drag") {
      const free = {
        left: clamp(session.start.left + dx, 0, Math.max(0, bounds.width - session.start.width)),
        top: clamp(session.start.top + dy, 0, Math.max(0, bounds.height - session.start.height)),
        width: session.start.width,
        height: session.start.height,
      };
      const snapped = snapPanelRect(free, session.neighbours, bounds);
      target = { ...free, left: snapped.left, top: snapped.top };

      /* Déposer la tuile sur une flèche la fait changer d'espace. */
      const hovered = pageUnderPointer(moveEvent.clientX, moveEvent.clientY);
      session.dropPage = hovered && hovered !== session.page ? hovered : null;
      highlightDropTarget(session.dropPage);
    } else {
      target = resizePanelRect(session, dx, dy);
    }

    session.current = target;
    element.style.left = `${Math.round(target.left)}px`;
    element.style.top = `${Math.round(target.top)}px`;
    if (kind === "resize") {
      element.style.width = `${Math.round(target.width)}px`;
      element.style.height = `${Math.round(target.height)}px`;
    }
  };

  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    element.classList.remove("is-dragging", "is-resizing");
    highlightDropTarget(null);
    const dropPage = session.dropPage;
    dragSession = null;
    commitPanelLayout();
    if (dropPage) movePanelToPage(name, dropPage);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
}

/* ------------------------------- Initialisation */

function createPanel(tile) {
  const element = document.createElement("section");
  element.className = `panel ${tile.id}-panel`;
  element.dataset.panel = tile.id;
  if (tile.panelId) element.id = tile.panelId;
  element.dataset.i18nAria = tile.labelKey;
  element.innerHTML = `
    <div class="panel-chrome">
      <span class="panel-grip" aria-hidden="true"></span>
      <button class="panel-hide" type="button" data-hide="${tile.id}">×</button>
    </div>
  `;
  return element;
}

function bindPanels() {
  for (const [name, element] of panelEls) {
    element.style.zIndex = String(name === "map" ? 10 : 20);
    element.addEventListener("pointerdown", () => bringToFront(element));

    const chrome = element.querySelector(".panel-chrome");
    if (chrome) chrome.addEventListener("pointerdown", (event) => startPanelInteraction(element, event, "drag"));

    const head = element.querySelector(":scope > .panel-head");
    if (head) head.addEventListener("pointerdown", (event) => startPanelInteraction(element, event, "drag"));

    for (const handle of element.querySelectorAll(":scope > .panel-resize")) {
      handle.addEventListener("pointerdown", (event) => startPanelInteraction(element, event, "resize"));
    }

    for (const button of element.querySelectorAll("[data-hide]")) {
      button.addEventListener("click", () => {
        setPanelHidden(name, true);
        showToast(t("toast.panel-hidden", { name: t(tiles.get(name).labelKey) }));
      });
    }
  }
}

/** Met à jour les libellés que le gestionnaire possède (titres, masquage, pages). */
function refreshPanelLabels() {
  for (const [name, element] of panelEls) {
    const tile = tiles.get(name);
    if (!tile) continue;
    element.dataset.i18nAria = tile.labelKey;
    element.setAttribute("aria-label", t(tile.labelKey));
    const hideButton = element.querySelector("[data-hide]");
    if (hideButton) hideButton.setAttribute("aria-label", t("panel.hide", { name: t(tile.labelKey) }));
  }
  updatePageControls();
}

function bindPageControls() {
  pagePrevButton?.addEventListener("click", () => setPage(currentPage - 1));
  pageNextButton?.addEventListener("click", () => setPage(currentPage + 1));
}

export function initPanels() {
  panelState = loadPanelState();

  for (const tile of tiles.values()) {
    if (tile.panel === false) continue;
    const element = createPanel(tile);
    panelEls.set(tile.id, element);
    workspaceFor(panelState[tile.id].page).appendChild(element);
    tile.mount?.(element);
    translateTree(element);
    element.insertAdjacentHTML(
      "beforeend",
      `
      <span class="panel-resize br" aria-hidden="true"></span>
      <span class="panel-resize bl" aria-hidden="true"></span>
      <span class="panel-resize tr" aria-hidden="true"></span>
      <span class="panel-resize tl" aria-hidden="true"></span>
    `,
    );
  }

  bindPanels();
  buildPanelsMenu();
  syncPanelsMenu();
  bindPageControls();
  refreshPanelLabels();
  setPage(currentPage);

  window.addEventListener("resize", applyAllPanels);
  STACKED_QUERY.addEventListener("change", applyAllPanels);

  /* L'espace de travail peut changer de taille après l'initialisation
     (barre d'état, menus dépliés) : les fractions sont réappliquées. */
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      if (dragSession) return;
      applyAllPanels();
    });
    for (const workspace of workspaces.values()) observer.observe(workspace);
  }

  /* Second passage après la mise en page du navigateur : l'espace de travail
     n'a pas toujours sa taille définitive à l'initialisation. */
  requestAnimationFrame(() => {
    applyAllPanels();
  });

  bus.on("language:changed", () => {
    buildPanelsMenu();
    syncPanelsMenu();
    refreshPanelLabels();
  });
}
