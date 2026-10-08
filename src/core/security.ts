const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
  ['OpenAI-style API key', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['Generic secret assignment', /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{12,}["']/gi],
];

export interface SecretScan {
  matches: Array<{ type: string; index: number }>;
}

export function scanSecrets(input: string): SecretScan {
  const matches: Array<{ type: string; index: number }> = [];
  for (const [type, pattern] of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(input)) !== null) {
      matches.push({ type, index: match.index });
      if (matches.length >= 25) return { matches };
    }
  }
  return { matches };
}
