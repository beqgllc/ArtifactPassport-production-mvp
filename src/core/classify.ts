import type { ArtifactKind } from './types';

export function classifyPath(path: string, mime = ''): ArtifactKind {
  const lower = path.toLowerCase();
  if (lower.endsWith('.zip') || mime === 'application/zip' || mime === 'application/x-zip-compressed') return 'zip';
  if (lower.endsWith('.html') || lower.endsWith('.htm') || mime.includes('text/html')) return 'html';
  if (lower.endsWith('.css') || mime === 'text/css') return 'css';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs') || mime.includes('javascript')) return 'javascript';
  if (lower.endsWith('.json') || mime.includes('application/json')) return 'json';
  if (/\.(txt|md|markdown|csv|xml|svg|yaml|yml|env|log)$/i.test(lower) || mime.startsWith('text/')) return 'text';
  if (/\.(png|jpe?g|gif|webp|bmp|ico|woff2?|ttf|otf|pdf|mp3|mp4|mov|webm)$/i.test(lower)) return 'binary';
  return 'unknown';
}
