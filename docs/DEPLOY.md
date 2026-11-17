# Deployment

This is not production-ready until all blockers in `STATUS.md` are closed.

The supported runtime for this audited release is Node.js `>=24.22.3 <25`. Do not run the service on the older Windows Node 24.20.0 installation.

## Vercel deployment

Use the GitHub repository with `web` as the Vercel root directory. Connect a pooled managed PostgreSQL database in the same/nearest region as the Vercel functions and connect a **Private** Vercel Blob store. Configure `PRIVATE_STORAGE_BACKEND=vercel-blob`; keep `filesystem` for Windows/Docker deployments. Never use Vercel's ephemeral function filesystem for payment proofs, approved signatures or customer documents.

The database must be migrated and populated before traffic is enabled. For an existing installation, restore the verified PostgreSQL backup into the managed database so user IDs, password hashes, immutable snapshots, numbering counters and audit history remain unchanged. Upload every referenced private storage key to Private Blob before issuance/download testing. Do not expose an empty database as production.

Set secrets only in Vercel Environment Variables. Required values are `DATABASE_URL`, canonical HTTPS `APP_ORIGIN`, `LOGIN_ID_DOMAIN`, a fresh 32-byte base64url `MFA_ENCRYPTION_KEY`, the Blob variables injected by the connected store, and approved SendGrid values. Keep `ADMIN_MFA_REQUIRED=false` until enrollment/recovery verification. Apply `prisma migrate deploy` from a trusted one-off job; do not run destructive reset commands against production.

Payment proofs are application-limited to 4 MB so multipart uploads stay below Vercel Functions' 4.5 MB request-body limit.

## Verified Windows localhost setup

PostgreSQL 17 runs as the automatic `postgresql-x64-17` Windows service. Keep the ignored `web/.env` file private, then from `web/` run:

```powershell
npx prisma migrate deploy
npm test
$env:TEST_DATABASE_URL = "postgresql://futurex:<password>@127.0.0.1:5432/futurex_test?schema=public"
npm run test:integration
Remove-Item Env:TEST_DATABASE_URL
npm run build
npm start
```

The verified local URL is `http://localhost:3000`. Production mode may use HTTP only when `APP_ORIGIN` is explicitly an HTTP localhost origin; every real deployment must use canonical HTTPS so session cookies receive the Secure attribute.

1. Install Docker Engine with Compose on a supported Linux host and put the repository on encrypted storage.
2. Copy `.env.example` to `.env`; set a long random `POSTGRES_PASSWORD` and canonical HTTPS `APP_ORIGIN`. Never commit it.
3. Provide approved TLS files at `deploy/certs/fullchain.pem` and `deploy/certs/privkey.pem`.
4. Run `docker compose build` and then `docker compose up -d`. The one-shot `migrate` service must finish successfully before the app starts.
5. Create the first administrator with the documented bootstrap command after independently verifying company data.
6. Verify `docker compose ps`, migration logs, and `/api/health`.
7. Keep database and private-document volumes on persistent encrypted disks. Restrict SSH, Docker, backup, and certificate access.

## SendGrid email (PI emails, payment reminders, payment confirmations)

Set `SENDGRID_API_KEY` (Mail Send permission), a SendGrid-verified `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME` (default `Accounts Futurex Trade`) and optionally `SENDGRID_REPLY_TO`; never commit these values. Keep `SENDGRID_AUTO_SEND=false` (PI emails are sent manually). `SENDGRID_DRY_RUN=true` logs everything without calling SendGrid. Each recipient receives a separate personalization so client addresses are never disclosed to one another. Administration → Email shows the sender, live/test mode and remaining SendGrid credits, and can send a test of each template to `EMAIL_TEST_RECIPIENT`. To review the designs without sending, run `npx tsx scripts/render-email-previews.ts <folder>`.

If sends fail with "no email credits left", the SendGrid plan must be renewed (SendGrid → Settings → Billing); no application change is needed.

## Staff logins

Staff sign in with a short login ID that maps to `<id>@<LOGIN_ID_DOMAIN>` (default `futurex.local`). Day-to-day, Admin manages people under Administration → Team (create, rename, reset password, change role, disable). For bulk setup, `npx tsx scripts/provision-team.ts --team team.json --out <new private file>` creates or updates logins and writes generated passwords only to the output file (never the console). Delete that file after the passwords have been handed out.

## PI numbering

Exactly one series per document type is active; enabling a series disables the others. Before each new financial year, create the next series (for example `FUT/PI/27-28/` from 1) and enable it; the dashboard warns Admin when the active series is for a different FY. Changing the next number takes effect for the very next PI and cannot be set at or below a number that was already issued or cancelled.

## Pre-deployment verification

From `web/`, run the non-database checks:

```powershell
npm ci
$env:DATABASE_URL = "postgresql://user:password@host:5432/futurex"
npx prisma validate
npx prisma generate
npm test
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
```

Run database tests only against a disposable PostgreSQL database. The runner maps this value to `DATABASE_URL`, deploys migrations, and then runs the integration suite:

```powershell
$env:TEST_DATABASE_URL = "postgresql://user:password@host:5432/futurex_test"
npm run test:integration
```

Never point `TEST_DATABASE_URL` at production or a database containing data that must be retained. Before release, also exercise login, cross-employee direct URLs, private downloads, PI/Tax Invoice issuance, payment verification, receipts, and reports in a browser against the test stack.

Bootstrap the first administrator once with `INITIAL_ORGANIZATION_NAME`, `INITIAL_ADMIN_EMAIL`, and a 12+ character `INITIAL_ADMIN_PASSWORD`, then run `docker compose run --rm -e INITIAL_ORGANIZATION_NAME -e INITIAL_ADMIN_EMAIL -e INITIAL_ADMIN_PASSWORD migrate npm run bootstrap:admin`. Remove the password from shell history and environment immediately afterward.

## Backup and restore

Run `scripts/backup.ps1 -Destination <absolute backup directory>` on a schedule and copy encrypted backups off-host. Test restoration on an isolated stack. Set `RESTORE_DATABASE_URL` to an explicitly verified disposable target whose database name ends in `_restore_test`, set `CONFIRM_RESTORE=YES`, run `scripts/restore.ps1 -BackupFile <absolute dump path>`, then verify migrations, row counts, login, private downloads, and ledger totals. The restore helper deliberately refuses production-looking, system, wrong-purpose and same-as-`DATABASE_URL` targets before dropping the target's `public` schema. Production disaster recovery is a separate approval-controlled runbook; never use this QA drill over the working database.

Record each recovery drill date, backup filename/checksum, restore duration, migration status, representative row counts, and ledger reconciliation result. A backup job is not considered reliable until an isolated restore has succeeded.
