import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { protocolVersion, SolvedPacketSchema } from '@asp/protocol';
import type { PacketStore } from './store.js';

export function createApp(packetStore: PacketStore) {
  const app = new Hono();

  app.use('*', logger());
  app.use('*', cors());

  app.get('/', async (c) => {
    const total = await packetStore.count();
    return c.json({
      name: 'Agent Solution Protocol Registry',
      version: protocolVersion,
      packetCount: total,
    });
  });

  app.get('/health', (c) => {
    return c.json({ status: 'ok' });
  });

  app.post('/packets', async (c) => {
    const body = await c.req.json();
    const result = SolvedPacketSchema.safeParse(body);

    if (!result.success) {
      return c.json({ error: 'Invalid packet', details: result.error.flatten() }, 400);
    }

    await packetStore.insert(result.data);
    return c.json({ success: true, id: result.data.id }, 201);
  });

  app.get('/packets', async (c) => {
    const limit = Number(c.req.query('limit')) || 10;
    const offset = Number(c.req.query('offset')) || 0;

    const { packets, total } = await packetStore.list(limit, offset);
    return c.json({ packets, total });
  });

  app.get('/packets/:id', async (c) => {
    const id = c.req.param('id');
    const packet = await packetStore.findById(id);

    if (!packet) {
      return c.json({ error: 'Packet not found' }, 404);
    }

    return c.json(packet);
  });

  app.post('/search', async (c) => {
    const { query } = await c.req.json();
    const { results, count } = await packetStore.search(query || '');
    return c.json({ results, count });
  });

  return app;
}
