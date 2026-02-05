import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const pkg = require('web-tree-sitter');

// Resolve the actual Parser class from the imported package
// In some versions/builds, 'web-tree-sitter' exports the class directly,
// in others (like 0.26.3 ESM/CJS interop), it exports a namespace with 'Parser'.
const TreeSitter = (typeof pkg.init === 'function') ? pkg : (pkg.Parser || pkg);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Map of language names to their wasm file paths in node_modules
// From dist/index.js, root is ../../../
const GRAMMAR_PATHS: Record<string, string> = {
  typescript: '../../../node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm',
  javascript: '../../../node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm',
  python: '../../../node_modules/tree-sitter-python/tree-sitter-python.wasm',
};

export class CodeSanitizer {
  private parser: any = null;
  private languages: Record<string, any> = {};

  async init() {
    // Check if we found the correct class
    if (typeof TreeSitter.init !== 'function') {
        console.error('Failed to resolve TreeSitter class. Exports:', Object.keys(pkg));
        throw new Error('TreeSitter.init is not a function');
    }
    
    await TreeSitter.init();
    this.parser = new TreeSitter();
  }

  private async getLanguage(lang: string): Promise<any> {
    if (this.languages[lang]) return this.languages[lang];
    
    const wasmPath = GRAMMAR_PATHS[lang.toLowerCase()];
    if (!wasmPath) return null;
    
    try {
      const resolvedPath = path.resolve(__dirname, wasmPath);
      const language = await TreeSitter.Language.load(resolvedPath);
      this.languages[lang] = language;
      return language;
    } catch (error) {
      console.error(`Failed to load grammar for ${lang}:`, error);
      return null;
    }
  }

  async sanitize(code: string, lang: string): Promise<string> {
    if (!this.parser) await this.init();
    
    const language = await this.getLanguage(lang);
    if (!language || !this.parser) return code;
    
    this.parser.setLanguage(language);
    const tree = this.parser.parse(code);
    
    if (!tree) return code;
    
    const edits: { start: number; end: number; replacement: string }[] = [];
    
    // Simple heuristic: Find assignments to variables with "sensitive" names
    const sensitiveNames = ['password', 'secret', 'token', 'apikey', 'key', 'auth', 'credential'];
    
    const cursor = tree.walk();
    const stack = [cursor.currentNode];
    
    while (stack.length > 0) {
      const node = stack.pop()!;
      
      // Check for assignments/variable declarations (language dependent)
      // For TS/JS: variable_declarator, assignment_expression
      // For Python: assignment
      
      if (
        (node.type === 'variable_declarator' || node.type === 'assignment_expression' || node.type === 'assignment')
      ) {
        // Find the "identifier" (variable name) and the "value"
        const identifierNode = node.childForFieldName('left') || node.childForFieldName('name') || node.firstChild;
        const valueNode = node.childForFieldName('right') || node.childForFieldName('value') || node.lastChild;
        
        if (identifierNode && valueNode && identifierNode !== valueNode) {
          const varName = identifierNode.text.toLowerCase();
          
          const isSensitive = sensitiveNames.some(sn => varName.includes(sn));
          
          if (isSensitive && (valueNode.type === 'string' || valueNode.type === 'string_fragment' || valueNode.type === 'number')) {
            edits.push({
              start: valueNode.startIndex,
              end: valueNode.endIndex,
              replacement: '"<REDACTED>"'
            });
          }
        }
      }
      
      // Also catch any string literal that looks like an API key (long hex/base64)
      if (node.type === 'string' || node.type === 'string_fragment') {
        const text = node.text.replace(/['"]/g, '');
        if (text.length > 20 && /^[a-zA-Z0-9_\-\.]{20,}$/.test(text)) {
          // Check if we haven't already marked this for redaction
          if (!edits.some(e => e.start === node.startIndex)) {
            edits.push({
              start: node.startIndex,
              end: node.endIndex,
              replacement: '"<REDACTED>"'
            });
          }
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        stack.push(node.child(i)!);
      }
    }
    
    // Filter out overlapping edits
    edits.sort((a, b) => a.start - b.start || b.end - a.end); // Sort by start asc, then end desc (prefer larger)
    
    const validEdits: typeof edits = [];
    let lastEnd = -1;
    
    for (const edit of edits) {
      if (edit.start >= lastEnd) {
        validEdits.push(edit);
        lastEnd = edit.end;
      }
    }
    
    // Apply edits from back to front to maintain indices
    let sanitizedCode = code;
    validEdits.sort((a, b) => b.start - a.start);
    
    for (const edit of validEdits) {
      sanitizedCode = sanitizedCode.slice(0, edit.start) + edit.replacement + sanitizedCode.slice(edit.end);
    }
    
    return sanitizedCode;
  }
}
