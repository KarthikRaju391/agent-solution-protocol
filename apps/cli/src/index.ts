#!/usr/bin/env node
import { Command } from 'commander';
import { protocolVersion, createPacket, SymptomSchema, ContextSchema, FixSchema, VerificationSchema, type Symptom, type Context, type Fix, type Verification } from '@asp/protocol';
import { CodeSanitizer } from './sanitizer.js';
import path from 'path';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const DEFAULT_REGISTRY = process.env.ASP_REGISTRY_URL || 'https://asp-registry-blpqs.sprites.app';

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
  .option('--from-json <json>', 'Create packet from a JSON payload string')
  .option('--from-git', 'Auto-detect context from current git repo')
  .option('--description <text>', 'Symptom description (required with --from-git)')
  .option('--error-message <text>', 'Error message (optional with --from-git)')
  .option('--explanation <text>', 'Fix explanation (optional with --from-git)')
  .option('--tags <tags...>', 'Searchable tags (optional with --from-git)')
  .action(async (options) => {
    let packet;

    if (options.fromJson) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(options.fromJson);
      } catch {
        console.error('Invalid JSON string');
        process.exit(1);
      }

      const symptom = SymptomSchema.parse(parsed.symptom);
      const context = ContextSchema.parse(parsed.context);
      const fix = FixSchema.parse(parsed.fix);
      const verification = parsed.verification
        ? VerificationSchema.parse(parsed.verification)
        : undefined;

      packet = createPacket(symptom, context, fix, verification);
    } else if (options.fromGit) {
      if (!options.description) {
        console.error('--description is required with --from-git');
        process.exit(1);
      }

      let diff: string;
      try {
        const unstaged = execSync('git diff HEAD', { encoding: 'utf-8' }).trim();
        diff = unstaged || execSync('git diff --cached', { encoding: 'utf-8' }).trim();
      } catch {
        console.error('Failed to run git diff. Are you in a git repository?');
        process.exit(1);
      }

      if (!diff) {
        console.error('No changes detected in git');
        process.exit(1);
      }

      const files = Array.from(
        new Set(
          diff
            .split('\n')
            .filter((line) => line.startsWith('diff --git'))
            .map((line) => {
              const match = line.match(/b\/(.+)$/);
              return match ? match[1] : '';
            })
            .filter(Boolean)
        )
      );

      let language = 'Unknown';
      let languageVersion: string | undefined;
      let framework: string | undefined;
      let runtime: string | undefined;
      let dependencies: Record<string, string> | undefined;

      try {
        const pkgJson = JSON.parse(readFileSync('package.json', 'utf-8'));
        language = 'TypeScript';
        if (pkgJson.devDependencies?.typescript) {
          languageVersion = pkgJson.devDependencies.typescript.replace(/[\^~]/, '');
        } else if (pkgJson.dependencies?.typescript) {
          languageVersion = pkgJson.dependencies.typescript.replace(/[\^~]/, '');
        } else {
          language = 'JavaScript';
        }
        runtime = `Node.js ${process.version}`;

        const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
        const frameworkCandidates = ['next', 'react', 'vue', 'angular', 'express', 'hono', 'fastify', 'svelte', 'nuxt'];
        for (const name of frameworkCandidates) {
          if (allDeps[name]) {
            framework = `${name} ${allDeps[name].replace(/[\^~]/, '')}`;
            break;
          }
        }

        dependencies = {};
        for (const [name, ver] of Object.entries(allDeps)) {
          dependencies[name] = ver as string;
        }
      } catch {
        try {
          readFileSync('pyproject.toml', 'utf-8');
          language = 'Python';
          runtime = `Python`;
        } catch {
          // Could not detect project metadata
        }
      }

      const symptom: Symptom = {
        description: options.description,
        errorMessage: options.errorMessage,
        tags: options.tags,
      };

      const context: Context = {
        language,
        languageVersion,
        framework,
        runtime,
        os: process.platform,
        dependencies,
      };

      const fix: Fix = {
        diff,
        files,
        explanation: options.explanation,
      };

      packet = createPacket(symptom, context, fix);
    } else {
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

      packet = createPacket(symptom, context, fix);
    }

    if (options.output) {
      const fs = await import('fs/promises');
      await fs.writeFile(options.output, JSON.stringify(packet, null, 2));
      console.log(`Packet saved to ${options.output}`);
    } else {
      console.log(JSON.stringify(packet, null, 2));
    }
  });

program
  .command('submit <file>')
  .description('Submit a solved packet to the registry')
  .option('-r, --registry <url>', 'Registry URL', DEFAULT_REGISTRY)
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
  .option('-r, --registry <url>', 'Registry URL', DEFAULT_REGISTRY)
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
