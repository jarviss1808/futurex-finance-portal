# Architectural decisions

## Confirmed

- Next.js/TypeScript web application with PostgreSQL and Prisma.
- Authentication uses database-backed opaque sessions stored as SHA-256 hashes; passwords use a memory-hard/salted password hash. Cookies are HttpOnly, Secure in production, SameSite=Lax.
- Authorization is server-side and default-deny. Record queries always include organization scope plus ownership/share policy unless the actor is accountant/admin.
- Money is represented as integer paise across request validation, persistence, calculations, exports, and snapshots.
- Issuance uses a PostgreSQL transaction and atomic `UPDATE ... RETURNING` counter allocation backed by unique constraints.
- Issued documents store immutable JSON snapshots and are not updated in place.
- Proforma Invoice TDS is a manual paise amount only (default zero). Gross PI value, manual TDS and net receivable remain separate; TDS is not a verified cash collection.
- An issued Proforma Invoice may be corrected exactly once using a second immutable effective snapshot with the exact same PI number and an internal audit version. The original snapshot remains unchanged, no new number is consumed, and pending/verified payments block correction. This does not apply to Tax Invoices.
- GSTIN assistance links only to the official Government Taxpayer Search. Local checksum validation and an explicit human confirmation record the official source, time and user; the application does not scrape or bypass CAPTCHA.
- Payment allocations are explicit rows; only verified, non-reversed cash payments are allocatable and counted as collections. A payment allocation may also carry a manually entered TDS-deducted amount for reconciliation against the PI's manual TDS. Pending TDS remains unconfirmed, verified TDS is reported separately from cash, and neither reduces outstanding a second time because PI outstanding already starts from net receivable.
- Private generated files live outside the public web root and are served only by an authorized download handler.
- E-invoice finalization is blocked unless applicability is resolved and either a verified IRP response/import exists or e-invoicing is explicitly marked not applicable by an authorized accountant.

## Pending business confirmation

- Number-series formats and prefix meanings.
- Tax rules, place-of-supply matrices, and exemptions.
- Approved statutory templates, seal/signature, banking data, retention policy, Tally mappings, and e-invoice provider.
