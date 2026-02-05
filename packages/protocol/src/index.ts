import { z } from 'zod';

export const protocolVersion = '0.0.1';

export const ContextSchema = z.object({
  language: z.string().describe('Programming language (e.g., "TypeScript", "Python")'),
  languageVersion: z.string().optional().describe('Language version (e.g., "3.11", "5.3")'),
  framework: z.string().optional().describe('Framework used (e.g., "Next.js 14", "FastAPI")'),
  runtime: z.string().optional().describe('Runtime environment (e.g., "Node.js 20", "Bun 1.0")'),
  os: z.string().optional().describe('Operating system (e.g., "Linux", "macOS", "Windows")'),
  dependencies: z.record(z.string()).optional().describe('Relevant dependencies with versions'),
});

export const SymptomSchema = z.object({
  errorMessage: z.string().optional().describe('The error message or exception text'),
  errorCode: z.string().optional().describe('Error code if applicable'),
  stackTrace: z.string().optional().describe('Sanitized stack trace'),
  description: z.string().describe('Natural language description of the problem'),
  tags: z.array(z.string()).optional().describe('Searchable tags for the symptom'),
});

export const FixSchema = z.object({
  diff: z.string().describe('Unified diff of the fix'),
  files: z.array(z.string()).describe('List of files modified'),
  explanation: z.string().optional().describe('Brief explanation of why the fix works'),
});

export const VerificationSchema = z.object({
  type: z.enum(['test', 'command', 'manual']).describe('Type of verification'),
  command: z.string().optional().describe('Command that passes after the fix'),
  testFile: z.string().optional().describe('Test file that validates the fix'),
  beforeOutput: z.string().optional().describe('Output before the fix (failing)'),
  afterOutput: z.string().optional().describe('Output after the fix (passing)'),
});

export const SolvedPacketSchema = z.object({
  id: z.string().uuid().describe('Unique identifier for the packet'),
  version: z.literal(protocolVersion).describe('Protocol version'),
  createdAt: z.string().datetime().describe('ISO 8601 timestamp'),
  
  symptom: SymptomSchema,
  context: ContextSchema,
  fix: FixSchema,
  verification: VerificationSchema.optional(),
  
  metadata: z.object({
    source: z.string().optional().describe('Agent or tool that created this packet'),
    confidence: z.number().min(0).max(1).optional().describe('Confidence score 0-1'),
    upvotes: z.number().default(0).describe('Community validation score'),
  }).optional(),
});

export type Context = z.infer<typeof ContextSchema>;
export type Symptom = z.infer<typeof SymptomSchema>;
export type Fix = z.infer<typeof FixSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type SolvedPacket = z.infer<typeof SolvedPacketSchema>;

export function createPacketId(): string {
  return crypto.randomUUID();
}

export function createPacket(
  symptom: Symptom,
  context: Context,
  fix: Fix,
  verification?: Verification
): SolvedPacket {
  return {
    id: createPacketId(),
    version: protocolVersion,
    createdAt: new Date().toISOString(),
    symptom,
    context,
    fix,
    verification,
  };
}
