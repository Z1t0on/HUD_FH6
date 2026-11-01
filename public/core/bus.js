/**
 * Bus d'événements interne.
 *
 * Les tuiles ne se connaissent pas : elles publient et écoutent des signaux
 * (changement de langue, d'unités, de thème, échantillon d'analyse…). Le point
 * d'entrée reste le seul à distribuer les paquets de télémétrie.
 */

const handlers = new Map();

export const bus = {
  /**
   * Abonne un gestionnaire à un type d'événement.
   * @returns {() => void} fonction de désabonnement
   */
  on(type, handler) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(handler);
    return () => handlers.get(type)?.delete(handler);
  },

  /** Diffuse un événement à ses abonnés, sans interrompre les autres en cas d'erreur. */
  emit(type, payload) {
    const listeners = handlers.get(type);
    if (!listeners) return;
    for (const handler of [...listeners]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`Écouteur « ${type} » en échec :`, error);
      }
    }
  },
};
