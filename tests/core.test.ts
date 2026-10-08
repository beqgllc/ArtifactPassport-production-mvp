import { describe, expect, it } from 'vitest';
import { artifactIdFromSha256 } from '../src/core/hash';
import { hasPathTraversal, resolveReference } from '../src/core/path';
import { scanSecrets } from '../src/core/security';

describe('ArtifactPassport core', () => {
  it('derives deterministic artifact ids', () => {
    expect(artifactIdFromSha256('abcdef0123456789')).toBe('AP-ABCDEF012345');
  });

  it('detects archive traversal', () => {
    expect(hasPathTraversal('../../evil.txt')).toBe(true);
    expect(hasPathTraversal('src/index.html')).toBe(false);
  });

  it('resolves relative references', () => {
    expect(resolveReference('src/index.html', '../assets/app.js')).toBe('assets/app.js');
    expect(resolveReference('src/index.html', 'https://example.com/app.js')).toBeNull();
  });

  it('finds obvious credential patterns', () => {
    const result = scanSecrets('const x = "sk-abcdefghijklmnopqrstuvwxyz123456";');
    expect(result.matches.length).toBeGreaterThan(0);
  });
});
