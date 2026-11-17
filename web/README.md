# Futurex Finance Portal

Secure Next.js/PostgreSQL finance portal for Futurex. The application requires Node.js `>=24.22.3 <25`, PostgreSQL, and persistent private-file storage.

## Local development

```powershell
Copy-Item .env.example .env
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Open `http://localhost:3000`. Keep `PRIVATE_STORAGE_BACKEND=filesystem` locally and point `PRIVATE_STORAGE_ROOT` to a restricted persistent directory.

## Vercel deployment

Deploy this `web` directory as the Vercel project root. Connect a pooled managed PostgreSQL database and a **Private** Vercel Blob store. Set `PRIVATE_STORAGE_BACKEND=vercel-blob`; Blob credentials are injected by the connected store. Apply Prisma migrations from a trusted one-off deployment job before serving traffic. Do not run the application against an empty or unmigrated database.

Required production values include `DATABASE_URL`, `APP_ORIGIN`, `LOGIN_ID_DOMAIN`, a fresh `MFA_ENCRYPTION_KEY`, and the SendGrid variables described in `.env.example`. Never commit real values. Keep Admin MFA flags disabled until enrollment and recovery have been verified.

Before release:

```powershell
npm run prisma:generate
npm test
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=low
```

See `../docs/DEPLOY.md` and `../docs/security/GO-LIVE-CHECKLIST.md` for the controlled-deployment procedure and remaining statutory/operational gates.
