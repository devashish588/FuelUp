// =============================================
// FuelUp - Owner namespace (client)
// Every IndexedDB row is scoped to an `ownerId`:
// - Signed in  → FuelUp DB user id (stable, from /api/me; derived from the
//   Clerk session, never from email).
// - Signed out / offline → `local:<device-uuid>` (device-local namespace,
//   clearly marked, never treated as an identity server-side).
// =============================================

const DEVICE_ID_KEY = 'fuelup-device-id';

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `dev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** Stable per-device id (localStorage, non-domain bookkeeping only). */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

export function toDeviceOwner(deviceId: string): string {
  return `local:${deviceId}`;
}

export function isDeviceOwner(ownerId: string): boolean {
  return ownerId.startsWith('local:');
}
