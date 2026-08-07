# Security hardening (2026-08-06)

This document records the controls added after reviewing the repository security advisories with
`gh api /repos/heyform/heyform/security-advisories`. It is intended as a deployment and regression
checklist; it does not replace the individual GitHub advisory descriptions.

## Advisories addressed by this hardening pass

| Advisory              | Control                                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GHSA-896g-r3w9-8wwc` | Ignore respondent-supplied payment amount and currency. Recalculate cents and currency from the published payment field and server-evaluated variables before storing the answer or creating a Stripe PaymentIntent.                     |
| `GHSA-gr8g-m552-m98h` | Apply HTTP and atomic Redis user/team hourly limits to every AI mutation.                                                                                                                                                                |
| `GHSA-hr8q-22g4-x4m3` | Escape email template replacements and answer/hidden-field HTML; allow only a small trusted submission markup fragment.                                                                                                                  |
| `GHSA-w3w4-6w6m-mj29` | Use Express `req.ip` rather than reading `X-Forwarded-For` directly, default `trust proxy` to disabled, and require an explicit topology-specific proxy policy.                                                                          |
| `GHSA-h6wm-rqgg-jc79` | Treat reCAPTCHA as successful only when verification returns the boolean value `true`.                                                                                                                                                   |
| `GHSA-j57w-pm93-6fvc` | Prefix formula-like CSV cells, including values with leading whitespace, across labels, answers, and hidden fields.                                                                                                                      |
| `GHSA-gw5m-8m96-xh35` | Restrict project-member changes to workspace owners/admins or the project owner, require workspace membership, and protect owners from removal.                                                                                          |
| `GHSA-gmv5-7252-rqxr` | Resolve template clones only through the published-template collection.                                                                                                                                                                  |
| `GHSA-vvjj-j3hw-88fq` | Reject CSS rule-breakout characters server-side and sanitize theme values again in the renderer. URL background images are emitted as escaped CSS strings.                                                                               |
| `GHSA-pxw5-pjrc-j758` | Stage uploads in bounded memory, authorize the upload context before persistence, require an allowed extension/MIME/signature combination, generate storage names, and serve non-images as attachments with `nosniff` and a sandbox CSP. |

The same review also tightened adjacent attack surfaces: upload quotas, remote-image byte/pixel/page
limits and raster re-encoding, webhook time/response limits, literal bounded searches, atomic
single-use verification codes, login/reset throttling and enumeration resistance, form open/time
limit enforcement, server-derived partial submissions, and declared-hidden-field normalization.

## Follow-up advisories addressed (2026-08-07)

| Advisory              | Control                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GHSA-j96p-939m-w769` | Atomically reserve each credential/code attempt in Redis before performing the check, so a concurrent burst cannot exceed the configured attempt cap.                                                                                                              |
| `GHSA-3rc6-92q4-wm54` | Cap and deduplicate invitation recipients, add request throttling, apply weighted per-user and per-team hourly recipient quotas, and await mail enqueueing.                                                                                                        |
| `GHSA-mg97-68f8-7g35` | Correctly distinguish HTTP from GraphQL in the global exception filter so rejected uploads always receive a bounded HTTP error response.                                                                                                                           |
| `GHSA-wfh3-r7x7-q4x4` | Disable renderer autosave by default and in the hosted web app, purge the legacy localStorage bucket, and use opt-in sessionStorage with a one-hour expiry for consumers that explicitly enable it.                                                                |
| `GHSA-35mg-x82v-23mc` | Return generic messages for unexpected GraphQL and REST exceptions while preserving deliberate client-facing HTTP errors and server-side logging.                                                                                                                  |
| `GHSA-2crf-q7gp-c38w` | Serialize the authoritative MongoDB quota count and submission insert with a distributed per-form Redis lock, preventing concurrent submissions from exceeding the configured cap without introducing a drifting shadow count.                                     |
| `GHSA-h5hf-28ww-qpcp` | Hash form passwords with bcrypt, lazily migrate legacy plaintext values after successful verification, bind short-lived password tokens to the form/respondent/current hash, hide hashes from GraphQL, and disable/redact Mongo query logging outside development. |
| `GHSA-mv7c-xj63-2mj9` | Allowlist, cap, normalize, and deduplicate languages; queue only newly added translations; apply weighted per-user and per-team hourly quotas; and use retry-safe deterministic queue job IDs.                                                                     |
| `GHSA-6frh-3cxm-9qcj` | Make special-field validators fail closed, validate production submissions before the packaged parser runs, guard table parsing, and skip malformed historical answers instead of aborting an entire export.                                                       |
| `GHSA-p5gh-7839-pj2g` | Accept signature URLs only from the configured application and S3 origins, retain legacy PNG data URIs, and proxy dashboard signature rendering so historical attacker-controlled URLs are never fetched by an owner's browser.                                    |
| `GHSA-3h48-xfjq-92rr` | Resolve edited answers from the server-owned form schema, validate values through the production submission validators, ignore caller-supplied kinds/properties, and render historical unsafe URL schemes as inert text.                                           |

## Previously landed advisory controls rechecked

The current branch already contains controls for the earlier published advisories:

- DNS-pinned outbound requests, private/reserved address rejection, disabled redirects, and URL
  revalidation cover the image/webhook SSRF and DNS-rebinding reports (`GHSA-xff7-g8xv-7624`,
  `GHSA-3j2g-3q97-fvv5`, and `GHSA-wqm9-jpx4-fw74`).
- Rich-text schema allowlisting and unsafe URL-protocol filtering cover stored form-content XSS
  (`GHSA-8q89-27mx-fvg6` and `GHSA-chmm-jqpm-3pwx`).
- Style-tag-safe rendering and custom CSS HTML-breakout rejection cover
  `GHSA-8fm3-p5vh-vrqm`.
- Declared hidden-field normalization covers `GHSA-r7vg-xh87-v4w3`.
- Context-bound upload authorization covers `GHSA-432x-54v2-p7p7`; SVG is not an accepted upload
  type, covering `GHSA-m94h-jxvc-hhch`.
- Explicit credentialed-CORS origin allowlisting covers `GHSA-fg7j-rmgr-rc9g`.
- One-time OAuth state validation and JavaScript-safe callback JSON cover
  `GHSA-2pg5-q4m8-mc92` and the Stripe/social callback XSS variants.
- Password changes and password resets invalidate all server-side sessions, covering
  `GHSA-qq3g-9rvp-7wj3`.

## Deployment requirements

1. Run production containers with `NODE_ENV=production`. The Docker runner now sets this value.
2. Keep `HEYFORM_ALLOW_PRIVATE_OUTBOUND=false` (or unset) in production. Private/localhost
   outbound access is permitted only when both `NODE_ENV=development` and this flag is exactly
   `true`.
3. `TRUST_PROXY` defaults to `false`. If a known reverse proxy is the only network path to the
   application, set the exact Express trust-proxy value for that topology (for example `1` for
   exactly one enforced hop). Do not enable it while the application port remains directly
   reachable from untrusted clients.
4. Configure `CORS_ALLOWED_ORIGINS` with exact dashboard origins; never use a wildcard with
   credentialed requests.
5. Keep Redis available. Distributed upload, AI/translation, invitation, authentication,
   verification-code, and submission-quota controls depend on atomic Redis operations.
6. Existing S3 objects retain the metadata and ACL they were uploaded with. Rewrite their
   `Content-Type`/`Content-Disposition` metadata or delete untrusted historical objects as part of
   deployment. New objects receive generated keys and safe response metadata, but remain
   `public-read` for compatibility with existing public form URLs.
7. If stronger file confidentiality is required, move uploads to a private bucket and add an
   authenticated/signed download path before removing the compatibility ACL.

## Regression checks

Run these checks before release:

```sh
pnpm --filter ./packages/server type-check
pnpm --filter ./packages/server build
pnpm lint
```

The focused tests in `packages/server/test` cover payment integrity, authorization, auth abuse,
form submission integrity, CSV/email injection, upload/image validation, outbound URL pinning,
AI quotas, Redis atomicity, webhook limits, and theme CSS validation. The form-renderer theme test
and answer-utils HTML escaping test cover their respective package boundaries.
