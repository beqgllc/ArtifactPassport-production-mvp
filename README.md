# ArtifactPassport

ArtifactPassport is a local-first verification layer for AI-generated files. It creates a deterministic passport around an artifact's SHA-256 identity, runs bounded syntax/reference/security checks, and can optionally create a short-lived end-to-end encrypted cross-device handoff.

## What is production-ready in v0.1

- Browser-local inspection for HTML, CSS, JavaScript, JSON, ZIP, and common binary files.
- SHA-256 identity derived from exact artifact bytes.
- ZIP path-traversal protection, entry-count and expanded-size limits.
- Missing local reference detection for HTML/CSS inside ZIP projects.
- Syntax checks for JSON and JavaScript without executing the source.
- Pattern-based secret detection.
- Passport JSON export.
- Metadata-only QR generation.
- Optional encrypted cloud handoff: AES-256-GCM in the browser; the server stores ciphertext only.
- Cloudflare Worker + R2 + D1 persistence.
- Short-lived share records and scheduled cleanup.
- Lemon Squeezy license activation/validation/deactivation server boundary.

## What is deliberately not claimed

A green passport does not mean a file is malware-free, production-safe, legally safe, or functionally correct. Secret detection is heuristic. The product verifies measurable properties and flags suspicious conditions; it does not replace code review or security scanning.

## Architecture

```text
                         ┌──────────────────────┐
                         │  ArtifactPassport UI  │
                         │      Vite + TS       │
                         └──────────┬───────────┘
                                    │
                     local inspection / export
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │     Core Engine      │
                         │ hash / ZIP / checks  │
                         └──────────┬───────────┘
                                    │ optional
                          encrypted cloud handoff
                                    │
                                    ▼
                    ┌────────────────────────────┐
                    │ Cloudflare Worker           │
                    │ API + D1 metadata + R2 blob │
                    └────────────────────────────┘
                                    ▲
                                    │
                            QR URL fragment
                         contains AES key only
```

## Local development

Requirements: Node 22+, npm, and a modern browser. Vite 8 is the current major release used by this repository. React is intentionally not required.

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Open the local URL shown by Vite.

## Configure cloud handoff

1. Create a Cloudflare Worker, R2 bucket, and D1 database.
2. Put the D1 database ID in `worker/wrangler.toml`.
3. Run the schema:

```bash
cd worker
npx wrangler d1 execute artifactpassport --remote --file=schema.sql
```

4. Set `APP_ORIGIN` to your production web origin.
5. Deploy:

```bash
npx wrangler deploy
```

6. Put the deployed Worker URL into the web app's `VITE_SHARE_API_BASE_URL`.

The web client encrypts the artifact before upload. The decryption key is stored in the URL fragment (`#...`), which browsers do not send as part of the HTTP request. The Worker therefore cannot decrypt the artifact.

The v0.1 API intentionally caps public uploads at 10 MiB and share lifetime at 24 hours by default. Increase those only after adding explicit abuse controls such as Cloudflare WAF/rate limiting and, where appropriate, Turnstile.

## Configure Lemon Squeezy

Create a Founder License product with license keys enabled. Lemon Squeezy's License API supports activation, validation, and deactivation without requiring the store's general API key. The Worker verifies the returned store/product/variant IDs before granting a signed session token.

Set the Worker HMAC secret (keep this secret and use a long random value):

```bash
cd worker
npx wrangler secret put LICENSE_HMAC_SECRET
```

Set Worker vars for the exact product/variant:

```text
LEMONSQUEEZY_STORE_ID
LEMONSQUEEZY_PRODUCT_ID
LEMONSQUEEZY_VARIANT_ID
```

Set `VITE_PRO_CHECKOUT_URL` to the hosted Lemon Squeezy checkout URL for the Founder License.

## Security model

1. Original files are never uploaded for ordinary inspection.
2. ZIP extraction is bounded by entry count and expanded size.
3. Archive paths containing traversal segments are rejected.
4. HTML previews are intentionally not rendered from uploaded content. This prevents the app from becoming an HTML execution sandbox.
5. JavaScript syntax checking compiles source with `new Function` but never invokes it.
6. Cloud handoff uses AES-GCM with a fresh random 256-bit key and 96-bit IV per share.
7. Server storage contains ciphertext, metadata, and an encrypted artifact passport record; the key is only in the URL fragment.
8. Share records are deleted by cron after expiration.
9. License HMAC secrets and Lemon Squeezy API keys stay server-side.

## Product roadmap

### v0.2

- Better ZIP reference graphing for imports and asset paths.
- HTML/CSS accessibility checks.
- Package manifest analysis for Node/Android projects.
- Project-level diff between passport versions.
- PWA installation.

### v0.3

- Chrome/Edge extension using the same core engine.
- One-click inspection from supported AI artifact downloads.
- Share links with configurable expiration.

### v1.0

- Pro accounts.
- Signed passports.
- Team/project history.
- Public passport verification pages.
- CI command: `npx artifactpassport verify ./artifact.zip`.

## First-dollar launch

Do not wait for v1.0. Publish the free local inspector first, then sell a Founder License for $19.99 using a hosted checkout. The product is easiest to demonstrate with a 20-second screen recording:

`AI output → drop ZIP → warning appears → passport created → encrypted QR → phone verifies SHA-256 → download.`

## Current external implementation notes

- Vite 8 is the current stable Vite major.
- Cloudflare Workers supports Web Crypto and scheduled handlers; D1 and R2 are used for the optional server layer.
- Lemon Squeezy provides hosted checkout URLs and a License API for activation/validation/deactivation.
- fflate is used for bounded ZIP extraction in the browser.

These integrations are intentionally isolated so the local product remains useful with zero cloud dependency.
