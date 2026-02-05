import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { protocolVersion, SolvedPacketSchema, type SolvedPacket } from '@asp/protocol';

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

const packets: SolvedPacket[] = [];

app.get('/', (c) => {
  return c.json({
    name: 'Agent Solution Protocol Registry',
    version: protocolVersion,
    packetCount: packets.length,
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
  
  packets.push(result.data);
  return c.json({ success: true, id: result.data.id }, 201);
});

app.get('/packets', (c) => {
  const limit = Number(c.req.query('limit')) || 10;
  const offset = Number(c.req.query('offset')) || 0;
  
  return c.json({
    packets: packets.slice(offset, offset + limit),
    total: packets.length,
  });
});

app.get('/packets/:id', (c) => {
  const id = c.req.param('id');
  const packet = packets.find((p) => p.id === id);
  
  if (!packet) {
    return c.json({ error: 'Packet not found' }, 404);
  }
  
  return c.json(packet);
});

app.post('/search', async (c) => {
  const { query, context } = await c.req.json();
  
  const results = packets.filter((p) => {
    const symptomMatch = p.symptom.description.toLowerCase().includes(query?.toLowerCase() || '');
    const errorMatch = p.symptom.errorMessage?.toLowerCase().includes(query?.toLowerCase() || '');
    return symptomMatch || errorMatch;
  });
  
  return c.json({ results, count: results.length });
});

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 ASP Registry running at http://localhost:${info.port}`);
});
