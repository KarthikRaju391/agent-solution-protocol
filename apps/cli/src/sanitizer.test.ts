import { describe, it, expect, beforeAll } from 'vitest';
import { CodeSanitizer } from './sanitizer.js';

describe('CodeSanitizer', () => {
  let sanitizer: CodeSanitizer;

  beforeAll(async () => {
    sanitizer = new CodeSanitizer();
    await sanitizer.init();
  });

  it('should sanitize sensitive variables in TypeScript', async () => {
    const code = `
      const apiKey = "sk-1234567890abcdef12345678";
      const other = "safe";
    `;
    
    // We expect "sk-..." to be redacted because it looks like a key (long string) 
    // AND/OR variable name contains 'key'.
    
    const sanitized = await sanitizer.sanitize(code, 'typescript');
    
    expect(sanitized).toContain('"<REDACTED>"');
    expect(sanitized).not.toContain('sk-1234567890abcdef12345678');
    expect(sanitized).toContain('const apiKey =');
    expect(sanitized).toContain('const other = "safe"');
  });

  it('should return original code if language not supported (or parser fails)', async () => {
    const code = 'some random text';
    const result = await sanitizer.sanitize(code, 'unknown-lang');
    expect(result).toBe(code);
  });
});
