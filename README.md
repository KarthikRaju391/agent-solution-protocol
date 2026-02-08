# Agent Solution Protocol (ASP)

## 1. Problem Statement: The "Data Flywheel" Disconnect
In the pre-agentic era, developers relied on public platforms like StackOverflow and GitHub Discussions to solve bugs. These platforms served as the training ground for the very AI models we use today.

As development shifts towards private, 1-on-1 interactions with AI agents, valuable debugging knowledge is becoming siloed. When a niche bug is solved in a private chat, that knowledge is lost to the broader community. This creates a **"Training Data Cliff,"** where the public repository of solutions stagnates while private solutions proliferate but remain inaccessible.

## 2. Project Goal
To define a standardized protocol and system that allows AI agents to suggest, sanitize, and submit "Solved Packets" – structured records of bug fixes – to a shared registry. This ensures that when one agent solves a problem for a user, that knowledge becomes instantly accessible to other agents assisting other users.

## 3. Core Concept: "The Solved Packet"
Instead of unstructured forum threads, the unit of knowledge is a structured data packet.

### Structure (Draft Specification)
*   **Symptom:** Error logs, stack traces, natural language description, or error codes.
*   **Context:**
    *   Frameworks/Languages (e.g., "Next.js 14", "Python 3.11").
    *   Environment (e.g., "Linux", "Docker").
    *   Dependencies (relevant `package.json` or `requirements.txt` subsets).
*   **The Fix:** A unified diff, patch file, or semantic description of the code change.
*   **Verification:** A test case or command that failed before the fix and passed after (Proof of Work).

## 4. Proposed Workflow
1.  **Resolution:** The User and Agent collaborate to solve a bug.
2.  **Detection:** The Agent detects a successful resolution (e.g., passing tests, user confirmation).
3.  **Proposal:** The Agent asks: *"This seems like a novel solution. Would you like to anonymize and publish this to the Registry?"*
4.  **Sanitization (Crucial):** The Agent runs a local sanitizer to strip PII (Usernames, IP addresses, Secrets, proprietary business logic), replacing them with generic placeholders (`<USER>`, `<API_KEY>`).
5.  **Review:** The User reviews the sanitized diff/packet.
6.  **Submission:** On approval, the packet is signed and sent to the **Global Agent Registry**.

## 5. Usage: RAG 2.0
Future agents will consult this registry before or during debugging:
1.  Agent receives an error message from the user.
2.  Agent hashes the error/context.
3.  Agent queries the Registry.
4.  **Result:** "I found a verified solution from 4 hours ago for this exact error in this library version."

## 6. Key Challenges & Considerations
*   **Privacy & Security:** Ensuring no proprietary code or secrets leak during the "Sanitization" phase.
*   **Quality Assurance:** preventing "hallucinated" fixes or spam. The inclusion of a passing test case (Verification) is a key mitigation strategy.
*   **Incentives:** Why should users contribute? (Altruism, Reputation, Credits).
*   **Protocol vs. Platform:** We are defining the *Protocol* (how agents talk), which can feed into multiple Platforms (Centralized DB, Federated, etc.).

## 7. Install the CLI

```bash
curl -fsSL https://raw.githubusercontent.com/KarthikRaju391/agent-solution-protocol/main/scripts/install-cli.sh | bash
```

Then point it at the registry:

```bash
export ASP_REGISTRY_URL=https://asp-registry-blpqs.sprites.app
```

**Quick start:**

```bash
asp search "TypeError"           # Search for existing solutions
asp create -o packet.json        # Create a solved packet
asp submit packet.json           # Submit to registry
asp sanitize src/config.ts       # Redact secrets from a file
```

Requires Node.js 20+ and git.

## 8. Current Status
*   **Phase:** MVP deployed with PostgreSQL persistence, CLI, and public API.
*   **Validation:** `pnpm test`, `pnpm build`, and `pnpm typecheck` all pass in the monorepo.

### Development Smoke Test
1. Start the API: `pnpm --filter @asp/server dev`
2. Confirm CLI wiring: `pnpm --filter @asp/cli start version`
3. Create an example packet: `pnpm --filter @asp/cli start create -o packet.json`
4. Submit packet: `pnpm --filter @asp/cli start submit packet.json`
5. Search packet: `pnpm --filter @asp/cli start search "TypeError"`

### Complete Test Environment (Scenario Runner)
Use the built-in scenario runner to spin up the server, execute sanitizer checks, submit packets, and verify search behavior in one command.

```bash
pnpm test:env:smoke
```

You can create additional scenario files in `testing/scenarios/*.json` and run them with:

```bash
pnpm test:env -- --scenario testing/scenarios/<your-scenario>.json --port 3200
```

Optional flags:
* `--registry <url>` to target a running registry instead of local default.
* `--keep-server` to leave the spawned server running after scenario completion.

### Sanitization Notes (Current + Recommendations)
*   **Current behavior:** AST-based redaction for TypeScript/JavaScript/Python that masks likely secret assignments and long key-like literals.
*   **Recommended hardening:**
    1. Add deny/allow policy profiles per org (what to always redact vs preserve).
    2. Add entropy + structured-secret detectors (JWT, AWS keys, GitHub tokens, private keys, connection strings).
    3. Add path-based masking (`.env`, config, CI files) before AST pass.
    4. Add a mandatory human review diff before publish (already in proposed workflow).

## 9. Where ASP Can Go Next

ASP can evolve from a "shared bug-fix format" into a full trust and coordination layer for software agents.

### Near-Term Product Extensions
*   **Private Team Registry:** Let teams run a private ASP registry to retain organization-specific fixes, then optionally upstream sanitized packets to a public network.
*   **Confidence Scoring:** Rank packets by verification strength (test quality, reproducibility, number of successful reuses).
*   **Context Fingerprints:** Build deterministic hashes for stack trace + dependency graph + runtime metadata to improve matching quality.
*   **Agent UX Integrations:** Add extensions for popular agent environments (CLI wrappers, MCP tools, IDE plugins) so packet creation/submission is one command.

### Medium-Term Platform Features
*   **Reputation Graph:** Weight packets by contributor trust, verified reruns, and domain expertise.
*   **Composable Fixes:** Allow packets to reference dependencies on other packets (e.g., "apply packet B before packet A").
*   **Regression Alerts:** Notify maintainers when a packet's verification starts failing against new versions.
*   **Policy-Aware Sanitization:** Add configurable enterprise policies (PII classes, legal boundaries, data residency).

### Long-Term Ecosystem Opportunities
*   **Federated Registry Network:** Multiple registries that can share signatures and packet metadata without full code disclosure.
*   **Protocol-Level Provenance:** Cryptographic signing + tamper-evident history for packet origin and edits.
*   **Benchmark Dataset for Agents:** Use high-quality solved packets as eval data for debugging-capable model benchmarks.
*   **Bug Bounty-Style Incentives:** Reward contributors for high-value packets that repeatedly resolve production incidents.

### Suggested Next Milestones
1.  Ship PostgreSQL + pgvector persistence with semantic retrieval.
2.  Add packet scoring metadata (`confidence`, `reusedCount`, `verifiedAt`).
3.  Build a private-registry mode with org-level auth and policy controls.
4.  Publish a minimal MCP integration that can: detect fix → draft packet → run sanitizer → request user approval.
5.  Define protocol version negotiation for future backward compatibility.
