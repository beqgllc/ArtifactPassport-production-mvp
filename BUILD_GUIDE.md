# ArtifactPassport — Comprehensive Build & Launch Guide

## 0. The target

The first release should answer one question better than generic AI tooling:

> **What exactly did I get from the AI?**

The user drops an AI-created artifact into ArtifactPassport. The browser computes its exact SHA-256 fingerprint, inspects its structure, flags measurable problems, produces an exportable passport, and—when cloud handoff is enabled—creates an encrypted QR handoff to another device.

The architecture is deliberately local-first so ordinary inspection has no server cost and no file leaves the browser.

## 1. Recommended stack

Browser app:
- Vite 8
- TypeScript
- Vanilla DOM UI rather than React to keep bundles and development overhead low
- fflate for ZIP extraction
- qrcode for deterministic QR rendering

Cloud layer:
- Cloudflare Worker
- Cloudflare R2 for encrypted artifact bytes
- Cloudflare D1 for short-lived metadata
- Cron Trigger for expiration cleanup
- Web Crypto for HMAC and other cryptographic operations

Payments:
- Lemon Squeezy hosted checkout + License API

Vite 8 is used because it is the current major release as of this build. Cloudflare Workers provides Web Crypto and scheduled handlers, and Cloudflare's documented Wrangler commands create and bind D1/R2 resources. Lemon Squeezy exposes hosted checkouts plus license activation/validation/deactivation.

## 2. Project anatomy

```text
artifactpassport/
├── src/
│   ├── core/
│   │   ├── base64.ts       # URL-safe encoding helpers
│   │   ├── classify.ts     # File-type detection
│   │   ├── hash.ts         # SHA-256 + deterministic artifact ID
│   │   ├── passport.ts     # Passport serialization/download
│   │   ├── path.ts         # Safe path/reference resolution
│   │   ├── security.ts     # Obvious secret pattern scanner
│   │   ├── share.ts        # AES-GCM encrypted handoff
│   │   ├── types.ts        # Versioned data structures
│   │   ├── validate.ts     # Artifact orchestration
│   │   ├── validateText.ts # HTML/CSS/JS/JSON checks
│   │   └── zip.ts          # Bounded ZIP inspection
│   ├── main.ts             # Browser UI and routing
│   └── styles.css          # UI
├── worker/
│   ├── src/index.ts        # Share + licensing API
│   ├── schema.sql          # D1 schema
│   └── wrangler.toml       # Cloudflare config
├── tests/
│   └── core.test.ts        # Vitest unit tests
├── SECURITY.md
├── VERIFICATION.md
└── BUILD_GUIDE.md
```

## 3. Local setup

Use Node 22 or another current Node release supported by the Vite version you install.

```bash
cd artifactpassport
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

The UI works without any Worker, database, payment provider, or account.

## 4. Verify the local-only privacy claim

Open browser developer tools → Network.

Drop a file into the app.

You should see no request to `/api/share` or an external artifact-storage service. The only network traffic may be normal development/build tooling depending on how you serve the app.

The local inspector should work if `VITE_SHARE_API_BASE_URL` is blank.

## 5. Cloudflare setup

Authenticate with Wrangler:

```bash
cd worker
npx wrangler login
```

Create the R2 bucket:

```bash
npx wrangler r2 bucket create artifactpassport-artifacts
```

Create the D1 database:

```bash
npx wrangler d1 create artifactpassport
```

Wrangler prints the D1 UUID. Copy that UUID into `worker/wrangler.toml` in place of `REPLACE_WITH_D1_DATABASE_ID`.

The current Wrangler documentation supports exactly these `r2 bucket create` and `d1 create` flows.

Apply the schema remotely:

```bash
npx wrangler d1 execute artifactpassport --remote --file=./schema.sql
```

Set the production web origin in `wrangler.toml`:

```toml
[vars]
APP_ORIGIN = "https://your-production-domain.example"
MAX_SHARE_BYTES = "10485760"
SHARE_TTL_SECONDS = "86400"
```

Deploy:

```bash
npm install
npm run typecheck
npx wrangler deploy
```

Record the deployed Worker URL, for example:

```text
https://artifactpassport-api.<your-subdomain>.workers.dev
```

## 6. Connect the browser app to the Worker

At build time, provide:

```text
VITE_SHARE_API_BASE_URL=https://artifactpassport-api.<your-subdomain>.workers.dev
```

Then:

```bash
npm run build
```

The UI will enable `Create encrypted QR handoff`.

## 7. How the encrypted handoff works

The browser performs:

```text
Original file
   ↓
AES-256-GCM encrypt
   ↓
Ciphertext → Worker/R2

Random AES key
   ↓
URL fragment (#...)
   ↓
Never sent in HTTP requests
```

The Worker therefore receives ciphertext but not the decryption key.

The receiving device opens the share URL, requests metadata and ciphertext, and decrypts locally.

After decryption, the receiver computes SHA-256 again and compares it with the original passport hash. The download button remains disabled if the computed hash does not match.

This is the main trust story of the product:

> **The file you download is the file the passport identifies.**

## 8. Share abuse controls before public launch

The included Worker already bounds the request by content length, bounds TTL, stores ciphertext in a private R2 bucket, and deletes expired records on a cron trigger.

Before opening public uploads to broad traffic, add platform-level abuse protection. At minimum:

- Cloudflare rate limiting/WAF rules on `POST /api/share`.
- A challenge such as Turnstile for suspicious traffic.
- Monitoring of share creation volume and storage usage.
- A stricter max upload size if your target users do not need 10 MiB.
- A support/admin path for emergency purge.

Do not build a homemade CAPTCHA.

## 9. Lemon Squeezy monetization setup

Create one product first:

**ArtifactPassport Founder License — $19.99 one time**

Enable license keys on the product/variant.

Lemon Squeezy sends the license key to the buyer after purchase. The app can send that key to the Worker, where the Worker activates it using the License API. The Worker should verify the returned store/product/variant IDs before granting access.

Set the Worker HMAC secret:

```bash
cd worker
npx wrangler secret put LICENSE_HMAC_SECRET
```

Set vars:

```text
LEMONSQUEEZY_STORE_ID=...
LEMONSQUEEZY_PRODUCT_ID=...
LEMONSQUEEZY_VARIANT_ID=...
```

Lemon Squeezy's current License API supports:

```text
POST /v1/licenses/activate
POST /v1/licenses/validate
POST /v1/licenses/deactivate
```

The Worker code in this repo implements those server-side boundaries.

Set the public checkout URL:

```text
VITE_PRO_CHECKOUT_URL=https://your-store.lemonsqueezy.com/buy/...
```

Never put `LEMONSQUEEZY_API_KEY` in a `VITE_` variable. Vite exposes `VITE_*` values to the browser bundle.

## 10. License UX to add immediately after first sales

The current browser UI intentionally avoids mandatory accounts. Once the first customers exist, add a small Settings section:

```text
ArtifactPassport Pro

License key
[____________________________]

[Activate]

Status: Active
Device: This browser
Expires: ...

[Deactivate this device]
```

Activation should call:

```http
POST /api/license/activate
Content-Type: application/json

{"licenseKey":"...","instanceName":"web-<random>"}
```

Store the returned session token locally. Revalidate periodically through `/api/license/validate`.

Do not trust a product ID supplied by the browser. Product/variant allowlisting belongs on the Worker.

## 11. First version of the pricing page

Keep it simple:

```text
FREE
$0

Local inspection
SHA-256 fingerprint
Passport export
Metadata QR

        ↓

FOUNDER
$19.99 one time

Everything in Free
Encrypted cross-device handoff
Unlimited inspection
Version comparison as released
Priority access to new checks
```

The free product must remain useful. The paid product should remove a concrete workflow pain instead of hiding basic functionality behind a paywall.

## 12. Seven-day build sequence

### Day 1

Run the repository locally.

Verify file selection, drag/drop, hashing, and basic file classification.

Do not build accounts or payments.

### Day 2

Test HTML, CSS, JS, and JSON edge cases.

Add small fixture files for:

```text
valid HTML
missing asset HTML
invalid JSON
invalid JS
CSS with missing image
secret-like text
```

### Day 3

Test ZIP inspection with:

```text
normal project
nested project
missing import
../ traversal
1501 entries
>100 MiB expanded contents
```

### Day 4

Create the Cloudflare resources.

Deploy the Worker.

Run encrypted upload/receive/download tests.

### Day 5

Set up Lemon Squeezy Founder License.

Make one real test purchase in test mode.

Activate and validate the generated license through the Worker.

### Day 6

Make a 20–30 second demo:

```text
ChatGPT/Codex creates ZIP
        ↓
Drop ZIP into ArtifactPassport
        ↓
Warning appears
        ↓
Passport generated
        ↓
Encrypted QR created
        ↓
Phone scans QR
        ↓
SHA-256 verified
        ↓
Download
```

### Day 7

Release the free version.

Sell the Founder License directly from the landing page.

The goal is not a polished startup. The goal is one stranger paying.

## 13. Metrics to instrument later

Do not collect artifact contents.

Useful anonymous product events are:

```text
inspection_started
inspection_completed
inspection_error
passport_exported
share_created
share_received
share_integrity_match
checkout_clicked
license_activated
```

Avoid logging:

```text
raw file bytes
full file paths
passport JSON
API keys
license keys
artifact source code
```

A privacy-preserving event model is part of the product differentiation.

## 14. Performance constraints

The user's hardware constraint makes a lightweight application desirable.

Keep the local inspector bounded:

- 25 MiB maximum original artifact in the MVP.
- 2 MiB deep-inspection limit for individual text files.
- 1,500 maximum ZIP entries.
- 100 MiB maximum expanded ZIP content.

Move expensive checks into Web Workers in a later release if profiling shows main-thread stalls.

Do not render uploaded HTML into an iframe. It is unnecessary for the core product and creates avoidable execution risk.

## 15. Release checklist

Before launch:

```bash
npm install
npm run typecheck
npm test
npm run build
npm audit --omit=dev

cd worker
npm install
npm run typecheck
npx wrangler deploy --dry-run
```

Then perform the browser acceptance tests in `VERIFICATION.md`.

## 16. What to build after the first sale

The strongest follow-up features are not generic AI features.

Build the artifact history layer:

```text
PROJECT: landing-page

v1
AP-81A2...
✓ 12 files
⚠ 2 warnings

v2
AP-93BC...
✓ 14 files
✓ 0 errors

DIFF
+ pricing section
+ mobile stylesheet
- placeholder CTA
```

Then expose the same engine as a CLI:

```bash
npx artifactpassport verify ./my-project.zip
```

That creates the path from consumer utility to developer infrastructure.
