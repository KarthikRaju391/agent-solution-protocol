#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import crypto from 'node:crypto';
import net from 'node:net';

const args = process.argv.slice(2);
const scenarioPath = getArgValue(args, '--scenario') ?? 'testing/scenarios/smoke.json';
const portArg = getArgValue(args, '--port');
const keepServer = args.includes('--keep-server');

let serverProcess;
let tempDir;

try {
  const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
  tempDir = await mkdtemp(path.join(tmpdir(), 'asp-test-env-'));

  const port = portArg ? Number(portArg) : await getFreePort();
  const registry = getArgValue(args, '--registry') ?? `http://127.0.0.1:${port}`;

  console.log(`\n🧪 Scenario: ${scenario.name ?? 'Unnamed scenario'}`);
  if (scenario.description) console.log(`📝 ${scenario.description}`);
  console.log(`📄 Loaded from: ${scenarioPath}`);

  serverProcess = await startServer(port);
  await waitForHealth(`${registry}/health`, 40, 500, serverProcess);
  console.log(`✅ Server healthy at ${registry}`);

  await runSanitizerCases(scenario.sanitizeCases ?? [], tempDir);
  await runPacketFlow(scenario, registry);

  console.log('\n🎉 Test environment run completed successfully.');
  console.log('➡️  Add/edit scenario JSON files in testing/scenarios to test new cases quickly.');
} catch (error) {
  console.error('\n❌ Test environment failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }

  if (serverProcess && !keepServer) {
    serverProcess.kill('SIGTERM');
  }
}

function getArgValue(argv, key) {
  const index = argv.indexOf(key);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

function runCommand(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed (${command} ${commandArgs.join(' ')}):\n${stderr || stdout}`));
      }
    });
  });
}

async function startServer(port) {
  const child = spawn('node', ['apps/server/dist/index.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[server] ${chunk.toString()}`);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[server] ${chunk.toString()}`);
  });

  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`\n[server] exited with code ${code}`);
    }
  });

  return child;
}

async function waitForHealth(url, attempts, delayMs, serverProcess) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // ignore until retries exhausted
    }
    if (serverProcess.exitCode !== null) {
      throw new Error(`Server exited early with code ${serverProcess.exitCode}`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Server did not become healthy at ${url}`);
}

async function runSanitizerCases(cases, tempDir) {
  if (cases.length === 0) {
    console.log('ℹ️  No sanitizer cases configured.');
    return;
  }

  console.log(`\n🔐 Running ${cases.length} sanitizer case(s)...`);
  for (const testCase of cases) {
    const lang = testCase.lang ?? 'typescript';
    const extension = extensionFor(lang);
    const filePath = path.join(tempDir, `${slug(testCase.name ?? 'case')}.${extension}`);
    await writeFile(filePath, testCase.code ?? '', 'utf8');

    const { stdout } = await runCommand('pnpm', ['--filter', '@asp/cli', 'start', 'sanitize', filePath, '--lang', lang]);

    assertContains(stdout, testCase.mustContain ?? [], `sanitize:${testCase.name}:mustContain`);
    assertNotContains(stdout, testCase.mustNotContain ?? [], `sanitize:${testCase.name}:mustNotContain`);

    if (testCase.expectRedacted && !stdout.includes('<REDACTED>')) {
      throw new Error(`sanitize:${testCase.name}: expected output to contain <REDACTED>`);
    }

    console.log(`  ✅ ${testCase.name}`);
  }
}

async function runPacketFlow(scenario, registry) {
  const packets = normalizePackets(scenario.packets ?? (scenario.packet ? [scenario.packet] : []));

  console.log(`\n📦 Submitting ${packets.length} packet(s)...`);
  for (const packet of packets) {
    const response = await fetch(`${registry}/packets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(packet),
    });

    if (response.status !== 201) {
      const error = await response.text();
      throw new Error(`Packet submission failed (${response.status}): ${error}`);
    }

    const data = await response.json();
    console.log(`  ✅ Submitted packet: ${data.id}`);
  }

  const query = scenario.search?.query ?? 'TypeError';
  const minCount = Number(scenario.search?.minCount ?? 1);

  const searchResponse = await fetch(`${registry}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!searchResponse.ok) {
    throw new Error(`Search request failed (${searchResponse.status})`);
  }

  const searchData = await searchResponse.json();
  if (searchData.count < minCount) {
    throw new Error(`Search returned ${searchData.count}, expected at least ${minCount} for query "${query}"`);
  }

  console.log(`🔎 Search "${query}" returned ${searchData.count} result(s).`);
}

function normalizePackets(packets) {
  return packets.map((packet) => ({
    id: packet.id ?? crypto.randomUUID(),
    version: packet.version ?? '0.0.1',
    createdAt: packet.createdAt ?? new Date().toISOString(),
    ...packet,
  }));
}

function assertContains(haystack, needles, scope) {
  for (const needle of needles) {
    if (!haystack.includes(needle)) {
      throw new Error(`${scope}: expected output to include "${needle}"`);
    }
  }
}

function assertNotContains(haystack, needles, scope) {
  for (const needle of needles) {
    if (haystack.includes(needle)) {
      throw new Error(`${scope}: expected output NOT to include "${needle}"`);
    }
  }
}

function extensionFor(lang) {
  if (lang === 'typescript') return 'ts';
  if (lang === 'javascript') return 'js';
  if (lang === 'python') return 'py';
  return 'txt';
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to determine a free port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}
