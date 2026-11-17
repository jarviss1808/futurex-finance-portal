# Go-live security checklist

Status: **LOCAL/HANDOFF READY; PUBLIC GO-LIVE NOT YET APPROVED** (2026-11-17)

## Verified application controls

- [x] Next.js patched to 16.4.6; complete npm audit is clean.
- [x] Employee/Admin authorization and cross-user denial pass isolated PostgreSQL tests.
- [x] Same-origin mutation protection covers every state-changing route.
- [x] Private financial downloads and payment proofs are authorization scoped and no-store.
- [x] Uploaded proofs are signature/size checked and forced into sandboxed attachment downloads.
- [x] Atomic numbering, immutable issued snapshots, one-time PI correction and VERIFIED-only collections pass integration tests.
- [x] Integration and restore tooling refuse production-looking database targets.
- [x] Latest backup restored successfully into an isolated database and the disposable target was removed afterward.
- [x] Production runs on the verified official Node 24.22.3 runtime; final typecheck, lint, unit, integration and build checks pass.
- [x] `.env`, private files, backups, confidential logins and rollback artifacts are restricted to the application identity, Administrators and SYSTEM.
- [x] Final source handoff excludes secrets, login files, private signatures/documents, database dumps and generated customer documents.

## Blocking owner actions / approvals

- [ ] Rotate the SendGrid API key shared previously, renew/verify email credits and perform one authorized-recipient delivery test.
- [ ] Apply the prepared MFA migration, provide a 32-byte encryption key, enroll existing Admins, verify recovery ownership and break-glass handling, then separately approve mandatory enforcement.
- [ ] Install/verify Docker if containers are the deployment target; build the pinned image and test persistent database/private-file volumes across restart.
- [ ] Install a real TLS certificate and verify canonical HTTPS, Secure cookies, HSTS, reverse-proxy request limits and login rate limiting.
- [ ] Configure encrypted off-host backup scheduling, retention, monitoring and periodic isolated restore drills.
- [ ] Verify PostgreSQL service-account least privilege, host firewall/network isolation, patching and monitoring.
- [ ] Close the statutory Tax Invoice/e-invoice/numbering/template approvals listed in `docs/STATUS.md`.

The sanitized package is suitable for controlled developer deployment. Do not expose the portal publicly until Admin MFA activation, SendGrid rotation, TLS/reverse-proxy/firewall checks, off-host backups, Docker/runtime persistence and statutory configuration are completed on the intended host.
