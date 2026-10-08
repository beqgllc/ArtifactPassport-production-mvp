export const PASSPORT_VERSION = '1.0';
export const ENGINE_VERSION = '0.1.0';

export type Severity = 'pass' | 'warning' | 'error';
export type ArtifactKind = 'html' | 'css' | 'javascript' | 'json' | 'zip' | 'text' | 'binary' | 'unknown';

export interface CheckResult {
  id: string;
  label: string;
  severity: Severity;
  detail: string;
  file?: string;
}

export interface FileRecord {
  path: string;
  size: number;
  kind: ArtifactKind;
  checks: CheckResult[];
}

export interface SecuritySummary {
  secretMatches: number;
  pathTraversal: number;
  notes: string[];
}

export interface ArtifactPassport {
  passportVersion: string;
  engineVersion: string;
  artifactId: string;
  artifact: {
    filename: string;
    mime: string;
    size: number;
    sha256: string;
    createdAt: string;
  };
  source: {
    provider: 'unknown' | 'chatgpt' | 'claude' | 'gemini' | 'codex' | 'cursor' | 'other';
    mode: 'local';
  };
  summary: {
    status: 'verified' | 'warning' | 'error';
    files: number;
    passed: number;
    warnings: number;
    errors: number;
  };
  security: SecuritySummary;
  files: FileRecord[];
  checks: CheckResult[];
}

export interface ShareResponse {
  token: string;
  expiresAt: string;
}

export interface RemoteShareMetadata {
  token: string;
  expiresAt: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  iv: string;
  passport: ArtifactPassport;
}
