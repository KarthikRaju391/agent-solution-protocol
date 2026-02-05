#!/usr/bin/env node
import { Command } from 'commander';
import { protocolVersion, createPacket, type Symptom, type Context, type Fix } from '@asp/protocol';
import { CodeSanitizer } from './sanitizer.js';
import path from 'path';

const program = new Command();

program
  .name('asp')
  .description('Agent Solution Protocol CLI')
  .version(protocolVersion);

program
  .command('version')
  .description('Show protocol version')
  .action(() => {
    console.log(`ASP Protocol v${protocolVersion}`);
  });

program
  .command('sanitize <file>')
  .description('Sanitize a file by redacting sensitive information')
  .option('-l, --lang <language>', 'Language of the file (typescript, javascript, python)')
  .action(async (file, options) => {
    const fs = await import('fs/promises');
    try {
      const code = await fs.readFile(file, 'utf-8');
      const lang = options.lang || path.extname(file).slice(1) || 'typescript';
      
      const sanitizer = new CodeSanitizer();
      const sanitized = await sanitizer.sanitize(code, lang);
      
      console.log('--- Sanitized Output ---');
      console.log(sanitized);
      console.log('------------------------');
    } catch (error) {
      console.error(`❌ Error:`, error);
    }
  });

program
  .command('create')
  .description('Create a new solved packet (interactive)')
  .option('-o, --output <file>', 'Output file path')
  .action(async (options) => {
    console.log('Creating a new Solved Packet...\n');
    
    const symptom: Symptom = {
      description: 'Example: TypeError when calling undefined function',
      errorMessage: 'TypeError: undefined is not a function',
      tags: ['typescript', 'runtime-error'],
    };
    
    const context: Context = {
      language: 'TypeScript',
      languageVersion: '5.3',
      framework: 'Node.js',
      runtime: 'Node.js 20',
    };
    
    const fix: Fix = {
      diff: `--- a/src/example.ts
+++ b/src/example.ts
@@ -1,3 +1,3 @@
-const result = someFunction();
+const result = someFunction?.() ?? defaultValue;`,
      files: ['src/example.ts'],
      explanation: 'Added optional chaining and nullish coalescing to handle undefined',
    };
    
    const packet = createPacket(symptom, context, fix);
    
    if (options.output) {
      const fs = await import('fs/promises');
      await fs.writeFile(options.output, JSON.stringify(packet, null, 2));
      console.log(`✅ Packet saved to ${options.output}`);
    } else {
      console.log(JSON.stringify(packet, null, 2));
    }
  });

program
  .command('submit <file>')
  .description('Submit a solved packet to the registry')
  .option('-r, --registry <url>', 'Registry URL', 'http://localhost:3000')
  .action(async (file, options) => {
    const fs = await import('fs/promises');
    
    try {
      const content = await fs.readFile(file, 'utf-8');
      const packet = JSON.parse(content);
      
      const response = await fetch(`${options.registry}/packets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packet),
      });
      
      const result = (await response.json()) as { id?: string; error?: string };
      
      if (response.ok) {
        console.log(`✅ Packet submitted successfully! ID: ${result.id}`);
      } else {
        console.error(`❌ Submission failed:`, result);
      }
    } catch (error) {
      console.error(`❌ Error:`, error);
    }
  });

program
  .command('search <query>')
  .description('Search the registry for solutions')
  .option('-r, --registry <url>', 'Registry URL', 'http://localhost:3000')
  .action(async (query, options) => {
    try {
      const response = await fetch(`${options.registry}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      
      const result = (await response.json()) as { count: number; results: Array<{ id: string; symptom: { description: string } }> };
      
      if (result.count === 0) {
        console.log('No solutions found.');
      } else {
        console.log(`Found ${result.count} solution(s):\n`);
        for (const packet of result.results) {
          console.log(`- [${packet.id.slice(0, 8)}] ${packet.symptom.description}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error:`, error);
    }
  });

program.parse();
