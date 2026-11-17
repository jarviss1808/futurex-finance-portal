# Futurex Finance Portal rules

- Treat `docs/FACTS.md` as the verified business-fact source; do not reinterpret reference PDFs during routine work.
- Enforce employee ownership and explicit sharing in every server-side query, mutation, export, and file download. UI hiding is never authorization.
- Accountants and admins may access company-wide financial records; all other privileges are explicit and default-deny.
- Use integer paise or `Decimal` for money. Never use floating-point arithmetic for financial values.
- Issue numbers only inside a database transaction using an atomic counter and a uniqueness constraint. Issued and voided numbers are never reused.
- Issued financial documents are immutable snapshots. Corrections use revision, credit/debit note, reversal, or void workflows.
- Only verified payments affect receipts, collections, allocations, or outstanding balances.
- Never fabricate IRN, acknowledgement data, QR codes, tax treatment, signatures, or statutory configuration.
- Keep changes narrow, add regression tests for defects, and run affected tests plus the production build.
- Never commit secrets, customer production data, or generated private documents.
