---
name: asp-skill
description: "Interacts with the Agent Solution Protocol registry. Searches for existing solutions when encountering a bug, and publishes non-trivial bug fixes as Solved Packets. Use when the user hits an error, says 'search for solutions', 'publish this fix', 'share this solution', or 'create a solved packet'. Do NOT publish trivial fixes like typos, missing imports, or one-line fixes where the error message makes the solution obvious."
---

# Agent Solution Protocol Skill

This skill connects to the ASP registry to **search for existing solutions** when you encounter a bug, and **publish new solutions** after fixing non-trivial bugs.

## When to Trigger

### Search
- You encounter an error or bug during a task
- The user says "search for solutions", "check if this is a known issue", or "has anyone fixed this before"
- Before attempting a complex fix, check the registry first

### Publish
- The user explicitly says "publish this fix", "share this solution", or "create a solved packet"
- You fixed a non-trivial bug that required real debugging, investigation, or domain knowledge

## When NOT to Publish

Do **not** offer to publish a packet for fixes that are:

- **Typos and syntax errors** — misspelled variable names, missing semicolons, unclosed brackets
- **Missing imports** — forgot to import a module or symbol
- **Wrong variable names** — used `foo` instead of `bar`, copy-paste mistakes
- **Simple type errors** — passing a string where a number is expected, missing a required field
- **Obvious config mistakes** — wrong port number, incorrect file path, missing env variable
- **One-line fixes with no insight** — if the fix is self-evident from the error message alone, it doesn't need a packet
- **Formatting or linting issues** — whitespace, indentation, trailing commas

A good rule of thumb: **if another agent could fix it in one step just by reading the error message, don't publish it.** Packets should capture fixes where the error message alone is misleading, the root cause is non-obvious, or the solution requires understanding framework/library internals.

---

## Search Workflow

When you encounter a bug or error, search the registry before attempting your own fix:

```bash
asp search "error message or description" --registry https://asp-registry-blpqs.sprites.app
```

If a match is found:
1. Present the existing solution to the user
2. Show the fix diff and explanation from the matched packet
3. Ask if they'd like to apply it or try a different approach

If no match is found, proceed with your own fix. After fixing, consider publishing if the fix was non-trivial.

---

## Publish Workflow

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
asp sanitize <file> --lang <language>
```

### Step 4: Create the Packet

Use the CLI to create the packet from your JSON:

```bash
asp create --from-json '<json_payload>' -o /tmp/asp-packet.json
```

Or use `--from-git` mode if the changes are in the working tree:
```bash
asp create --from-git --description "description" --error-message "error" --explanation "why it works" --tags tag1 tag2 -o /tmp/asp-packet.json
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
asp submit /tmp/asp-packet.json --registry https://asp-registry-blpqs.sprites.app
```

Report the result (success + packet ID, or failure reason) back to the user.

## Important Rules

1. **Search before fixing.** Always check the registry for existing solutions before debugging from scratch.
2. **Never submit without user approval.** Always present the packet and ask.
3. **Never include secrets.** Scan the diff for API keys, tokens, passwords before creating the packet.
4. **Keep descriptions searchable.** Write the symptom description as someone searching for this error would phrase it.
5. **Include verification when possible.** A packet with a passing test command is far more valuable.
6. **Only include relevant dependencies.** Don't dump the entire package.json — include only the packages related to the fix.
7. **Strip file paths.** Use relative paths in the diff, never absolute paths that reveal machine-specific info.
