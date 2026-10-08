export function hasPathTraversal(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return normalized.split('/').some((segment) => segment === '..') || normalized.startsWith('/');
}

export function normalizeZipPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function resolveReference(fromFile: string, reference: string): string | null {
  const clean = reference.split('#')[0]?.split('?')[0] ?? '';
  if (!clean || clean.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith('//')) return null;
  const base = fromFile.split('/');
  base.pop();
  const pieces = [...base, ...clean.split('/')];
  const out: string[] = [];
  for (const piece of pieces) {
    if (!piece || piece === '.') continue;
    if (piece === '..') {
      if (out.length) out.pop();
      else return clean;
    } else out.push(piece);
  }
  return out.join('/');
}
