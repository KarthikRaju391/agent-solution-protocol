import postgres from 'postgres';

const DEFAULT_DATABASE_URL = 'postgres://asp_user:asp_password@localhost:5432/asp_registry';

let sql: postgres.Sql | null = null;

export function getConnection(): postgres.Sql {
  if (!sql) {
    const connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
    const isRemote = !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
    sql = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: isRemote ? 'require' : false,
    });
  }
  return sql;
}

export async function initDatabase(): Promise<void> {
  const db = getConnection();

  await db`SET client_min_messages TO WARNING`;
  await db`CREATE EXTENSION IF NOT EXISTS "vector"`;
  await db`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

  await db`
    CREATE TABLE IF NOT EXISTS packets (
      id UUID PRIMARY KEY,
      version TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,

      symptom_description TEXT NOT NULL,
      symptom_error_message TEXT,
      symptom_error_code TEXT,
      symptom_stack_trace TEXT,
      symptom_tags TEXT[],

      context_language TEXT NOT NULL,
      context_language_version TEXT,
      context_framework TEXT,
      context_runtime TEXT,
      context_os TEXT,
      context_dependencies JSONB,

      fix_diff TEXT NOT NULL,
      fix_files TEXT[] NOT NULL,
      fix_explanation TEXT,

      verification_type TEXT,
      verification_command TEXT,
      verification_test_file TEXT,
      verification_before_output TEXT,
      verification_after_output TEXT,

      metadata_source TEXT,
      metadata_confidence REAL,
      metadata_upvotes INTEGER DEFAULT 0,

      -- vector column for future semantic search
      embedding vector(384)
    )
  `;

  await db`
    CREATE INDEX IF NOT EXISTS idx_packets_created_at ON packets (created_at DESC)
  `;
  await db`
    CREATE INDEX IF NOT EXISTS idx_packets_symptom_tags ON packets USING GIN (symptom_tags)
  `;
}

export async function closeDatabase(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}
