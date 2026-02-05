# Agent Solution Protocol (ASP) - Agent Instructions

> ⚠️ **IMPORTANT:** Keep `progress.md` updated after completing significant work. Log decisions, completed tasks, and next steps.

## Project Overview

ASP is a protocol for sharing structured bug-fix knowledge between AI agents. It defines "Solved Packets" - standardized records of how bugs were fixed - that can be shared via a global registry.

## Monorepo Structure

```
agent-solution-protocol/
├── packages/
│   └── protocol/          # @asp/protocol - Shared Zod schemas
├── apps/
│   ├── cli/               # @asp/cli - Command-line tool
│   └── server/            # @asp/server - Hono REST API
├── turbo.json             # Turborepo build config
└── pnpm-workspace.yaml    # pnpm workspaces
```

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run development server
pnpm --filter @asp/server dev

# Run CLI commands
pnpm --filter @asp/cli start <command>

# Type checking
pnpm typecheck

# Clean build artifacts
pnpm clean
```

## Tech Stack

- **Runtime:** Node.js 20+ (ESM)
- **Package Manager:** pnpm 9.x with workspaces
- **Build:** Turborepo v2
- **Language:** TypeScript 5.x (strict mode)
- **Validation:** Zod
- **Server:** Hono
- **Database:** PostgreSQL + pgvector (planned)
- **Embeddings:** fastembed-js or OpenAI (planned)
- **Code Parsing:** Tree-sitter

## Code Conventions

- All packages use ESM (`"type": "module"`)
- Shared types/schemas go in `@asp/protocol`
- Use workspace protocol for internal deps: `"@asp/protocol": "workspace:*"`
- Keep business logic in the package that owns the domain
- Prefer Zod schemas with `.describe()` for self-documenting types

## Key Files

- `packages/protocol/src/index.ts` - Core schemas (SolvedPacket, Symptom, Context, Fix, Verification)
- `apps/server/src/index.ts` - REST API endpoints
- `apps/cli/src/index.ts` - CLI commands

## Testing

- **Framework:** Vitest
- **Test Files:** `*.test.ts` files co-located with source.
- **Commands:**
  ```bash
  # Run all tests (via Turbo)
  pnpm test

  # Run tests for a specific package
  pnpm --filter @asp/cli test
  ```

## Progress Tracking

**Always append updates to `progress.md` when:**
- Completing a task or feature
- Making architectural decisions
- Changing the tech stack
- Adding new packages or significant dependencies