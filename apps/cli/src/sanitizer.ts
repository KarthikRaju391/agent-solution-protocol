import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('web-tree-sitter');

const ParserClass = pkg.Parser ?? pkg;
const parserInit: (() => Promise<void>) | undefined = ParserClass.init ?? pkg.init;
const LanguageClass = pkg.Language ?? ParserClass.Language;

const GRAMMAR_MODULE_PATHS: Record<string, string> = {
  typescript: 'tree-sitter-typescript/tree-sitter-typescript.wasm',
  javascript: 'tree-sitter-javascript/tree-sitter-javascript.wasm',
  python: 'tree-sitter-python/tree-sitter-python.wasm',
};

export class CodeSanitizer {
  private parser: any = null;
  private languages: Record<string, any> = {};

  async init() {
    if (typeof parserInit !== 'function') {
      throw new Error(`Tree-sitter parser init function is unavailable. Exports: ${Object.keys(pkg).join(', ')}`);
    }

    await parserInit();
    this.parser = new ParserClass();
  }

  private async getLanguage(lang: string): Promise<any> {
    if (this.languages[lang]) return this.languages[lang];

    const wasmModulePath = GRAMMAR_MODULE_PATHS[lang.toLowerCase()];
    if (!wasmModulePath || !LanguageClass) return null;

    try {
      const resolvedPath = require.resolve(wasmModulePath);
      const language = await LanguageClass.load(resolvedPath);
      this.languages[lang] = language;
      return language;
    } catch {
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

      if (
        (node.type === 'variable_declarator' || node.type === 'assignment_expression' || node.type === 'assignment')
      ) {
        const identifierNode = node.childForFieldName('left') || node.childForFieldName('name') || node.firstChild;
        const valueNode = node.childForFieldName('right') || node.childForFieldName('value') || node.lastChild;

        if (identifierNode && valueNode && identifierNode !== valueNode) {
          const varName = identifierNode.text.toLowerCase();

          const isSensitive = sensitiveNames.some((sn) => varName.includes(sn));

          if (isSensitive && (valueNode.type === 'string' || valueNode.type === 'string_fragment' || valueNode.type === 'number')) {
            edits.push({
              start: valueNode.startIndex,
              end: valueNode.endIndex,
              replacement: '"<REDACTED>"'
            });
          }
        }
      }

      if (node.type === 'string' || node.type === 'string_fragment') {
        const text = node.text.replace(/['"]/g, '');
        if (text.length > 20 && /^[a-zA-Z0-9_\-\.]{20,}$/.test(text)) {
          if (!edits.some((e) => e.start === node.startIndex)) {
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

    edits.sort((a, b) => a.start - b.start || b.end - a.end);

    const validEdits: typeof edits = [];
    let lastEnd = -1;

    for (const edit of edits) {
      if (edit.start >= lastEnd) {
        validEdits.push(edit);
        lastEnd = edit.end;
      }
    }

    let sanitizedCode = code;
    validEdits.sort((a, b) => b.start - a.start);

    for (const edit of validEdits) {
      sanitizedCode = sanitizedCode.slice(0, edit.start) + edit.replacement + sanitizedCode.slice(edit.end);
    }

    return sanitizedCode;
  }
}
