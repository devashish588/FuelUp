// Phase 8 — API security tests at the HTTP boundary.
// Unauthenticated POSTs must fail safely; oversized bodies must fail
// safely; the success path exercises real validation + handler wiring.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors/app-error';

vi.mock('@/lib/auth/current-user', () => ({ requireDbUser: vi.fn() }));

import { requireDbUser } from '@/lib/auth/current-user';
import { POST } from './route';

const mockRequireDbUser = vi.mocked(requireDbUser);

function authed() {
  mockRequireDbUser.mockResolvedValue({ id: 'user-a' } as never);
}

function signedOut() {
  mockRequireDbUser.mockRejectedValue(new AppError('UNAUTHORIZED', 'Please sign in to continue.', 401));
}

beforeEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_API_KEY;
});

describe('POST /api/ai/food-parse', () => {
  it('rejects unauthenticated requests without touching AI', async () => {
    signedOut();
    const res = await POST(new Request('http://x/api/ai/food-parse', { method: 'POST', body: JSON.stringify({ text: '2 eggs' }) }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('rejects oversized bodies safely', async () => {
    authed();
    const res = await POST(new Request('http://x/api/ai/food-parse', { method: 'POST', body: 'x'.repeat(9000) }));
    expect(res.status).toBe(413);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('AI_REQUEST_TOO_LARGE');
  });

  it('fails safe without provider configuration (no key ⇒ no call)', async () => {
    authed();
    const res = await POST(new Request('http://x/api/ai/food-parse', { method: 'POST', body: JSON.stringify({ text: '2 eggs' }) }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('AI_CONFIGURATION_ERROR');
  });

  it('parses end-to-end with a stubbed provider and strips ownership fields', async () => {
    authed();
    process.env.AI_API_KEY = 'test-key';
    const fetchStub = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"items":[{"name":"egg","quantity":3,"unit":"count","mealHint":null,"preparationHint":null}],"clarificationRequired":false}' } }],
      }),
    }));
    vi.stubGlobal('fetch', fetchStub);
    const res = await POST(
      new Request('http://x/api/ai/food-parse', {
        method: 'POST',
        body: JSON.stringify({ text: '3 eggs', user_id: 'user-b', admin: true }),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { name: string; quantity: number; unit: string }[]; clarificationRequired: boolean };
    expect(body.items).toEqual([{ name: 'egg', quantity: 3, unit: 'count', mealHint: null, preparationHint: null }]);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    // The provider saw only the food text (system prompt + user text).
    const [, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(init.body as string) as { messages: { content: string }[] };
    expect(JSON.stringify(sent)).not.toContain('user-b');
    expect(sent.messages[1].content).toBe('3 eggs');
  });
});
