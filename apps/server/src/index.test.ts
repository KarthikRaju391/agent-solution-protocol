import { describe, it, expect, beforeEach } from 'vitest';

interface JsonResponse {
  name?: string;
  packetCount?: number;
  status?: string;
  success?: boolean;
  id?: string;
  total?: number;
  packets?: unknown[];
  count?: number;
  results?: unknown[];
  error?: string;
}
import { createApp } from './app.js';
import { InMemoryPacketStore } from './store.js';
import { createPacket } from '@asp/protocol';

function makeTestPacket() {
  return createPacket(
    { description: 'TypeError when calling undefined function', errorMessage: 'TypeError: undefined is not a function', tags: ['typescript'] },
    { language: 'TypeScript', languageVersion: '5.3', framework: 'Node.js', runtime: 'Node.js 20' },
    { diff: '--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-broken()\n+fixed()', files: ['src/example.ts'], explanation: 'Fixed it' },
  );
}

describe('Server API', () => {
  let app: ReturnType<typeof createApp>;
  let store: InMemoryPacketStore;

  beforeEach(() => {
    store = new InMemoryPacketStore();
    app = createApp(store);
  });

  it('GET / returns registry info', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonResponse;
    expect(body.name).toBe('Agent Solution Protocol Registry');
    expect(body.packetCount).toBe(0);
  });

  it('GET /health returns ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonResponse;
    expect(body.status).toBe('ok');
  });

  it('POST /packets validates and stores a packet', async () => {
    const packet = makeTestPacket();
    const res = await app.request('/packets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(packet),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as JsonResponse;
    expect(body.success).toBe(true);
    expect(body.id).toBe(packet.id);
  });

  it('POST /packets rejects invalid data', async () => {
    const res = await app.request('/packets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bad: 'data' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /packets lists stored packets', async () => {
    const packet = makeTestPacket();
    await store.insert(packet);

    const res = await app.request('/packets');
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonResponse;
    expect(body.total).toBe(1);
    expect(body.packets).toHaveLength(1);
  });

  it('GET /packets/:id returns a specific packet', async () => {
    const packet = makeTestPacket();
    await store.insert(packet);

    const res = await app.request(`/packets/${packet.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonResponse;
    expect(body.id).toBe(packet.id);
  });

  it('GET /packets/:id returns 404 for unknown id', async () => {
    const res = await app.request('/packets/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('POST /search finds packets by query', async () => {
    const packet = makeTestPacket();
    await store.insert(packet);

    const res = await app.request('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'TypeError' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonResponse;
    expect(body.count).toBe(1);
  });

  it('POST /search returns empty for no match', async () => {
    const packet = makeTestPacket();
    await store.insert(packet);

    const res = await app.request('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'SyntaxError' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonResponse;
    expect(body.count).toBe(0);
  });
});
