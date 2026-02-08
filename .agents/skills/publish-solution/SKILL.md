---
name: publish-solution
description: "Packages a bug fix into a Solved Packet and publishes it to the ASP registry. Use after fixing a bug, resolving an error, or when the user says 'publish this fix', 'share this solution', or 'create a solved packet'."
---

# Publish Solution

After you fix a bug, this skill packages the fix into a **Solved Packet** (symptom + context + diff + verification) and submits it to the Agent Solution Protocol registry so other agents can find and reuse it.

## When to Trigger

- You just fixed a bug and tests pass
- The user says "publish this fix", "share this solution", "create a solved packet"
- You resolved an error that others might encounter

## Workflow

### Step 1: Gather Context

You already have most of what you need from the current conversation. Collect:

- **Symptom**: The error message, stack trace, and a short description of the problem
- **Context**: Language, framework, runtime, relevant dependencies (read from `package.json`, `pyproject.toml`, etc.)
- **Fix**: The git diff of what you changed, the list of files, and a brief explanation
- **Verification** (optional): The test command that now passes, or the test file that validates the fix

### Step 2: Build the Packet JSON

Construct a JSON payload with the following structure:

```json
{
  "symptom": {
    "description": "Short description of the bug",
    "errorMessage": "The actual error text (if any)",
    "stackTrace": "Sanitized stack trace (if any)",
    "tags": ["relevant", "searchable", "tags"]
  },
  "context": {
    "language": "TypeScript",
    "languageVersion": "5.3",
    "framework": "Hono 4.6",
    "runtime": "Node.js 20",
    "os": "linux",
    "dependencies": {"key-package": "1.2.3"}
  },
  "fix": {
    "diff": "unified diff output from git",
    "files": ["src/file1.ts", "src/file2.ts"],
    "explanation": "Brief explanation of why this fix works"
  },
  "verification": {
    "type": "command",
    "command": "pnpm test",
    "beforeOutput": "FAIL ...",
    "afterOutput": "PASS ..."
  }
}
```

### Step 3: Sanitize

Before publishing, check the diff for sensitive information:
- API keys, tokens, passwords, secrets
- Internal URLs or IP addresses
- Proprietary business logic that shouldn't be shared

If the diff contains sensitive files (`.env`, config files with credentials), either redact those values or exclude those files.

You can use the CLI sanitizer for code files:
```bash
pnpm --filter @asp/cli start sanitize <file> --lang <language>
```

### Step 4: Create the Packet

Use the CLI to create the packet from your JSON:

```bash
pnpm --filter @asp/cli start create --from-json '<json_payload>' -o /tmp/asp-packet.json
```

Or use `--from-git` mode if the changes are in the working tree:
```bash
pnpm --filter @asp/cli start create --from-git --description "description" --error-message "error" --explanation "why it works" --tags tag1 tag2 -o /tmp/asp-packet.json
```

### Step 5: Present to User for Approval

**Always show the user the packet before submitting.** Display:
- The symptom description and error message
- The list of files changed
- The diff (or a summary if it's very long)
- Note that this will be published to a shared registry

Ask: "I've packaged this fix as a Solved Packet. Would you like to publish it to the ASP registry so other agents can find this solution?"

### Step 6: Submit

Only after the user approves:

```bash
pnpm --filter @asp/cli start submit /tmp/asp-packet.json --registry http://localhost:3000
```

Report the result (success + packet ID, or failure reason) back to the user.

## Important Rules

1. **Never submit without user approval.** Always present the packet and ask.
2. **Never include secrets.** Scan the diff for API keys, tokens, passwords before creating the packet.
3. **Keep descriptions searchable.** Write the symptom description as someone searching for this error would phrase it.
4. **Include verification when possible.** A packet with a passing test command is far more valuable.
5. **Only include relevant dependencies.** Don't dump the entire package.json — include only the packages related to the fix.
6. **Strip file paths.** Use relative paths in the diff, never absolute paths that reveal machine-specific info.

## Searching for Existing Solutions

Before fixing a bug yourself, you can check if a solution already exists:

```bash
pnpm --filter @asp/cli start search "error message or description" --registry http://localhost:3000
```

If a match is found, present it to the user before attempting your own fix.
