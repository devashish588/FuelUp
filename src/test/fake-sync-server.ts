// In-memory fake of the FuelUp sync HTTP API (push + pull) for engine tests.
// Behaves like the real server: owner-scoped rows, mutation dedupe,
// server-side updatedAt ordering, tombstone journal, cursor paging.
import type { SyncDeletionChange, SyncEntity, SyncPullResponse, SyncPushEvent } from '@/lib/sync/sync-contracts';

function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function toCamelDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCamelDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [snakeToCamelKey(k), toCamelDeep(v)]));
  }
  return value;
}

export interface FakeSyncServer {
  tables: Record<string, Map<string, Record<string, unknown>>>;
  mutations: Set<string>;
  deletions: Array<{ entity: string; entityId: string; deletedAt: string }>;
  applyCount: number;
  /** Seed a server row directly (camelCase), as if another device pushed it. */
  seed(entity: SyncEntity, row: Record<string, unknown>, updatedAt?: string): void;
  /** Delete server-side (journals a tombstone). */
  serverDelete(entity: SyncEntity, entityId: string): void;
  handlePush(events: SyncPushEvent[]): { results: Array<{ mutationId: string; status: string }> };
  handlePull(cursor: string | null): SyncPullResponse;
}

export function createFakeSyncServer(): FakeSyncServer {
  const server: FakeSyncServer = {
    tables: {},
    mutations: new Set(),
    deletions: [],
    applyCount: 0,
    seed(entity, row, updatedAt) {
      const table = (server.tables[entity] ??= new Map());
      table.set(row.id as string, { ...row, updatedAt: updatedAt ?? new Date().toISOString() });
    },
    serverDelete(entity, entityId) {
      server.tables[entity]?.delete(entityId);
      server.deletions.push({ entity, entityId, deletedAt: new Date().toISOString() });
    },
    handlePush(events) {
      const results: Array<{ mutationId: string; status: string; error?: string }> = [];
      for (const event of events) {
        if (server.mutations.has(event.mutationId)) {
          results.push({ mutationId: event.mutationId, status: 'duplicate' });
          continue;
        }
        if (!event.payload || typeof event.payload !== 'object' || (event.payload as Record<string, unknown>).id !== event.entityId) {
          results.push({ mutationId: event.mutationId, status: 'invalid', error: 'Invalid.' });
          continue;
        }
        if (event.operation === 'delete') {
          server.tables[event.entity]?.delete(event.entityId);
          server.deletions.push({ entity: event.entity, entityId: event.entityId, deletedAt: new Date().toISOString() });
        } else {
          const table = (server.tables[event.entity] ??= new Map());
          const camel = toCamelDeep(event.payload) as Record<string, unknown>;
          // Mirror the real server: profile snapshots map onto the User row.
          if (event.entity === 'profile' && typeof camel.fullName === 'string') {
            camel.name = camel.fullName;
          }
          table.set(event.entityId, { ...camel, updatedAt: new Date().toISOString() });
        }
        server.mutations.add(event.mutationId);
        server.applyCount++;
        results.push({ mutationId: event.mutationId, status: 'ok' });
      }
      return { results };
    },
    handlePull(cursor) {
      const since = cursor ?? new Date(0).toISOString();
      const changes: SyncPullResponse['changes'] = {};
      let max = since;
      for (const [entity, table] of Object.entries(server.tables)) {
        const rows = [...table.values()]
          .filter((r) => (r.updatedAt as string) > since)
          .sort((a, b) => ((a.updatedAt as string) < (b.updatedAt as string) ? -1 : 1))
          .slice(0, 200);
        if (rows.length > 0) {
          changes[entity as SyncEntity] = rows.map((row) => ({ row, updatedAt: row.updatedAt as string }));
          const last = rows[rows.length - 1].updatedAt as string;
          if (last > max) max = last;
        }
      }
      const deletions: SyncDeletionChange[] = server.deletions
        .filter((d) => d.deletedAt > since)
        .map((d) => ({ entity: d.entity as SyncEntity, entityId: d.entityId, deletedAt: d.deletedAt }));
      for (const d of deletions) if (d.deletedAt > max) max = d.deletedAt;
      return { cursor: max, hasMore: false, changes, deletions };
    },
  };
  return server;
}

/** Route fetch() calls to the fake server (or a scripted failure). */
export function installFetchRouter(handler: (url: string, init?: RequestInit) => Promise<unknown>) {
  const mock = async (url: string | URL | Request, init?: RequestInit) => {
    const target = typeof url === 'string' ? url : url.toString();
    try {
      const data = await handler(target, init);
      return { ok: true, status: 200, json: async () => data } as Response;
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }
  };
  vi.stubGlobal('fetch', mock);
}

export function httpError(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as Response;
}

// Re-export vi for convenience in test files.
import { vi } from 'vitest';
export { vi };
