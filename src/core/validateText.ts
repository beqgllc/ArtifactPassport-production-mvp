import type { CheckResult, ArtifactKind } from './types';
import { resolveReference } from './path';
import { scanSecrets } from './security';

const MAX_TEXT_BYTES = 2 * 1024 * 1024;

function pass(id: string, label: string, detail: string, file?: string): CheckResult {
  return { id, label, detail, severity: 'pass', ...(file ? { file } : {}) };
}
function warn(id: string, label: string, detail: string, file?: string): CheckResult {
  return { id, label, detail, severity: 'warning', ...(file ? { file } : {}) };
}
function error(id: string, label: string, detail: string, file?: string): CheckResult {
  return { id, label, detail, severity: 'error', ...(file ? { file } : {}) };
}

export interface TextValidationContext {
  path: string;
  kind: ArtifactKind;
  text: string;
  availablePaths?: Set<string>;
}

export function validateText(context: TextValidationContext): CheckResult[] {
  const { path, kind, text, availablePaths } = context;
  const checks: CheckResult[] = [];

  if (new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
    checks.push(warn('text-size', 'Text inspection capped', 'This text file exceeds 2 MiB; deep text checks were skipped to protect browser memory.', path));
    return checks;
  }

  if (kind === 'json') {
    try {
      JSON.parse(text);
      checks.push(pass('json-parse', 'JSON parses', 'Valid JSON syntax.', path));
    } catch (err) {
      checks.push(error('json-parse', 'JSON syntax', err instanceof Error ? err.message : 'Invalid JSON.', path));
      return checks;
    }
  }

  if (kind === 'javascript') {
    try {
      // This parses the source; it does not execute it.
      // eslint-disable-next-line no-new-func
      new Function(text);
      checks.push(pass('js-parse', 'JavaScript parses', 'Source compiled successfully without executing it.', path));
    } catch (err) {
      checks.push(error('js-parse', 'JavaScript syntax', err instanceof Error ? err.message : 'Invalid JavaScript syntax.', path));
    }
  }

  if (kind === 'html') {
    try {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const parserError = doc.querySelector('parsererror');
      if (parserError) checks.push(error('html-parse', 'HTML parses', parserError.textContent || 'HTML parse failed.', path));
      else checks.push(pass('html-parse', 'HTML parses', 'Browser HTML parser accepted the document.', path));

      const viewport = doc.querySelector('meta[name="viewport"]');
      if (viewport) checks.push(pass('html-viewport', 'Mobile viewport', 'Responsive viewport meta tag is present.', path));
      else checks.push(warn('html-viewport', 'Mobile viewport', 'No viewport meta tag was detected.', path));

      const title = doc.querySelector('title');
      if (title?.textContent?.trim()) checks.push(pass('html-title', 'Document title', 'A non-empty <title> is present.', path));
      else checks.push(warn('html-title', 'Document title', 'No non-empty <title> was detected.', path));

      if (availablePaths) {
        const refs = collectHtmlReferences(doc);
        for (const ref of refs) {
          const resolved = resolveReference(path, ref);
          if (!resolved) continue;
          if (!availablePaths.has(resolved)) checks.push(warn('missing-reference', 'Local reference', `Referenced local file is not present: ${resolved}`, path));
        }
      }
    } catch (err) {
      checks.push(error('html-parse', 'HTML parsing', err instanceof Error ? err.message : 'Unable to parse HTML.', path));
    }
  }

  if (kind === 'css') {
    const refs = collectCssReferences(text);
    if (availablePaths) {
      for (const ref of refs) {
        const resolved = resolveReference(path, ref);
        if (!resolved) continue;
        if (!availablePaths.has(resolved)) checks.push(warn('missing-reference', 'Local CSS reference', `Referenced local file is not present: ${resolved}`, path));
      }
    }
    checks.push(pass('css-scan', 'CSS inspected', `${refs.length} url() reference${refs.length === 1 ? '' : 's'} inspected.`, path));
  }

  const secrets = scanSecrets(text);
  if (secrets.matches.length) {
    const labels = [...new Set(secrets.matches.map((m) => m.type))].join(', ');
    checks.push(warn('secret-scan', 'Potential secrets', `${secrets.matches.length} potential secret pattern${secrets.matches.length === 1 ? '' : 's'} detected (${labels}). Review before sharing or deploying.`, path));
  } else {
    checks.push(pass('secret-scan', 'Obvious secret patterns', 'No supported secret patterns detected in this text.', path));
  }

  return checks;
}

function collectHtmlReferences(doc: Document): string[] {
  const refs: string[] = [];
  doc.querySelectorAll('[src], [href]').forEach((el) => {
    for (const attr of ['src', 'href']) {
      const value = el.getAttribute(attr);
      if (value) refs.push(value);
    }
  });
  doc.querySelectorAll('style').forEach((el) => refs.push(...collectCssReferences(el.textContent ?? '')));
  doc.querySelectorAll('[style]').forEach((el) => refs.push(...collectCssReferences(el.getAttribute('style') ?? '')));
  return refs;
}

function collectCssReferences(text: string): string[] {
  const refs: string[] = [];
  const re = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[1]) refs.push(match[1]);
  }
  return refs;
}
