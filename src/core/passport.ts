import type { ArtifactPassport } from './types';
import { utf8ToBase64Url } from './base64';

export function passportToJson(passport: ArtifactPassport): string {
  return JSON.stringify(passport, null, 2);
}

export function downloadPassport(passport: ArtifactPassport): void {
  const blob = new Blob([passportToJson(passport)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFilename(passport.artifact.filename)}.artifact-passport.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function passportMetadataPayload(passport: ArtifactPassport): string {
  return `artifactpassport:v1:${utf8ToBase64Url(JSON.stringify({
    artifactId: passport.artifactId,
    filename: passport.artifact.filename,
    sha256: passport.artifact.sha256,
    status: passport.summary.status,
  }))}`;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact';
}
