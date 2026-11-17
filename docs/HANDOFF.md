# Futurex Finance Portal: full handoff

Snapshot taken 2026-11-16, about 17:30 IST. Paste this file, or point a new chat or agent at it, to continue the work.

---

## 0. Read this first (rules for whoever continues)

- **Owner:** Futurex Trade (exhibition organiser).
  - Writes in **Hinglish**; reply in Hinglish.
  - Wants simple, final, go-live-ready work, not options.
- **Project rules:** `CLAUDE.md` / `AGENTS.md` at the repo root. They are binding. In short:
  - Ownership is enforced server-side in every query, mutation, export and download. Hiding something in the UI is not authorisation.
  - Money is held as integer paise (`bigint`) or `Decimal`. Never use floats.
  - PI numbers are issued only inside a DB transaction, with an atomic counter and a unique constraint. Issued or voided numbers are never reused.
  - Issued documents are immutable snapshots. Corrections go through void, revision or credit-note workflows.
  - Only **approved (VERIFIED)** payments affect outstanding balances, receipts and collections.
  - Never fabricate IRN, QR codes, tax treatment, signatures or statutory data.
  - Keep changes narrow, add a regression test for each defect, and run the affected tests plus `npm run build`.
  - Never commit secrets, production data or generated private documents.
- **Verified business facts:** `docs/FACTS.md`. Do not re-read the reference PDFs.
- **Never test on the production DB (`futurex`).** It now holds **real data** (see section 6). QA goes on a restored copy (section 3).
- **`psql.exe` is blocked** by Windows Application Control. Query the DB with Node and `pg`; see section 3.
- **Never echo secrets** (SendGrid key, passwords) in chat or docs.

---

## 1. What the product is

An internal web portal for Futurex staff. Its scope:

- Exhibition clients.
- **Proforma Invoices (PIs)**, with PDF, DOCX and XLSX output.
- Payment entry and Admin approval.
- Outstanding balances.
- Reports with Excel, PDF and CSV export.
- Payment-reminder emails.
- Team management.

There are two roles only:

| Role | Who | Sees / can do |
|---|---|---|
| **ADMIN** | shiv, namit, admin | Everything company-wide. Approves or declines payments, sees every employee's PIs, clients and payments, runs reports and exports, sends reminders, manages the team, numbering, exhibitions, tax and email. |
| **EMPLOYEE** | jagriti, soumo, khushboo, vaibhav, nashra, shivam, zoya, danish, sanjay, futurex | **Only their own** clients, PIs, payments, reports and reminders. Records payments against their own PIs; each goes to Admin for approval. Can cancel their own PI. |

Login uses a short ID (for example `jagriti`). It is stored as `jagriti@futurex.local`; the domain comes from env `LOGIN_ID_DOMAIN`. Email-style logins also work.

---

## 2. Tech stack and commands

- **Stack:** Next.js **16.4.3** (App Router, `cacheComponents: true`, `output: standalone`) and React 19.
- **Database:** Prisma **7.10.1** with `@prisma/adapter-pg`, on PostgreSQL **17** (Windows service, port 5432). The generated client is in `web/src/generated/prisma`.
- **Libraries:** zod 4, decimal.js, exceljs, pdf-lib, docx and sharp. Tests use vitest.
- **App folder:** `web/`. Run every command from `E:\Futurex Finance\web`.

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run prisma:migrate
npm start
```

- **`npm test`:** unit tests. The last run had 80 passing.
- **`npm run test:integration`:** real-Postgres tests against `futurex_test` with an isolated schema. The last run had 13 passing.
- **`npm run prisma:migrate`:** `prisma migrate deploy`, against `DATABASE_URL` in `web/.env`.
- **`npm start`:** serves the standalone production build on `http://localhost:3000` (`scripts/start-production.mjs`).

Production server notes:

- It runs as a plain Node process, started at 17:16 as PID 12840. It is **not** a Windows service, so after a reboot run `npm start` again.
- **Rebuild before restarting.** Stop the server, run `npm run build`, then `npm start`.
- Server log from the background run: `.runtime/server.log`.

---

## 3. Environments and databases

| DB | Purpose |
|---|---|
| `futurex` | **Production.** Used by localhost:3000. Contains real data. |
| `futurex_test` | Integration tests (isolated schema per run). |
| `futurex_restore_test` | QA copy restored from a production backup. In the earlier QA, client emails were redirected to `shaswatsuman2@gmail.com` and the QA server ran on **:3001**. That server is **not running now**. |

**Querying the DB without psql:**

1. Write a small `.mjs` script that does `createRequire("E:/Futurex Finance/web/package.json")`, then `require("pg")`, connects with `process.env.DATABASE_URL`, and runs SQL read from a file.
2. Put the SQL in a file, because PowerShell mangles inline quotes.
3. Load `DATABASE_URL` from `web/.env` into the environment without printing it.

**Backups** (`pg_dump` custom format, under `tmp/`):

- `tmp/pre-demo-cleanup-backups/futurex-20261114-160456.dump`
- `tmp/pre-sales-workflow-backups/futurex-20261116-134024.dump`, taken before migration 0003.
- `tmp/pre-pi-category-country-backups/futurex-20261116-171032.dump`, taken before migrations 0004 and 0005.

**Env keys in `web/.env`** (gitignored; values are not reproduced here):

- Core: `DATABASE_URL`, `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS`, `PRIVATE_STORAGE_ROOT`, `APP_ORIGIN`, `UPCOMING_EXHIBITIONS_POSTER_PATH`, `LOGIN_ID_DOMAIN=futurex.local`.
- SendGrid: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL=accounts@futurextrade.com`, `SENDGRID_FROM_NAME=Accounts Futurex Trade`, `SENDGRID_REPLY_TO=accounts@futurextrade.com`, `SENDGRID_AUTO_SEND=false`, `SENDGRID_DRY_RUN=false`.
- Testing: `EMAIL_TEST_RECIPIENT=shaswatsuman2@gmail.com`.
- `web/.env.example` and `docker-compose.yml` list the same keys without secrets.

---

## 4. Migrations (all applied to `futurex`, 9 in total)

1. `202610290001_initial`
2. `202610300001_company_master_relationships`
3. `202610300002_event_directory`
4. `202611140001_event_tax_and_profile`
5. `202611160001_document_email_delivery`
6. `202611160002_payment_review`
7. `202611160003_sales_workflow`:
   - PaymentStatus `WITHDRAWN`.
   - Payment gains `remarks`, `submissionCount` and `submittedAt`.
   - New `PaymentProof` model.
   - `DocumentEmailDelivery.kind`.
   - Indexes.
8. `202611160004_pi_category`: enum `PiCategory` (EXHIBITION_PARTICIPATION, BRANDING_FLEX_FRAME, EXTRA_REQUIREMENTS, STALL_FABRICATION) and `FinancialDocument.piCategory`, backfilled from the snapshot purpose.
9. `202611160005_client_country_currency`: `Client.contactDialCode` (default `+91`).

`prisma migrate diff` shows one pre-existing, harmless drift: a `CompanyProfile` default.

---

## 5. What is built (feature map with key files)

All paths are under `web/src/` unless noted.

### Payments: entry, then approval
- **Employee entry** records:
  - The PI (own PIs only).
  - Amount, date (no future dates) and mode (NEFT, RTGS, IMPS, UPI, Cheque, Cash, Card, International wire, Bank transfer, Other).
  - UTR/reference, required except for Cash and Other.
  - Remarks.
  - Optional proof: PDF, JPG, PNG or WEBP, at most 4 MB. The type is checked by magic bytes and stored through the configured private storage backend.
- **Status flow:** PENDING → Admin **approves** (VERIFIED, optionally emailing the client a "payment received" confirmation) or **declines** with a reason (REJECTED). The employee then **corrects and resubmits** (back to PENDING; `submissionCount` goes up) or **withdraws** (WITHDRAWN).
- **History:** every step is an `AuditEvent` and is shown as history on the entry, with before/after values on corrections.
- **Balance rules:**
  - Outstanding = PI total − approved payments.
  - A new entry may not exceed total − approved − pending.
  - A duplicate UTR plus amount is refused with a friendly message.
- **Files:**
  - Logic: `lib/payments/service.ts`, `repository.ts` (`paymentScope`, `paymentWhere`), `view.ts`, `modes.ts`, `proofs.ts`, `proof-type.ts`, `request.ts`.
  - API: `app/api/payments/**` (POST multipart; PATCH to correct; `withdraw`, `proofs`, `verify`, `reject`) and `app/api/payment-proofs/[id]` (scoped download).
  - UI: `app/(portal)/payments/page.tsx` and `payment-ui.tsx`.

### PI numbering (concurrency-safe, admin-controlled)
- **One active series per document type.** Issuance picks it automatically, so there is no series picker.
- **Allocation:** `UPDATE ... SET "nextNumber" = "nextNumber" + 1 RETURNING` inside a **SERIALIZABLE** transaction, with retry on 40001, 40P01 and P2034 (`lib/transactions.ts` `withTransactionRetry`). Prefix, suffix and padding are read from the locked row.
- **Concurrency is verified:**
  - A 25-way concurrent DB test.
  - 8 simultaneous issues through the live API gave 010 to 017 with no gaps or duplicates.
  - A rolled-back issue consumes no number.
- **Admin edits** (prefix, next number, padding) under Administration → Numbering apply to the very next PI. A next number at or below an already issued or cancelled number is refused with a 409. The edit is audited.
- The dashboard warns Admin when the active series' financial year differs from the current one; at that point create the `FUT/PI/27-28/` series.
- **Files:** `lib/documents/numbering.ts`, `series.ts`, `issue.ts`, `void.ts`.

### PI cancellation
- The owner or an Admin can void a PI with a reason.
- It is blocked while the PI has approved or pending payments.
- The number stays reserved forever.

### PI category and the foreign-venue note (added by the parallel agent, 17:02–17:16)
- There are four PI categories (`lib/documents/pi-category.ts`). The category is chosen separately from the calculation method (SQM × rate, or item-wise).
- Non-taxable PIs for foreign venues automatically carry the Notification No. 12/2017 note in the snapshot and in every output format (`lib/documents/foreign-venue-note.ts`).

### Clients
- Clients are scoped to their owner. Admin sees the owner name and gets a warning for clients with no email.
- Full ISO country list with dialing codes; India/+91 is the default.
- Currency is restricted to INR or USD and validated on the server.
- **Files:** `app/(portal)/clients/*` and `lib/clients/*`.

### Dashboards and reports
- **Dashboards** are role-aware (`app/(portal)/dashboard/page.tsx`). They show period chips and six metrics: sales, approved collections, outstanding, awaiting approval, declined and number of PIs. They also show employee performance (Admin only), exhibitions, highest balances and the latest PIs.
- **Report views** (`app/(portal)/reports/page.tsx`):
  - Employee performance (Admin only).
  - Exhibition-, client- and month-wise.
  - PI register: employee, exhibition/venue, category, SQM and rate, taxable value, CGST, SGST, IGST, GST, PI value, approved, pending, outstanding and state.
  - Payment register.
- **Filters:**
  - IST periods: today, yesterday, this or last week, month, quarter, FY half, FY (April–March), calendar year, or custom.
  - Multiple employees (Admin only; ignored for employees on the server), multiple exhibitions, PI category, PI payment state, payment status, search, and include-cancelled.
- **Exports:** Excel, PDF and CSV of exactly the filtered table (`app/api/reports/export`). Each export is audit-logged as `REPORT_EXPORTED`.
- **Totals and grouping:** totals are kept per currency (INR and USD are never mixed). Sales totals exclude cancelled PIs.
- **Files:** `lib/reports/period.ts`, `balances.ts`, `sales.ts`, `tables.ts`, `export.ts`, `views.ts` and `components/filter-bar.tsx`.
- The old ledger and Tally page is at `/reports/ledger` (Admin only).

### Reminders and email (SendGrid)
- **Sending:** reminders go to a single PI, a selection, or all due (at most 300 per call) from `/reminders`, or from the PI page.
- **Content:** each email is personalised with the balance, the amount received, exhibition details, bank details, the employee as contact, an optional note and an optional attached PI PDF.
- **Skipped:** PIs that are fully paid, have no email, or were reminded in the last 20 hours. Use `force` to override.
- **Logging:** every send is logged in `DocumentEmailDelivery` with kind `PAYMENT_REMINDER`, `PAYMENT_CONFIRMATION` or `DOCUMENT`.
- **Delivery mechanics:** one personalization per recipient, so clients never see each other. The logo is inline (CID) and click tracking is off.
- **Admin → Email** offers "Send test email" (reminder, confirmation or PI document templates; `[TEST]` subject) and shows the remaining SendGrid credits.
- **Files:**
  - Library: `lib/email/sendgrid.ts`, `errors.ts`, `layout.ts`, `template.ts`, `messages.ts` and `send-issued-document.ts`.
  - API: `app/api/reminders` and `app/api/admin/email-test`.
- **Previews:** `docs/email-previews/*.html` and `*.txt`.

### Team and accounts
- Admin can create users, rename them, reset passwords, change role and disable users.
- An Admin cannot demote or disable themself, and at least one active Admin must always remain.
- Changing a user's credentials signs out their sessions.
- **My account:** every user can change their own password, which signs out their other sessions.
- **Provisioning:** `scripts/provision-team.ts --team <json> --out <file>` upserts users and writes passwords only to the output file. It refuses to overwrite an existing file.
- **Login file:** the production passwords are in **`TEAM-LOGINS-CONFIDENTIAL.txt`** at the repo root. Neither this chat nor this document has read or copied them.
  - Hand out one line per person privately, then delete the file.
  - The old `admin` password was reset, and Soumo's login ID is now `soumo`.

### UI and app shell
- Sidebar navigation with an attention badge: pending approvals for Admin, declined entries for employees.
- Mobile top bar, PWA manifest and icons (`app/manifest.ts`, `public/branding/*`).
- `lib/http.ts` `errorResponse` calls `unstable_rethrow` so that Next's dynamic-rendering signals are not swallowed. This keeps the build clean.

### Defects fixed in this chat (each has a regression test where testable)
- "Add client" got stuck on "Saving…" because `event.currentTarget` was used after an `await`.
- `GET /api/documents` returned 500 because of bigint values in the JSON. Fixed with `documentListJson`.
- Prerender errors in the build log. Fixed with `unstable_rethrow`.

---

## 6. Production state right now (`futurex`, read at handoff)

- **Users:** 13 active (3 ADMIN, 10 EMPLOYEE).
- **PI series:** `FUT/PI/26-27/`, padding 3. The next number is **006**, so 001 to 005 are used.
- **Documents:**
  - PROFORMA: 4 ISSUED, 1 VOIDED, 1 DRAFT.
  - TAX_INVOICE: 1 DRAFT.
- **Payments:** 1 VERIFIED.
- **Other records:** 3 clients, 16 exhibitions (imported directory, tax policy approved), 96 audit events.
- **Server and DB:** health on `http://localhost:3000/api/health` returns **200**. PostgreSQL is running.
- **This is live data.** Do not run QA here.

---

## 7. Open items and next steps (in priority order)

1. **SendGrid has 0 credits, so no email can be delivered.**
   - The API returns `401 Maximum credits exceeded`. The key has the `mail.send` scope and `accounts@futurextrade.com` is a verified sender.
   - The owner must renew the plan under SendGrid → Settings → Billing.
   - **After renewal:**
     - Send test emails to `shaswatsuman2@gmail.com` from Admin → Administration → Email → Send test email: reminder, document (PI with PDF) and confirmation.
     - Then send a test reminder campaign. Do this on the QA copy, where client emails go to the tester, not on production.
     - The owner explicitly asked for these tests: *"test campaign and all bnaa ke bhjo ... shaswatsuman2@gmail.com pe"*.
2. **Rotate the SendGrid API key.** It was pasted in chat. Update `SENDGRID_API_KEY` in `web/.env` only, then restart.
3. **Distribute the logins and delete `TEAM-LOGINS-CONFIDENTIAL.txt`.**
4. **Go live publicly.** This is not done. It needs:
   - Hosting (server or VM), a domain and HTTPS (reverse proxy).
   - `APP_ORIGIN` set to the public URL.
   - A process manager or service for auto-restart.
   - Scheduled, encrypted, off-host backups and monitoring.
   - Docker Engine is not installed, so `docker-compose.yml` is unverified.
   - See `docs/DEPLOY.md`.
5. **Known minor issues:**
   - `sendgridCredits()` logs *"During prerendering, fetch() rejects when the prerender is complete"* on `/admin` and `/reminders`. As a result the credits line can be missing on some loads. Fix by awaiting `connection()` before the fetch, or by moving the credits widget into its own `<Suspense>` boundary.
   - pg DeprecationWarning *"client.query() when the client is already executing a query"*. It is harmless today but will break on pg@9; find the concurrent use on a shared client.
   - Mobile layout has not been checked visually, because the browser pane was hidden during QA.
   - A real production login has not been tested by the agent, because the passwords were deliberately not read.
6. **Business decisions still pending** (see `docs/STATUS.md` → Remaining production blockers):
   - TDS basis (taxable or gross).
   - PI revision numbering policy (same number with a revision marker, or a new number).
   - Tax Invoice numbering and e-invoice provider.
   - Foreign-event statutory classification.
   - GSTIN lookup API provider.
   - Bookings, relationship transfer and sales-credit attribution.
   - Full browser E2E automation.

---

## 8. Verification status at handoff

- **Unit tests:** 80 pass (`npm test`).
- **Integration tests:** 13 real-Postgres tests pass (`npm run test:integration`). They cover:
  - 25-way concurrent numbering, and rollback consuming no number.
  - Series validation.
  - Submit → decline → resubmit → approve with history.
  - Cross-employee isolation.
  - Over-amount, duplicate UTR, withdraw and void.
- **Build checks:** TypeScript, ESLint and `npm run build` are clean.
- **Browser QA (restored copy, both roles):**
  - Every page returns 200 for both roles.
  - All 18 report exports work, and the PDF was reviewed visually.
  - Employees cannot reach `/admin`, `/reports/ledger` or admin APIs (403 or redirect, with no data leaked).
  - An injected `employee=` filter is ignored for employees.

---

## 9. Timeline (so the next agent knows who did what)

- **Up to 2026-11-14 (Codex):**
  - Base portal: auth, clients, exhibitions, PI and Tax Invoice drafts, issuance, PDF, DOCX and XLSX output.
  - Tax policy, branding and signature stamp.
  - Tally export, plus the first reject, filter, CSV and void pieces. Codex then stopped at its usage limit.
- **2026-11-16, about 10:50–14:00 (this Claude chat):**
  - The full sales and collections workflow in section 5: payments with approval, proofs, history and withdraw; numbering hardening; dashboards, reports and exports; reminders and SendGrid; team provisioning and login IDs; account page; UI shell and PWA; the three defect fixes.
  - Docs: `STATUS.md`, `DEPLOY.md`, email previews and `.gitignore`.
- **2026-11-16, about 17:02–17:16 (another agent working in parallel; this chat did not author or review it):**
  - PI category with migration 0004.
  - Foreign-venue note.
  - Detailed PI register columns.
  - Client country and dialing codes with an INR/USD restriction (migration 0005).
  - A backup before the migration.
  - Unit tests now at 80.
  - The production server was restarted at 17:16, which ended this chat's earlier server process.

---

## 10. Prompt to start the next chat

> Read `docs/HANDOFF.md`, `CLAUDE.md` and `docs/STATUS.md` in `E:\Futurex Finance`. Reply to me in Hinglish. The portal is live on localhost:3000 with real data, so do any QA on a restored copy, not on `futurex`. Next: [renew-done → send SendGrid test emails to shaswatsuman2@gmail.com / go-live on a domain with HTTPS / fix the minor issues in section 7.5].
