import { serve } from '@hono/node-server';
import { initDatabase, closeDatabase } from './db.js';
import { PostgresPacketStore, InMemoryPacketStore } from './store.js';
import { createApp } from './app.js';
import type { PacketStore } from './store.js';

async function initStore(): Promise<PacketStore> {
  try {
    await initDatabase();
    console.log('Connected to PostgreSQL');
    return new PostgresPacketStore();
  } catch (err) {
    console.warn('PostgreSQL unavailable, using in-memory store:', (err as Error).message);
    return new InMemoryPacketStore();
  }
}

const port = Number(process.env.PORT) || 3000;
const store = await initStore();
const app = createApp(store);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ASP Registry running at http://localhost:${info.port}`);
});

function shutdown() {
  server.close();
  closeDatabase().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
