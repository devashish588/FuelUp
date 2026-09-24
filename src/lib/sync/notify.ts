// =============================================
// FuelUp - Outbox change notifications (dependency-free pub/sub)
// Repositories notify after enqueue; the trigger layer (bootstrap) listens
// and schedules sync. Zero dependencies, so no import cycles.
// =============================================

type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyOutboxChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* listener errors must never break a local write */
    }
  }
}

export function subscribeOutboxChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
