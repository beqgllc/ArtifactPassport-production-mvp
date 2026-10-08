# Security Policy

## Threat model

ArtifactPassport assumes the user may inspect untrusted artifacts. The app must not execute uploaded HTML, JavaScript, package scripts, or native binaries.

## Rules for contributors

- Never add an automatic `iframe srcdoc` or `<iframe src="blob:...">` preview of user HTML.
- Never call `eval()` on artifact contents.
- Never place API keys, payment secrets, or Worker secrets in `VITE_` environment variables.
- Preserve ZIP entry and expanded-size limits.
- Preserve share TTL limits and encrypted handoff semantics.
- Do not log raw artifact contents.
- Do not add analytics that transmit artifact filenames, hashes, or content without explicit product/privacy review.

## Known limitations

The built-in secret detector uses regular expressions and can miss custom credential formats or produce false positives. It is not a malware scanner and should never be presented as one.

The public share endpoint should be deployed behind abuse controls before broad launch. Recommended controls include Cloudflare WAF/rate limiting and a challenge mechanism for suspicious upload traffic.
