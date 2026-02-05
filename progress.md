# Project Progress & Decisions

## Timeline

### Monday, January 12, 2026

#### 1. Ideation & Conceptualization
*   **Discussion:** Identified the "Data Flywheel Problem" where private AI-user interactions lead to knowledge silos.
*   **Solution:** Proposed the "Agent Solution Protocol" (ASP) to incentivize and standardize the sharing of bug fixes.
*   **Key Concepts:**
    *   **Solved Packet:** A structured JSON artifact containing the Symptom, Context, Fix (Diff), and Verification (Test).
    *   **Workflow:** User fixes bug -> Agent detects fix -> Agent suggests sharing -> Local Sanitization -> User Approval -> Registry.
    *   **RAG 2.0:** Agents query this global registry to find existing solutions for new users.

#### 2. Architecture & Tech Stack Decisions
*   **Research:** Evaluated Python vs. Node.js for Vector Embeddings and Sanitization (Tree-sitter).
*   **Decision:** **Unified Full Stack TypeScript**
    *   **Rationale:** Allows sharing the "Protocol" (Zod Schema) between Client and Server, ensuring strict validation sync. Node.js AI libraries (`fastembed-js`) are sufficient for our embedding needs.
    *   **Components:**
        *   **Protocol:** Zod (Shared Schema).
        *   **CLI:** TypeScript + Tree-sitter (for parsing/sanitization).
        *   **Server:** TypeScript (Hono/Fastify) + FastEmbed-js.
        *   **Database:** PostgreSQL + pgvector.

#### 3. Next Steps
*   [x] Scaffold the Monorepo structure.
*   [x] Define the initial `SolvedPacket` Zod schema.
*   [x] Create a simple CLI prototype to parse a file and generate a "Sanitized" diff.

---

### Monday, January 12, 2026 (Evening)

#### 4. Scaffolding Complete
*   **Monorepo:** pnpm workspace with Turborepo v2 for builds
*   **@asp/protocol:** Full Zod schema for `SolvedPacket` including:
    *   `SymptomSchema` (errorMessage, stackTrace, description, tags)
    *   `ContextSchema` (language, framework, runtime, dependencies)
    *   `FixSchema` (diff, files, explanation)
    *   `VerificationSchema` (test/command verification)
*   **@asp/server:** Hono-based REST API with endpoints:
    *   `POST /packets` - Submit a solved packet
    *   `GET /packets` - List packets (paginated)
    *   `GET /packets/:id` - Get a specific packet
    *   `POST /search` - Search packets by query
*   **@asp/cli:** Commander-based CLI with commands:
    *   `asp version` - Show protocol version
    *   `asp create` - Create a new packet (with example)
    *   `asp submit <file>` - Submit packet to registry
    *   `asp search <query>` - Search the registry

#### 5. Current Status: ✅ PoC Foundation Complete
*   **Build:** All 3 packages compile successfully with `pnpm build`
*   **Ready to run:**
    *   `pnpm --filter @asp/server dev` → Starts API on http://localhost:3000
    *   `pnpm --filter @asp/cli start version` → Shows protocol version
    *   `pnpm --filter @asp/cli start create -o packet.json` → Creates example packet

#### 6. Code Sanitization: ✅ Complete
*   **Implementation:** Used `web-tree-sitter` (WASM) for cross-platform parsing.
*   **Languages:** TypeScript, JavaScript, Python supported initially.
*   **Logic:** AST traversal to identify and redact sensitive variable values (API keys, secrets) while keeping code structure intact.
*   **CLI Command:** `asp sanitize <file>` added.

#### 7. Next Steps (Priority Order)
1.  [ ] Implement vector embeddings for semantic search (fastembed-js)
2.  [ ] Add PostgreSQL + pgvector persistence
3.  [ ] Add authentication/rate limiting to server
4.  [ ] Create agent integration example (MCP or similar)
### Thursday, February 5, 2026

#### 8. Strategic Direction Expansion
*   **Decision:** Expanded the project vision beyond PoC into an actionable roadmap for product, platform, and ecosystem growth.
*   **Updates Added to README:**
    *   Near-term: private team registries, confidence scoring, context fingerprints, agent UX integrations.
    *   Medium-term: reputation graph, composable fixes, regression alerts, policy-aware sanitization.
    *   Long-term: federated registries, cryptographic provenance, benchmark datasets, incentive mechanisms.
*   **Rationale:** Clarifies execution paths so contributors can align implementation priorities with the broader mission.

#### 9. Next Practical Steps
1.  Add pgvector-backed persistence + semantic retrieval.
2.  Introduce packet scoring metadata in protocol schemas and API responses.
3.  Add private-registry and policy controls for enterprise adoption.
4.  Prototype MCP-style agent integration for end-to-end packet lifecycle.
### Thursday, February 5, 2026 (MVP Validation Follow-up)

#### 10. MVP Validation Confirmed
*   **Decision:** Treated MVP validation as a first-class deliverable before roadmap expansion.
*   **Verification Run:**
    *   `pnpm test` (all workspace tests passing)
    *   `pnpm build` (all packages build)
    *   `pnpm typecheck` (strict TS checks passing)
*   **Outcome:** Pre-expansion MVP baseline is now explicitly validated and documented.

#### 11. Sanitizer Compatibility Fix + Guidance
*   **Issue:** CLI sanitizer was not redacting in tests because grammar loading assumed an incorrect WASM resolution path/API shape.
*   **Fix:** Updated `apps/cli/src/sanitizer.ts` to:
    *   Resolve parser init compatibly across `web-tree-sitter` export shapes.
    *   Resolve grammar WASM files via `require.resolve(...)` package paths instead of fragile relative paths.
*   **Result:** CLI sanitizer tests now pass consistently in the workspace test run.
*   **Guidance Added:** README now includes concrete sanitization hardening recommendations (policy profiles, structured secret detectors, path-based masking, human review gate).

### Thursday, February 5, 2026 (Scenario Test Environment)

#### 12. End-to-End Scenario Test Harness Added
*   **Decision:** Added a repeatable local scenario runner so contributors can validate new ideas without manually orchestrating server + CLI + API calls.
*   **Implementation:**
    *   Added `scripts/run-test-env.mjs` to:
        *   Start local registry server on configurable port.
        *   Run sanitizer test cases via CLI against sample code.
        *   Submit packet payloads to `/packets`.
        *   Validate `/search` returns expected minimum results.
    *   Added `testing/scenarios/smoke.json` as the baseline scenario template.
    *   Added root scripts:
        *   `pnpm test:env`
        *   `pnpm test:env:smoke`
*   **Outcome:** Project now has a complete, extensible test environment for quickly validating new scenarios end-to-end.
