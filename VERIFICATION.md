# Verification checklist

Run these before every deployment:

```bash
npm install
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

For the Worker:

```bash
cd worker
npm install
npm run typecheck
npx wrangler deploy --dry-run
```

Manual browser acceptance tests:

1. Inspect a valid HTML file.
2. Inspect malformed JSON and confirm an error.
3. Inspect JavaScript with an obvious syntax error and confirm an error without execution.
4. Inspect a ZIP containing a missing HTML/CSS reference and confirm a warning.
5. Inspect a ZIP containing `../evil.txt` and confirm a path traversal error.
6. Confirm ordinary inspection makes no `/api/share` request.
7. Create a cloud handoff and confirm the receiver can decrypt and verify the SHA-256 digest.
8. Wait past TTL in a test environment and confirm metadata/file access returns 404.
9. Activate a real test-mode Lemon Squeezy license and verify product/variant matching.
