import { describe, it, expect } from 'vitest';
import { createPacket, SolvedPacketSchema } from './index.js';

describe('Protocol', () => {
  it('should create a valid packet', () => {
    const symptom = {
      description: 'Test Error',
      errorMessage: 'Error: failed',
    };
    const context = {
      language: 'TypeScript',
    };
    const fix = {
      diff: 'diff',
      files: ['test.ts'],
    };

    const packet = createPacket(symptom, context, fix);

    expect(packet.id).toBeDefined();
    expect(packet.symptom).toEqual(symptom);
    expect(packet.context).toEqual(context);
    expect(packet.fix).toEqual(fix);
    
    // Validate with Zod
    const result = SolvedPacketSchema.safeParse(packet);
    expect(result.success).toBe(true);
  });

  it('should fail validation with invalid data', () => {
    const invalidPacket = {
      id: 'not-uuid',
      version: '0.0.0', // wrong version
      // missing fields
    };
    
    const result = SolvedPacketSchema.safeParse(invalidPacket);
    expect(result.success).toBe(false);
  });
});
