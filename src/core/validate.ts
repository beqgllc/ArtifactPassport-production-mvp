import { classifyPath } from './classify';
import { sha256, artifactIdFromSha256 } from './hash';
import { inspectZip } from './zip';
import { validateText } from './validateText';
import { scanSecrets } from './security';
import type { ArtifactPassport, CheckResult, FileRecord } from './types';
import { ENGINE_VERSION, PASSPORT_VERSION } from './types';

export const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;

export async function inspectArtifact(file: File): Promise<ArtifactPassport> {
  if (file.size > MAX_ARTIFACT_BYTES) {
    throw new Error(`Artifact is ${(file.size / 1024 / 1024).toFixed(1)} MiB. The local MVP limit is 25 MiB.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await sha256(bytes);
  const kind = classifyPath(file.name, file.type);

  let files: FileRecord[] = [];
  let checks: CheckResult[] = [];
  let secretMatches = 0;
  let pathTraversal = 0;

  if (kind === 'zip') {
    const result = inspectZip(bytes);
    files = result.files;
    checks = result.checks;
    secretMatches = result.secretMatches;
    pathTraversal = result.pathTraversal;
  } else if (kind === 'text' || kind === 'html' || kind === 'css' || kind === 'javascript' || kind === 'json') {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const textChecks = validateText({ path: file.name, kind, text });
    checks = [...textChecks];
    const scan = scanSecrets(text);
    secretMatches = scan.matches.length;
    files = [{ path: file.name, size: file.size, kind, checks: textChecks }];
  } else if (kind === 'binary') {
    checks = [{ id: 'binary-readable', label: 'File accepted', severity: 'pass', detail: `${file.size.toLocaleString()} bytes.`, file: file.name }];
    files = [{ path: file.name, size: file.size, kind, checks }];
  } else {
    checks = [{ id: 'unknown-type', label: 'File type', severity: 'warning', detail: 'No specialized validator is registered for this file type.', file: file.name }];
    files = [{ path: file.name, size: file.size, kind, checks }];
  }

  const allChecks = files.flatMap((record) => record.checks).concat(checks);
  const errors = allChecks.filter((c) => c.severity === 'error').length;
  const warnings = allChecks.filter((c) => c.severity === 'warning').length;
  const passed = allChecks.filter((c) => c.severity === 'pass').length;

  return {
    passportVersion: PASSPORT_VERSION,
    engineVersion: ENGINE_VERSION,
    artifactId: artifactIdFromSha256(hash),
    artifact: {
      filename: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      sha256: hash,
      createdAt: new Date().toISOString(),
    },
    source: {
      provider: 'unknown',
      mode: 'local',
    },
    summary: {
      status: errors ? 'error' : warnings ? 'warning' : 'verified',
      files: files.length,
      passed,
      warnings,
      errors,
    },
    security: {
      secretMatches,
      pathTraversal,
      notes: [
        'Inspection is local-first; the original file is not uploaded unless the user starts a cloud handoff.',
        'Secret detection is pattern-based and is not a malware or credential scanner.',
      ],
    },
    files,
    checks: allChecks,
  };
}
