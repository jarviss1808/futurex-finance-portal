# Master Specification Revision 2 implementation plan

Source reviewed: all 24 pages of `Futurex_Finance_FINAL_Consolidated_A_to_Z_Revision_2.pdf` on 2026-10-30. Historical sample pages are fixtures and visual references, not approved tax or banking policy. `docs/FACTS.md` remains the verified fact register for production values.

## Architecture and staged delivery

The existing Next.js/TypeScript/PostgreSQL/Prisma modular monolith remains in place. Changes are additive and migration-backed.

1. **Identity and access foundation:** opaque sessions, role/capability guards, employee ownership, private downloads, audit trail. Existing foundation retained; password reset/MFA remain.
2. **Company and relationship model:** canonical `CompanyMaster` plus employee-private `Client` relationship with one primary contact, country-derived default currency and safe duplicate matching. Director transfer workflow follows.
3. **Exhibitions and bookings:** owned/external classification, creator/status/timezone, reusable bookings, service/category, dimensions, fixed/area pricing and due dates.
4. **PI lifecycle:** creator/follow-up/sales-credit separation, line items, INR/USD, tax decisions, controlled status transitions, one continuous atomic series, immutable PDF versions.
5. **Payments and receipts:** reported versus approved amounts, correction history, proofs, reversals/refunds and one stable receipt per PI with immutable cumulative versions.
6. **Communication:** versioned templates, SendGrid transactional outbox, retry/idempotency, webhooks, reminders, attachments and delivery logs.
7. **Director operations:** relationship transfer, incentive attribution, aging/turnaround analytics, role-safe XLSX/CSV exports, imports, settings and audit explorer.
8. **Release:** browser E2E, authorization penetration cases, concurrency/load checks, PDF visual checks, monitoring, backup/restore, HTTPS deployment and handover.

## Database architecture delta

- Existing security-critical tables and issued document snapshots remain unchanged.
- `CompanyMaster` stores non-private normalized legal identity. `Client` remains the employee-private relationship and stores its contact/private notes. A unique `(masterId, ownerId)` permits different employees to serve the same company without sharing contact data.
- Planned additive tables: `Booking`, `BookingItem`, `DocumentVersion`, `PaymentReview`, `PaymentAdjustment`, `PaymentReceipt`, `ReceiptVersion`, `Attachment`, `EmailTemplate`, `EmailOutbox`, `EmailLog`, `Notification`, `ExchangeRate`, `ImportBatch`, and `ImportRow`.
- Planned attribution columns on bookings/documents: `createdByUserId`, `assignedToUserId`, `salesCreditUserId`; only Director changes ownership or sales credit, with reasoned audit events.
- Money remains integer paise for INR and explicit minor units per configured currency. No cross-currency aggregation occurs without an approved rate, source and date.

## Requirements-to-tests traceability

| Requirement | Evidence / planned test | Status |
| --- | --- | --- |
| Employee isolation, API and download | PostgreSQL cross-user negative tests | Confirmed foundation |
| Canonical company with private relationships | Two employees share one master but query only their own contact | In progress |
| INR for Indian client, USD otherwise | Country currency unit tests; booking integration test | In progress |
| Atomic continuous PI numbering | 25-way PostgreSQL concurrency test | Confirmed foundation |
| GST calculations and historic examples | Paise/Decimal unit fixtures | Confirmed foundation |
| Verified-only collections | Payment/ledger unit and integration checks | Confirmed foundation |
| Cumulative immutable receipt versions | Multi-payment integration + PDF hash retention | Planned |
| Creator/follow-up/sales-credit separation | role/transfer integration tests | Planned |
| Owned/external exhibitions and bookings | API + browser workflow tests | Planned |
| Poster-owned exhibition directory | 16-event fixture validation + live database import | In progress |
| SendGrid retry without duplicate delivery | outbox idempotency contract tests | Planned; credentials needed only for live send |
| Director filters and safe exports | authorization + XLSX/CSV content tests | Partial |
| Backup/restore | isolated PostgreSQL restore drill | Confirmed localhost |
| HTTPS domain deployment | live acceptance checklist | Blocked by hosting/DNS access |

## Production decisions still required

Current PI/receipt numbering policy, approved GST/SAC/place-of-supply matrix, legal addresses, bank accounts, signature authority, asset approval, SendGrid credentials/domain authentication, hosting/DNS access, retention rules, and accountant-approved receipt/correction/FX policies. The application must keep issuance or sending gated where these are absent.
