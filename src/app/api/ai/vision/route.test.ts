// Phase 9 — vision HTTP boundary tests: auth, size guards, and a stubbed
// provider proving the request carries image + optional text ONLY.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors/app-error';

vi.mock('@/lib/auth/current-user', () => ({ requireDbUser: vi.fn() }));

import { requireDbUser } from '@/lib/auth/current-user';
import { POST } from './route';

const mockRequireDbUser = vi.mocked(requireDbUser);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString('base64');

beforeEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_API_KEY;
});

describe('POST /api/ai/vision', () => {
  it('rejects unauthenticated requests without touching AI', async () => {
    mockRequireDbUser.mockRejectedValue(new AppError('UNAUTHORIZED', 'Please sign in to continue.', 401));
    const res = await POST(new Request('http://x/api/ai/vision', {
      method: 'POST',
      body: JSON.stringify({ task: 'meal', image: { mimeType: 'image/jpeg', dataBase64: JPEG } }),
    }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('UNAUTHORIZED');
  });

  it('rejects oversized bodies safely', async () => {
    mockRequireDbUser.mockResolvedValue({ id: 'vision-http-1' } as never);
    const res = await POST(new Request('http://x/api/ai/vision', { method: 'POST', body: 'x'.repeat(1600000) }));
    expect(res.status).toBe(413);
  });

  it('analyzes a meal end-to-end with image + text only in the provider payload', async () => {
    mockRequireDbUser.mockResolvedValue({ id: 'vision-http-2' } as never);
    process.env.AI_API_KEY = 'test-key';
    const fetchStub = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"items":[{"name":"dal","quantity":null,"unit":null,"mealHint":null,"preparationHint":null,"visualPortionHint":"small bowl","foodState":null}],"clarificationRequired":false}' } }],
      }),
    }));
    vi.stubGlobal('fetch', fetchStub);
    const res = await POST(new Request('http://x/api/ai/vision', {
      method: 'POST',
      body: JSON.stringify({ task: 'meal', image: { mimeType: 'image/jpeg', dataBase64: JPEG }, text: 'homemade' }),
    }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: string; items: { name: string; visualPortionHint: string }[] };
    expect(body.task).toBe('meal');
    expect(body.items[0]).toMatchObject({ name: 'dal', visualPortionHint: 'small bowl' });
    const [, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(init.body as string) as { messages: { content: unknown }[] };
    const flat = JSON.stringify(sent);
    // Privacy: image + clarification text only — no ids, emails, or history.
    expect(flat).toContain('data:image/jpeg;base64,');
    expect(flat).toContain('homemade');
    expect(flat).not.toContain('vision-http-2');
    expect(flat).not.toContain('clerk');
  });
});
