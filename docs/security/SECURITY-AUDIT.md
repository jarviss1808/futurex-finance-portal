# Security audit

Audit date: 2026-11-17  
Scope: existing Futurex Finance portal, local Windows host, disposable PostgreSQL QA databases, dependency manifests and deployment files.

## Fixed

### Critical — destructive restore could target the working database

The Docker branch of `scripts/restore.ps1` always restored into database `futurex`, while the native helper rejected only PostgreSQL system databases. A mistaken drill could therefore erase the working schema. Restore drills now require `RESTORE_DATABASE_URL`, require the database name to end in `_restore_test`, reject the same target as `DATABASE_URL`, and never fall back to the production Docker database. The integration runner applies the equivalent `_test` and same-as-production guards.

### High — vulnerable framework/dependency versions

Next.js was upgraded from 16.4.3 to 16.4.6, covering the installed-version disclosure advisory. `eslint-config-next` and the TypeScript ESLint chain were updated without forcing a major application upgrade; the vulnerable minimatch chain moved to 11.0.9. Both complete and production-only `npm audit` runs now report zero known vulnerabilities. React 19.3.0 and Prisma 7.10.1 are current supported releases in the checked official sources.

### High — untrusted payment proof handling

Proof uploads now require a bounded `Content-Length` before multipart parsing, in addition to the 4 MB post-parse size and file-signature checks. Downloads changed from inline rendering to forced attachment and add `nosniff`, no-store and sandbox CSP headers. This reduces request-memory abuse and prevents uploaded PDF/image active content from executing in the portal origin.

### Medium — authentication and proxy trust

Unknown accounts now execute the same scrypt verification path as known accounts, reducing login timing enumeration. Client IP selection prefers the reverse proxy's `X-Real-IP` and otherwise the last forwarded hop rather than a spoofable first `X-Forwarded-For` value. Cross-origin mutation failures now return controlled HTTP 403 responses.

### Medium — incomplete browser policy

The previous CSP contained only four directives and no default source restriction. The application now sets a restrictive default policy, blocks framing and script attributes, restricts network/image/font/worker sources, adds COOP/CORP and cross-domain-policy headers, and adds HSTS/upgrade-insecure-requests only for an HTTPS-configured origin.

## Verified existing protections

- Server-side organization plus owner/share scopes cover clients, documents, payments, reports, private files and payment proofs.
- All state-changing API routes call same-origin validation.
- Session tokens are random opaque values stored only as SHA-256 hashes; cookies are HttpOnly, SameSite=Lax and Secure for HTTPS production.
- Passwords use scrypt; role/credential/activation changes invalidate sessions.
- Private files resolve under a configured private root and traversal attempts are rejected.
- Financial amounts use bigint/paise; issuance numbering, immutable snapshots, one-time PI correction and VERIFIED-only collections passed the isolated integration suite.
- No unsafe Prisma raw-query calls or React `dangerouslySetInnerHTML` uses were found outside generated client definitions.
- No `use cache` or `unstable_cache` use was found, and authenticated APIs explicitly return private/no-store responses.

## Remaining risks

### Closed in Phase 2 — host runtime and private-data ACLs

Futurex now runs from the official Node 24.22.3 x64 distribution under `C:\Users\shasw\AppData\Local\FuturexFinance\Runtime`. Its published SHA-256 and OpenJS Authenticode signature were verified before use, the project build and full regression set pass, and the user PATH selects this runtime first. The signed MSI could not be installed because Windows Smart App Control blocked its installer custom-action DLL; that protection was not disabled. The previous 24.20.0 MSI and ACL/environment captures are retained in a restricted rollback directory.

`web/.env`, private storage, backups, the confidential login handoff and rollback artifacts now allow only the actual application identity (`ASUS\shasw`), Administrators and SYSTEM. The application can still read private documents and create restricted backups. A propagation error discovered during the change was corrected and every child item was rechecked for broad or empty ACLs.

### High — Admin MFA rollout is prepared but not activated

The database migration and cryptographic TOTP/recovery-code primitives are implemented and regression-tested. Enrollment and mandatory enforcement remain disabled; no production MFA migration or encryption key was installed. Activation still requires verified Admin enrollment, recovery ownership and a tested break-glass procedure.

### Medium / infrastructure not verified

- The CSP retains `unsafe-inline` for Next.js bootstrap/style compatibility; nonce-based CSP should be evaluated separately.
- Nginx login limiting is configured, but no deployed TLS certificate, WAF/DDoS control, firewall policy, alerting or suspicious-login monitoring was verified.
- Docker is not installed on this host, so image build, container networking and persistent-volume restart remain unverified.
- A new restricted backup restored successfully into an isolated database, but scheduled encrypted off-host copying and retention are not configured/verified.
- PostgreSQL OS/service-account least privilege and network firewall policy were not changed or independently verified.

Official references checked: Next.js maintainer advisories, Node.js security release notes, React release list, and Prisma supported-release/security information.
