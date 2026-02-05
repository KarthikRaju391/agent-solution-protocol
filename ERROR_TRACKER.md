# Error Tracker

## Resolved Issues

### @asp/cli Build Errors
**Date:** 2026-01-12
**File:** `apps/cli/src/sanitizer.ts`
**Errors:**
1. `TS2709: Cannot use namespace 'Parser' as a type.`
2. `TS2339: Property 'init' does not exist...`
3. `TS2351: This expression is not constructable.`
4. `TS18047: 'tree' is possibly 'null'.`
5. Runtime Error: `ENOENT` for WASM file loading.
6. Logic Error: Overlapping edits corrupted sanitized code.

**Resolution:**
- Changed `import Parser` to `import { Parser, Language }` (Named imports).
- Updated `Parser.Language` to `Language`.
- Added null check for `tree`.
- Corrected relative path to `node_modules` from `../../` to `../`.
- Added edit filtering to remove overlapping edits (keeping the first/outer one).

**Status:** ✅ Fixed. Tests passing.