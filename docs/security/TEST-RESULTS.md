# Security test results

Date: 2026-11-17

| Check | Result |
| --- | --- |
| Focused request/header/proof/database-guard tests | PASS — 4 files, 11 tests |
| Full unit suite: `npm test -- --run` | PASS — 26 files, 100 tests |
| TypeScript: `npm run typecheck` | PASS |
| ESLint: `npm run lint` | PASS |
| PostgreSQL integration via guarded `futurex_test` | PASS — 2 files, 15 tests |
| `npm audit --omit=dev --audit-level=low` | PASS — 0 vulnerabilities |
| `npm audit --audit-level=low` | PASS — 0 vulnerabilities |
| Destructive-target negative probes | PASS — production-looking restore exited 1; integration exited 2 before connecting |
| Isolated backup restore | PASS — latest dump restored to `futurex_restore_test`, 1 organization and 11 finished migrations verified, then disposable database removed |
| Isolated HTTP QA on port 3100 / `futurex_test` | PASS — login 200, health 200, cross-origin login 403, unauthenticated proof 401; CSP/COOP/CORP/frame headers present |
| Production build on bundled Node 24.22.1 | PASS — 42 routes generated with Next.js 16.4.6 |
| Required `npm run build` on installed Node 24.20.0 | FAIL — framework compilation passed, process exited during Next TypeScript worker without a diagnostic; standalone `tsc` passes |
| Docker build / Compose runtime | BLOCKED — Docker executable unavailable |

The build failure is treated as a go-live blocker, not hidden by the successful alternate-runtime build. Install approved Node 24.22.3 or newer compatible 24.x, then rerun the exact final command set.

## Phase 2 pre-change host baseline

Captured before the approved runtime/ACL changes on 2026-11-17:

- Windows identity: `ASUS\shasw`; this is the actual interactive application identity. No Futurex/Node Windows service or scheduled task exists.
- Installed Node: `v24.20.0`, npm `11.19.0`, executable `C:\Program Files\nodejs\node.exe`; Windows Installer product `{DC5BBE4F-0668-40DC-A913-83710DA79E35}`.
- No Node process and no listener on ports 3000/3100 was running, so the upgrade requires no portal downtime. PostgreSQL alone was listening on 5432.
- `npm ls --depth=0` completed successfully; the application remains on Next.js 16.4.6, React 19.3.0 and Prisma 7.10.1. `package-lock.json` SHA-256 before the host change: `D8C9A6D9C1E2CA0DF716995268DA486C3730AC84C4D80E6A07C5CD83EB27A2CD`.
- `.env`, `.runtime/private`, `backups` and `TEAM-LOGINS-CONFIDENTIAL.txt` were owned by `ASUS\shasw` but inherited access for `BUILTIN\Users` and `NT AUTHORITY\Authenticated Users`.

Rollback procedure: keep official, checksum- and Authenticode-verified Node 24.20.0 and 24.22.3 x64 MSI files in the restricted hardening rollback directory. If compatibility fails, stop only the Futurex Node process, reinstall 24.20.0 silently with `msiexec`, verify `node --version`, restore saved ACL descriptors with `icacls /restore`, reinstall exact lockfile dependencies with `npm ci`, rerun the isolated tests/build, and start the portal only after health/login checks pass. Database rollback is not involved because this phase performs no production migration or financial write.

## Phase 2 final verification

| Check | Result |
| --- | --- |
| Official Node 24.22.3 integrity | PASS — SHA-256 matched official sums; `node.exe` Authenticode valid/OpenJS Foundation |
| Runtime selection | PASS — production process executable is the restricted 24.22.3 runtime |
| Secret/private/backup/login ACLs | PASS — only `ASUS\shasw`, Administrators and SYSTEM; no broad or empty child ACLs |
| Private document access | PASS — application identity read the approved private asset after hardening |
| Final restricted backup | PASS — `backups/final-handoff/futurex-20261117-160559.dump`, SHA-256 `DEDECAEE3F61F2AD6220EA5F5924B75956E606A78C8A504E07880E38F33B2A14` |
| Isolated restore drill | PASS — restored organization and 11 migrations, then reset/re-migrated the disposable `futurex_test` database |
| TypeScript / ESLint | PASS / PASS |
| Unit tests | PASS — 27 files, 104 tests |
| PostgreSQL integration | PASS — 2 files, 15 tests |
| Production build | PASS — Next.js 16.4.6, 42 routes, Node 24.22.3 |
| Dependency audit | PASS — 0 known vulnerabilities |
| Production HTTP smoke | PASS — login 200, health 200, unauthenticated private proof 401; database counts unchanged by probes |
| Demo cleanup | PASS — 2 unnumbered drafts removed; issued/voided records preserved; 13 users and password hashes unchanged |
| Admin MFA preparation | PASS — TOTP vector, encrypted secret, recovery-code and disabled-rollout tests (4/4); production activation intentionally deferred |
| Sanitized ZIP reproducibility | PASS — forbidden-entry/secret scan, fresh `npm ci` (0 vulnerabilities), Prisma generation, TypeScript and 42-route production build from extracted archive |
| Docker image/volume restart | BLOCKED — Docker Engine unavailable on this host |

The Windows MSI install returned 1603 because Smart App Control blocked an extracted installer DLL. Smart App Control was preserved; the checksum- and signature-verified official ZIP runtime is the active application runtime. The production database still has 11 migrations because the MFA migration is deliberately unapplied until enrollment and recovery are approved.
