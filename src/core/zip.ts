import { unzipSync } from 'fflate';
import { classifyPath } from './classify';
import { hasPathTraversal, normalizeZipPath } from './path';
import { validateText } from './validateText';
import { scanSecrets } from './security';
import type { CheckResult, FileRecord } from './types';

export const MAX_ZIP_ENTRIES = 1500;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

export interface ZipInspection {
  files: FileRecord[];
  checks: CheckResult[];
  secretMatches: number;
  pathTraversal: number;
}

export function inspectZip(bytes: Uint8Array): ZipInspection {
  const checks: CheckResult[] = [];
  const files: FileRecord[] = [];
  let secretMatches = 0;
  let pathTraversal = 0;

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (err) {
    return {
      files: [],
      secretMatches: 0,
      pathTraversal: 0,
      checks: [{ id: 'zip-open', label: 'ZIP archive', severity: 'error', detail: err instanceof Error ? err.message : 'Unable to read ZIP archive.' }],
    };
  }

  const names = Object.keys(entries);
  if (names.length > MAX_ZIP_ENTRIES) {
    checks.push({ id: 'zip-entry-limit', label: 'ZIP entry count', severity: 'error', detail: `Archive contains ${names.length} entries; maximum supported is ${MAX_ZIP_ENTRIES}.` });
    return { files: [], checks, secretMatches, pathTraversal };
  }

  const totalSize = names.reduce((sum, name) => sum + (entries[name]?.byteLength ?? 0), 0);
  if (totalSize > MAX_ZIP_UNCOMPRESSED_BYTES) {
    checks.push({ id: 'zip-size-limit', label: 'ZIP expanded size', severity: 'error', detail: `Archive expands to ${(totalSize / 1024 / 1024).toFixed(1)} MiB; maximum supported is 100 MiB.` });
    return { files: [], checks, secretMatches, pathTraversal };
  }

  const normalizedNames = names.map(normalizeZipPath);
  const availablePaths = new Set(normalizedNames.filter((name) => !name.endsWith('/')));
  for (const rawName of names) {
    const name = normalizeZipPath(rawName);
    if (hasPathTraversal(rawName)) {
      pathTraversal++;
      checks.push({ id: 'zip-path-traversal', label: 'Unsafe archive path', severity: 'error', detail: `Potential path traversal entry: ${rawName}` });
      continue;
    }
    if (name.endsWith('/')) continue;

    const bytesForFile = entries[rawName];
    if (!bytesForFile) continue;
    const kind = classifyPath(name);
    const recordChecks: CheckResult[] = [];
    if (kind === 'text' || kind === 'html' || kind === 'css' || kind === 'javascript' || kind === 'json') {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytesForFile);
      recordChecks.push(...validateText({ path: name, kind, text, availablePaths }));
      const secretScan = scanSecrets(text);
      secretMatches += secretScan.matches.length;
    } else if (kind === 'binary') {
      recordChecks.push({ id: 'binary-presence', label: 'Binary file present', severity: 'pass', detail: `${bytesForFile.byteLength.toLocaleString()} bytes.`, file: name });
    } else {
      recordChecks.push({ id: 'unknown-file', label: 'Unknown file type', severity: 'warning', detail: 'No specialized validation was applied to this file.', file: name });
    }
    files.push({ path: name, size: bytesForFile.byteLength, kind, checks: recordChecks });
  }

  checks.push({ id: 'zip-open', label: 'ZIP archive', severity: 'pass', detail: `${files.length} file${files.length === 1 ? '' : 's'} inspected.` });
  return { files, checks, secretMatches, pathTraversal };
}
