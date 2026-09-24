// =============================================
// FuelUp - Repository contracts (Phase 1: boundaries only)
// Stores/services implement these shapes later; IndexedDB adapters
// plug in here without touching UI.
// =============================================

export interface Repository<TCreate, TEntity> {
  list(ownerId: string): Promise<TEntity[]>;
  create(ownerId: string, input: TCreate): Promise<TEntity>;
  remove(ownerId: string, id: string): Promise<void>;
}

/** Local-first read model: what the UI needs regardless of backend. */
export interface LocalQuery<T> {
  all(): T[];
  byId(id: string): T | undefined;
}
