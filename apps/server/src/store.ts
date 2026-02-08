import type { SolvedPacket } from '@asp/protocol';
import type postgres from 'postgres';
import { getConnection } from './db.js';

export interface PacketStore {
  insert(packet: SolvedPacket): Promise<void>;
  findById(id: string): Promise<SolvedPacket | null>;
  list(limit: number, offset: number): Promise<{ packets: SolvedPacket[]; total: number }>;
  search(query: string): Promise<{ results: SolvedPacket[]; count: number }>;
  count(): Promise<number>;
}

function packetToRow(p: SolvedPacket): Record<string, unknown> {
  return {
    id: p.id,
    version: p.version,
    created_at: p.createdAt,

    symptom_description: p.symptom.description,
    symptom_error_message: p.symptom.errorMessage ?? null,
    symptom_error_code: p.symptom.errorCode ?? null,
    symptom_stack_trace: p.symptom.stackTrace ?? null,
    symptom_tags: p.symptom.tags ?? [],

    context_language: p.context.language,
    context_language_version: p.context.languageVersion ?? null,
    context_framework: p.context.framework ?? null,
    context_runtime: p.context.runtime ?? null,
    context_os: p.context.os ?? null,
    context_dependencies: p.context.dependencies ?? null,

    fix_diff: p.fix.diff,
    fix_files: p.fix.files,
    fix_explanation: p.fix.explanation ?? null,

    verification_type: p.verification?.type ?? null,
    verification_command: p.verification?.command ?? null,
    verification_test_file: p.verification?.testFile ?? null,
    verification_before_output: p.verification?.beforeOutput ?? null,
    verification_after_output: p.verification?.afterOutput ?? null,

    metadata_source: p.metadata?.source ?? null,
    metadata_confidence: p.metadata?.confidence ?? null,
    metadata_upvotes: p.metadata?.upvotes ?? 0,
  };
}

function rowToPacket(row: Record<string, unknown>): SolvedPacket {
  const packet: SolvedPacket = {
    id: row.id as string,
    version: row.version as typeof import('@asp/protocol').protocolVersion,
    createdAt: (row.created_at as Date).toISOString(),

    symptom: {
      description: row.symptom_description as string,
      errorMessage: row.symptom_error_message as string | undefined,
      errorCode: row.symptom_error_code as string | undefined,
      stackTrace: row.symptom_stack_trace as string | undefined,
      tags: row.symptom_tags as string[] | undefined,
    },
    context: {
      language: row.context_language as string,
      languageVersion: row.context_language_version as string | undefined,
      framework: row.context_framework as string | undefined,
      runtime: row.context_runtime as string | undefined,
      os: row.context_os as string | undefined,
      dependencies: row.context_dependencies as Record<string, string> | undefined,
    },
    fix: {
      diff: row.fix_diff as string,
      files: row.fix_files as string[],
      explanation: row.fix_explanation as string | undefined,
    },
  };

  if (row.verification_type) {
    packet.verification = {
      type: row.verification_type as 'test' | 'command' | 'manual',
      command: row.verification_command as string | undefined,
      testFile: row.verification_test_file as string | undefined,
      beforeOutput: row.verification_before_output as string | undefined,
      afterOutput: row.verification_after_output as string | undefined,
    };
  }

  const hasMetadata = row.metadata_source || row.metadata_confidence != null || row.metadata_upvotes;
  if (hasMetadata) {
    packet.metadata = {
      source: row.metadata_source as string | undefined,
      confidence: row.metadata_confidence as number | undefined,
      upvotes: (row.metadata_upvotes as number) ?? 0,
    };
  }

  return stripUndefined(packet);
}

function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined) as T;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value !== undefined && value !== null) {
      cleaned[key] = typeof value === 'object' ? stripUndefined(value) : value;
    }
  }
  return cleaned as T;
}

export class PostgresPacketStore implements PacketStore {
  private sql: postgres.Sql;

  constructor() {
    this.sql = getConnection();
  }

  async insert(packet: SolvedPacket): Promise<void> {
    const row = packetToRow(packet);
    await this.sql`INSERT INTO packets ${this.sql(row as Record<string, postgres.ParameterOrFragment<never>>)}`;
  }

  async findById(id: string): Promise<SolvedPacket | null> {
    const rows = await this.sql`SELECT * FROM packets WHERE id = ${id}`;
    if (rows.length === 0) return null;
    return rowToPacket(rows[0] as Record<string, unknown>);
  }

  async list(limit: number, offset: number): Promise<{ packets: SolvedPacket[]; total: number }> {
    const [countResult, rows] = await Promise.all([
      this.sql`SELECT COUNT(*)::int AS total FROM packets`,
      this.sql`SELECT * FROM packets ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    ]);
    return {
      packets: rows.map((r) => rowToPacket(r as Record<string, unknown>)),
      total: (countResult[0] as Record<string, unknown>).total as number,
    };
  }

  async search(query: string): Promise<{ results: SolvedPacket[]; count: number }> {
    const pattern = `%${query.toLowerCase()}%`;
    const rows = await this.sql`
      SELECT * FROM packets
      WHERE LOWER(symptom_description) LIKE ${pattern}
         OR LOWER(COALESCE(symptom_error_message, '')) LIKE ${pattern}
      ORDER BY created_at DESC
    `;
    return {
      results: rows.map((r) => rowToPacket(r as Record<string, unknown>)),
      count: rows.length,
    };
  }

  async count(): Promise<number> {
    const result = await this.sql`SELECT COUNT(*)::int AS total FROM packets`;
    return (result[0] as Record<string, unknown>).total as number;
  }
}

export class InMemoryPacketStore implements PacketStore {
  private packets: SolvedPacket[] = [];

  async insert(packet: SolvedPacket): Promise<void> {
    this.packets.push(packet);
  }

  async findById(id: string): Promise<SolvedPacket | null> {
    return this.packets.find((p) => p.id === id) ?? null;
  }

  async list(limit: number, offset: number): Promise<{ packets: SolvedPacket[]; total: number }> {
    return {
      packets: this.packets.slice(offset, offset + limit),
      total: this.packets.length,
    };
  }

  async search(query: string): Promise<{ results: SolvedPacket[]; count: number }> {
    const q = query.toLowerCase();
    const results = this.packets.filter((p) => {
      const symptomMatch = p.symptom.description.toLowerCase().includes(q);
      const errorMatch = p.symptom.errorMessage?.toLowerCase().includes(q);
      return symptomMatch || errorMatch;
    });
    return { results, count: results.length };
  }

  async count(): Promise<number> {
    return this.packets.length;
  }
}
